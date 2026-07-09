import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = resolve(ROOT, "data", "processo.json");
const PROCESS_NUMBER = "SEI-030029/004475/2023";
const PROCESS_URL =
  "https://sei.rj.gov.br/sei/modulos/pesquisa/md_pesq_processo_exibir.php?IC2o8Z7ACQH4LdQ4jJLJzjPBiLtP6l2FsQacllhUf-duzEubalut9yvd8-CzYYNLu7pd-wiM0k633-D6khhQNbktnAd5iwonOrpJKmKvtZqQfhPRIZoJiTRfNxCUWV1x";
const SEI_BASE = "https://sei.rj.gov.br/sei/modulos/pesquisa/";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DATA_SCHEMA_VERSION = 7;
const EXCERPT_VERSION = 3;
const RECENT_DOCUMENTS_TO_RECHECK = 24;
const SEI_AGENT = new Agent({ connect: { timeout: 30_000 } });

function clean(value = "") {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(DATA_PATH, "utf8"));
  } catch {
    return null;
  }
}

async function fetchText(url, timeout = 60_000, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await undiciFetch(url, {
        dispatcher: SEI_AGENT,
        headers: {
          "User-Agent": "Mozilla/5.0 (Painel público FAEP-FAETEC)",
          Referer: PROCESS_URL,
        },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error(`Consulta falhou: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.error(`SEI indisponível na tentativa ${attempt}/${attempts}; tentando novamente.`);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 5_000));
      }
    }
  }
  throw lastError;
}

function documentUrl(row, $) {
  const link = $(row)
    .find("a")
    .filter((_, element) => {
      const href = $(element).attr("href") || "";
      const onclick = $(element).attr("onclick") || "";
      return `${href} ${onclick}`.includes("md_pesq_documento_consulta_externa.php");
    })
    .first();

  if (!link.length) return null;
  const href = link.attr("href");
  if (href?.includes("md_pesq_documento_consulta_externa.php")) {
    return new URL(href, SEI_BASE).href;
  }

  const onclick = link.attr("onclick") || "";
  const match = onclick.match(/window\.open\(['"](?<url>md_pesq_documento_consulta_externa\.php\?[^'"]+)['"]\)/);
  return match?.groups?.url ? new URL(match.groups.url, SEI_BASE).href : null;
}

function parseDocuments(html) {
  const marker = html.indexOf("Lista de Andamentos");
  const $ = cheerio.load(marker >= 0 ? html.slice(0, marker) : html);
  const result = [];
  const seen = new Set();

  $("tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => clean($(cell).text()))
      .get()
      .filter(Boolean);
    const rowText = cells.join(" | ");
    const number = rowText.match(/\b(\d{8,10})\b/)?.[1];
    const dates = rowText.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    const unit = cells.find((cell) => /^[A-ZÇ]+\/[A-ZÇ]+$/.test(cell));
    if (!number || !unit || seen.has(number)) return;

    seen.add(number);
    const numberIndex = cells.findIndex((cell) => cell.includes(number));
    const unitIndex = cells.findIndex((cell) => cell === unit);
    const type = cells
      .slice(numberIndex + 1, unitIndex)
      .find((cell) => !/^\d{2}\/\d{2}\/\d{4}$/.test(cell));

    result.push({
      number,
      type: type || "Documento",
      date: dates.at(-1) || dates[0] || "",
      unit,
      publicUrl: documentUrl(row, $),
    });
  });

  return result;
}

function parseMovements(html) {
  const $ = cheerio.load(html);
  const result = [];

  $("#tblHistorico tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => clean($(cell).text()))
      .get()
      .filter(Boolean);
    const rowText = cells.join(" | ");
    const dateTime = rowText.match(/\b\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?\b/)?.[0];
    const unit = cells.find((cell) => /^[A-ZÇ]+\/[A-ZÇ]+$/.test(cell));
    if (!dateTime || !unit) return;

    const unitIndex = cells.findIndex((cell) => cell === unit);
    result.push({
      dateTime,
      unit,
      description: cells.slice(unitIndex + 1).join(" ") || "Movimentação registrada",
    });
  });

  if (!result.length) throw new Error("Lista de andamentos não encontrada no SEI");
  return result;
}

function coreText(html, number) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return clean($("body").text())
    .replace(new RegExp(`^.*?${number}\\s*[-–]\\s*`, "i"), "")
    .replace(/Documento assinado eletronicamente por.*$/i, "")
    .slice(0, 12_000)
    .trim();
}

function shouldRefreshDocument(document, old, recentNumbers) {
  if (!recentNumbers.has(document.number)) return false;
  if (!document.publicUrl) return false;
  if (!old) return true;
  if (old.publicUrl !== document.publicUrl) return true;
  if (!old.excerpt) return true;
  if (old.excerptVersion !== EXCERPT_VERSION) return true;
  return false;
}

async function enrichDocuments(documents, previous) {
  const previousByNumber = new Map((previous?.documents || []).map((document) => [document.number, document]));
  const recentNumbers = new Set(documents.slice(-RECENT_DOCUMENTS_TO_RECHECK).map((item) => item.number));
  const enriched = [];

  for (const document of documents) {
    const old = previousByNumber.get(document.number);

    if (!recentNumbers.has(document.number)) {
      enriched.push({
        ...document,
        excerpt: old?.excerpt || "",
        excerptVersion: old?.excerptVersion || 1,
      });
      continue;
    }

    if (!document.publicUrl) {
      enriched.push({ ...document, excerpt: "", excerptVersion: EXCERPT_VERSION });
      continue;
    }

    if (!shouldRefreshDocument(document, old, recentNumbers)) {
      enriched.push({ ...document, excerpt: old.excerpt, excerptVersion: EXCERPT_VERSION });
      continue;
    }

    try {
      const html = await fetchText(document.publicUrl, 30_000);
      enriched.push({
        ...document,
        excerpt: coreText(html, document.number),
        excerptVersion: EXCERPT_VERSION,
      });
    } catch (error) {
      console.error(`Não foi possível ler o documento ${document.number}: ${error.message}`);
      enriched.push({
        ...document,
        excerpt: old?.excerpt || "",
        excerptVersion: old?.excerptVersion || 1,
      });
    }
  }

  return enriched;
}

function sourceHash(documents, movements) {
  const publicState = documents.map((document) => [
    document.number,
    document.date,
    document.unit,
    document.type,
    document.publicUrl || "",
  ]);
  return createHash("sha256").update(JSON.stringify({ publicState, movements })).digest("hex");
}

function hasRecentDocumentNeedingRead(rawDocuments, previous) {
  const previousByNumber = new Map((previous?.documents || []).map((document) => [document.number, document]));
  const recentNumbers = new Set(rawDocuments.slice(-RECENT_DOCUMENTS_TO_RECHECK).map((item) => item.number));
  return rawDocuments.some((document) => shouldRefreshDocument(document, previousByNumber.get(document.number), recentNumbers));
}

function explainDocument(document) {
  if (!document.publicUrl) return "O documento foi criado, mas seu conteúdo ainda não está liberado para leitura pública.";
  const text = (document.excerpt || "").toLowerCase();
  if (!document.excerpt) return "O documento já possui link público, mas o painel ainda não conseguiu extrair seu texto.";
  if (text.includes("207,02") || text.includes("r$ 207") || text.includes("rioprevid")) {
    return "Este é um despacho orçamentário importante: confirma o impacto financeiro da proposta e trata da capacidade do Estado para absorver a despesa.";
  }
  if (text.includes("não há disponibilidade orçamentária") || text.includes("nao ha disponibilidade orcamentaria")) {
    return "O documento aponta problema de disponibilidade orçamentária. Isso é obstáculo financeiro, não necessariamente negativa jurídica do pedido.";
  }
  if (text.includes("de acordo") || text.includes("prosseguimento") || text.includes("acolho")) {
    return "O documento tem linguagem de continuidade. É positivo para tramitação, mas não equivale à aprovação final.";
  }
  if (text.includes("encaminho") || text.includes("providências") || text.includes("providencias")) {
    return "É despacho de encaminhamento: manda o processo para outro setor tomar ciência ou providências. Sozinho, não aprova nem nega.";
  }
  if (text.includes("restituo") || text.includes("retorno")) {
    return "O setor respondeu ao que foi solicitado e devolveu o processo para continuidade da análise.";
  }
  if (text.includes("arquiv")) return "O documento menciona arquivamento; é preciso verificar se é definitivo, temporário ou apenas conclusão de etapa.";
  if (text.includes("indefer")) return "O documento contém indicação de indeferimento; exige leitura cuidadosa do fundamento e das possibilidades de correção.";
  return `Documento produzido por ${document.unit}. A leitura deve ser combinada com o movimento seguinte do SEI.`;
}

function phaseFor(unit = "") {
  if (unit.includes("SUPOF")) {
    return {
      title: "Análise orçamentária na Educação",
      explanation: "O processo chegou à área de orçamento/planejamento financeiro da SEEDUC, que pode avaliar impacto, fonte de recursos e viabilidade dentro da pasta.",
      nextSteps: ["Manifestação técnica da SEEDUC", "Resposta à chefia de gabinete", "Retorno à SEPLAG ou encaminhamento superior"],
    };
  }
  if (unit.includes("SUPEFIS")) {
    return {
      title: "Análise fiscal",
      explanation: "A área de estudos fiscais avalia capacidade financeira, limites e condições para implantação.",
      nextSteps: ["Despacho fiscal", "Retorno à estrutura de orçamento", "Decisão superior da SEPLAG"],
    };
  }
  if (unit.includes("SUBORC") || unit.includes("SUBAORC")) {
    return {
      title: "Análise orçamentária",
      explanation: "O setor de Orçamento avalia se há fonte de recursos, remanejamento possível ou necessidade de ajustar a proposta.",
      nextSteps: ["Indicar fonte", "Propor implantação por etapas", "Encaminhar para decisão superior"],
    };
  }
  if (unit.includes("SUBGEP") || unit.includes("SUPDP")) {
    return {
      title: "Gestão de pessoas",
      explanation: "A área de pessoal analisa vínculos, enquadramento, quantitativos e repercussão na folha.",
      nextSteps: ["Validar cálculos", "Retornar ao orçamento", "Solicitar ajuste"],
    };
  }
  if (unit.includes("CHEGAB") || unit.includes("GABSEC") || unit.includes("PRESI")) {
    return {
      title: "Decisão administrativa superior",
      explanation: "O processo chegou a gabinete ou presidência para definição do encaminhamento seguinte.",
      nextSteps: ["Despacho da autoridade", "Encaminhamento jurídico ou político", "Definição do instrumento final"],
    };
  }
  return {
    title: "Tramitação administrativa",
    explanation: "O processo continua em análise dentro da administração estadual.",
    nextSteps: ["Novo despacho", "Remessa técnica", "Decisão superior"],
  };
}

function movementInPlainLanguage(movement) {
  if (!movement) return "Não foi encontrada uma movimentação recente.";
  const description = movement.description.toLowerCase();
  const origin = movement.description.match(/unidade\s+([A-ZÇ]+\/[A-ZÇ]+)/i)?.[1];
  if (description.includes("processo remetido") && origin) {
    return `Em ${movement.dateTime}, o processo saiu de ${origin} e foi enviado para ${movement.unit}.`;
  }
  if (description.includes("processo recebido")) return `Em ${movement.dateTime}, o processo chegou ao setor ${movement.unit}.`;
  if (description.includes("reabertura")) return `Em ${movement.dateTime}, o processo foi reaberto no setor ${movement.unit}.`;
  if (description.includes("conclus")) return `Em ${movement.dateTime}, o setor ${movement.unit} encerrou sua etapa de análise. Isso não significa que todo o processo terminou.`;
  return `Em ${movement.dateTime}, houve nova movimentação no setor ${movement.unit}: ${movement.description}.`;
}

function latestDocumentReading(document) {
  if (!document) {
    return {
      summary: "Ainda não apareceu um despacho público para explicar.",
      signal: "",
      risk: "É necessário aguardar o próximo documento ou movimento.",
    };
  }
  if (!document.publicUrl || !document.excerpt) {
    return {
      summary: `Também foi criado o documento ${document.number}, mas seu texto ainda não está aberto ou não foi extraído pelo painel.`,
      signal: `O documento ${document.number} aparece na lista oficial do processo.`,
      risk: "Sem o texto do despacho, não é seguro afirmar aprovação, negativa ou exigência.",
    };
  }
  const text = document.excerpt.toLowerCase();
  if (text.includes("arquiv")) {
    return {
      summary: `O documento ${document.number} menciona arquivamento. É preciso verificar se o encerramento é definitivo, temporário ou apenas de etapa.`,
      signal: "O texto do despacho está aberto e permite identificar a decisão tomada.",
      risk: "A menção a arquivamento pode indicar paralisação ou encerramento do pedido.",
    };
  }
  if (text.includes("indefer")) {
    return {
      summary: `O documento ${document.number} contém indicação de indeferimento. O pedido pode ter sido negado nessa etapa, embora ainda seja preciso verificar se cabe correção ou nova análise.`,
      signal: "O motivo da decisão pode ser conhecido pelo texto oficial.",
      risk: "Há sinal de negativa formal do pedido.",
    };
  }
  if (text.includes("de acordo") || text.includes("acolho") || text.includes("prosseguimento")) {
    return {
      summary: `O documento ${document.number} permite a continuidade do processo. É avanço de tramitação, mas não publicação final do enquadramento.`,
      signal: "A autoridade ou setor concordou com a continuidade do encaminhamento.",
      risk: "Ainda podem faltar orçamento, análise jurídica ou decisão superior.",
    };
  }
  if (text.includes("encaminho") || text.includes("providências") || text.includes("providencias")) {
    return {
      summary: `O documento ${document.number} encaminha o processo para outro setor continuar a análise. Mostra movimentação, mas não aprovação final.`,
      signal: "O processo foi enviado para novas providências, sem sinal público de arquivamento no trecho lido.",
      risk: "Um simples encaminhamento não garante que a proposta será aceita.",
    };
  }
  return {
    summary: `O documento ${document.number} está aberto, mas não contém palavra clara de aprovação, negativa ou arquivamento. A leitura deve ser feita junto com o destino do processo.`,
    signal: "O texto oficial já pode ser consultado.",
    risk: "O despacho não apresenta decisão final de forma clara.",
  };
}

function budgetNumbers(documents) {
  const budgetReport = [...documents].reverse().find((document) => {
    const text = (document.excerpt || "").toLowerCase();
    return document.number === "135635411" || (text.includes("rioprevid") && text.includes("207,02"));
  });
  if (!budgetReport) return [];
  return [
    { value: "R$ 207,02 milhões", label: "Custo total por ano", detail: "R$ 160,09 mi para ativos e R$ 46,93 mi para aposentados" },
    { value: "R$ 17,25 milhões", label: "Custo aproximado por mês", detail: "R$ 13,34 mi para ativos e R$ 3,91 mi para aposentados" },
    { value: "6.745 pessoas", label: "Total alcançado pela proposta", detail: "3.700 ativos e 3.045 aposentados" },
  ];
}

function buildAutomaticAnalysis(movements, documents) {
  const latest = movements[0];
  const latestDocument = documents.at(-1);
  const phase = phaseFor(latest?.unit);
  const documentReading = latestDocumentReading(latestDocument);
  const numbers = budgetNumbers(documents);
  const summary = `${movementInPlainLanguage(latest)} ${documentReading.summary}`;
  const signals = [
    documentReading.signal,
    numbers.length ? "A estimativa mais recente de impacto continua em R$ 207,02 milhões por ano até surgir novo cálculo." : "",
  ].filter(Boolean);
  const risks = [
    documentReading.risk,
    "Movimentação no SEI mostra que o processo andou, mas não significa aprovação por si só.",
  ].filter(Boolean);
  return { mode: "automatic", phase, summary, numbers, signals, risks };
}

function historicalSections(latestMovement, latestDocument) {
  return [
    {
      period: "Origem",
      text: "Os servidores ingressaram por concurso da antiga FAEP. Após reorganizações administrativas, permaneceram em exercício na SEEDUC, enquanto a categoria sustenta que o vínculo jurídico e a evolução funcional deveriam acompanhar a estrutura da FAETEC.",
    },
    {
      period: "2010 a 2022",
      text: "A Lei estadual 5.766/2010 transferiu determinados servidores da SEEDUC para a FAETEC, mas não resolveu automaticamente todo o grupo ex-FAEP. Em 2022, uma proposta de extensão foi aprovada pela ALERJ, mas acabou vetada porque esse tipo de proposta precisava ter sido apresentado pelo governador.",
    },
    {
      period: "2023",
      text: "Foi aberto o processo SEI-030029/004475/2023 para examinar a regularização funcional e remuneratória. Os estudos iniciais trabalharam com impacto anual próximo de R$ 275,30 milhões.",
    },
    {
      period: "Abril a junho de 2026",
      text: "O processo recebeu Nota Técnica, justificativa e minuta de projeto de lei. A tese técnica reconheceu a permanência do vínculo originário com a FAETEC. O impacto anual foi atualizado para R$ 207,02 milhões, abrangendo 3.700 ativos e 3.045 aposentados.",
    },
    {
      period: "Situação atual",
      text: `O registro público mais recente é de ${latestMovement?.dateTime || "data não identificada"}, em ${latestMovement?.unit || "unidade não identificada"}. O documento mais recente é ${latestDocument?.number || "não identificado"}, de ${latestDocument?.unit || "unidade não identificada"}. Ainda não existe publicação definitiva do enquadramento.`,
    },
  ];
}

function openAiInput(data) {
  return JSON.stringify(
    {
      processo: PROCESS_NUMBER,
      movimentos: data.movements.slice(0, 20),
      documentos: data.documents.slice(-15).map((document) => ({
        numero: document.number,
        data: document.date,
        unidade: document.unit,
        tipo: document.type,
        trecho: document.excerpt,
      })),
      analiseAutomatica: data.analysis,
    },
    null,
    2,
  );
}

async function generateAiAnalysis(data) {
  if (!process.env.OPENAI_API_KEY) return null;
  const response = await undiciFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      max_output_tokens: 850,
      input: [
        {
          role: "system",
          content:
            "Analise este processo administrativo em português brasileiro para pessoas leigas. Use frases simples. Diferencie fatos, inferências e hipóteses. Explique situação atual, mudança recente, sinais positivos, riscos e próximos passos. Nunca trate movimentação como aprovação.",
        },
        { role: "user", content: openAiInput(data) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`OpenAI respondeu HTTP ${response.status}`);
  const payload = await response.json();
  return payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text || null;
}

async function main() {
  const previous = await loadPrevious();
  let html;
  try {
    html = await fetchText(PROCESS_URL);
  } catch (error) {
    if (previous) {
      console.error(`O portal SEI não respondeu. Mantendo o último relatório válido: ${error.message}`);
      return;
    }
    throw error;
  }

  const rawDocuments = parseDocuments(html);
  const movements = parseMovements(html);
  const hash = sourceHash(rawDocuments, movements);
  const needsAi = Boolean(process.env.OPENAI_API_KEY) && previous?.analysis?.mode !== "openai";
  const needsDocumentRead = hasRecentDocumentNeedingRead(rawDocuments, previous);

  if (previous?.sourceHash === hash && previous?.schemaVersion === DATA_SCHEMA_VERSION && !needsAi && !needsDocumentRead) {
    console.log("Nenhuma mudança pública desde a última atualização e nenhum despacho recente pendente de releitura.");
    return;
  }

  const enrichedDocuments = await enrichDocuments(rawDocuments, previous);
  const documents = enrichedDocuments.map((document) => ({ ...document, simpleExplanation: explainDocument(document) }));
  const latestMovement = movements[0];
  const latestDocument = documents.at(-1);
  const analysis = buildAutomaticAnalysis(movements, documents);
  const data = {
    schemaVersion: DATA_SCHEMA_VERSION,
    processNumber: PROCESS_NUMBER,
    officialUrl: PROCESS_URL,
    generatedAt: new Date().toISOString(),
    sourceHash: hash,
    movements,
    documents,
    analysis,
    history: historicalSections(latestMovement, latestDocument),
  };

  try {
    const aiText = await generateAiAnalysis(data);
    if (aiText) data.analysis = { ...analysis, mode: "openai", aiText };
  } catch (error) {
    console.error(`Análise por IA indisponível: ${error.message}`);
  }

  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Atualizado: ${movements.length} movimentos e ${documents.length} documentos.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
