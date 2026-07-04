import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
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
const DATA_SCHEMA_VERSION = 4;
const SEI_AGENT = new Agent({
  connect: {
    timeout: 30_000,
  },
});

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
      if (!response.ok) {
        throw new Error(`Consulta falhou: HTTP ${response.status}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.error(
          `SEI indisponível na tentativa ${attempt}/${attempts}; tentando novamente.`,
        );
        await new Promise((resolvePromise) =>
          setTimeout(resolvePromise, attempt * 5_000),
        );
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
      return `${href} ${onclick}`.includes(
        "md_pesq_documento_consulta_externa.php",
      );
    });

  if (!link.length) return null;
  const href = link.attr("href");
  if (href?.includes("md_pesq_documento_consulta_externa.php")) {
    return new URL(href, SEI_BASE).href;
  }

  const onclick = link.attr("onclick") || "";
  const match = onclick.match(
    /window\.open\(['"](?<url>md_pesq_documento_consulta_externa\.php\?[^'"]+)['"]\)/,
  );
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
    const dateTime = rowText.match(
      /\b\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?\b/,
    )?.[0];
    const unit = cells.find((cell) => /^[A-ZÇ]+\/[A-ZÇ]+$/.test(cell));
    if (!dateTime || !unit) return;

    const unitIndex = cells.findIndex((cell) => cell === unit);
    result.push({
      dateTime,
      unit,
      description:
        cells.slice(unitIndex + 1).join(" ") || "Movimentação registrada",
    });
  });

  if (!result.length) {
    throw new Error("Lista de andamentos não encontrada no SEI");
  }
  return result;
}

function coreText(html, number) {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return clean($("body").text())
    .replace(new RegExp(`^.*?${number}\\s*[-–]\\s*`, "i"), "")
    .replace(/Documento assinado eletronicamente por.*$/i, "")
    .slice(0, 2400)
    .trim();
}

async function enrichDocuments(documents, previous) {
  const previousByNumber = new Map(
    (previous?.documents || []).map((document) => [document.number, document]),
  );
  const recentNumbers = new Set(documents.slice(-18).map((item) => item.number));
  const enriched = [];

  for (const document of documents) {
    const old = previousByNumber.get(document.number);
    if (!recentNumbers.has(document.number)) {
      enriched.push({ ...document, excerpt: old?.excerpt || "" });
      continue;
    }
    if (old?.excerpt && old.publicUrl === document.publicUrl) {
      enriched.push({ ...document, excerpt: old.excerpt });
      continue;
    }
    if (!document.publicUrl) {
      enriched.push({ ...document, excerpt: "" });
      continue;
    }

    try {
      const html = await fetchText(document.publicUrl, 30_000);
      enriched.push({
        ...document,
        excerpt: coreText(html, document.number),
      });
    } catch {
      enriched.push({ ...document, excerpt: old?.excerpt || "" });
    }
  }

  return enriched;
}

function explainDocument(document) {
  if (!document.publicUrl) {
    return "O documento foi criado, mas seu conteúdo ainda não está liberado para leitura pública.";
  }

  const text = (document.excerpt || "").toLowerCase();
  if (
    text.includes("rioprevidência") &&
    (text.includes("207,02") || text.includes("r$ 207"))
  ) {
    return "Este é o parecer orçamentário mais importante até agora. Ele não nega o pedido: aponta um custo de cerca de R$ 207,02 milhões por ano e mostra que os órgãos não têm folga no orçamento atual. Agora o governo precisa decidir como financiar ou ajustar a proposta.";
  }
  if (text.includes("207,02") || text.includes("r$ 207")) {
    return "A área de pessoal atualizou o cálculo do enquadramento para aproximadamente R$ 207,02 milhões por ano e devolveu o processo ao orçamento.";
  }
  if (text.includes("não há disponibilidade orçamentária")) {
    return "O documento informa que, naquele momento, o órgão não encontrou dinheiro disponível no próprio orçamento para atender integralmente ao pedido.";
  }
  if (
    text.includes("autoriza o prosseguimento") ||
    text.includes("acolho o encaminhamento")
  ) {
    return "A autoridade concordou com o encaminhamento e autorizou que o processo continuasse.";
  }
  if (
    text.includes("conhecimento e providências") ||
    text.includes("conhecimento e as providências")
  ) {
    return "É um despacho de encaminhamento: o setor recebeu as informações e enviou o processo para a área responsável pelas próximas providências. Não é aprovação final.";
  }
  if (text.includes("restituo") || text.includes("retorno")) {
    return "O setor respondeu ao que havia sido solicitado e devolveu o processo para continuidade da análise.";
  }
  if (text.includes("encaminho")) {
    return "O documento envia o processo para outro setor analisar ou tomar providências. Sozinho, esse ato não significa aprovação.";
  }
  return `Documento produzido por ${document.unit}. A explicação completa depende da leitura do trecho oficial abaixo.`;
}

function phaseFor(unit = "") {
  if (unit.includes("SUPEFIS")) {
    return {
      title: "Análise fiscal",
      explanation:
        "A área de estudos fiscais avalia capacidade financeira, limites e condições para implantação.",
      nextSteps: [
        "Despacho fiscal",
        "Retorno à estrutura de orçamento",
        "Decisão superior da SEPLAG",
      ],
    };
  }
  if (unit.includes("SUBORC") || unit.includes("SUBAORC")) {
    return {
      title: "Aguardando decisão sobre o dinheiro",
      explanation:
        "Os cálculos foram concluídos. Agora o setor de Orçamento precisa dizer se há dinheiro, remanejamento possível ou necessidade de ajustar a proposta.",
      nextSteps: [
        "Indicar de onde virá o dinheiro",
        "Propor implantação por etapas ou pedir ajustes",
        "Encaminhar a decisão para os gabinetes responsáveis",
      ],
    };
  }
  if (unit.includes("SUBGEP") || unit.includes("SUPDP")) {
    return {
      title: "Gestão de pessoas",
      explanation:
        "A área de pessoal analisa vínculos, enquadramento, quantitativos e repercussão na folha.",
      nextSteps: [
        "Validar os cálculos",
        "Retornar ao orçamento",
        "Solicitar eventual ajuste",
      ],
    };
  }
  if (
    unit.includes("CHEGAB") ||
    unit.includes("GABSEC") ||
    unit.includes("PRESI")
  ) {
    return {
      title: "Decisão administrativa superior",
      explanation:
        "O processo chegou a gabinete ou presidência para definição do encaminhamento seguinte.",
      nextSteps: [
        "Despacho da autoridade",
        "Encaminhamento jurídico ou à Casa Civil",
        "Definição do instrumento final",
      ],
    };
  }
  if (unit.includes("ARQDOC")) {
    return {
      title: "Arquivo e documentação",
      explanation:
        "É necessário ler o despacho anterior para saber se houve guarda temporária, conclusão ou arquivamento.",
      nextSteps: [
        "Verificar o motivo formal",
        "Distinguir conclusão de sobrestamento",
        "Acompanhar eventual reabertura",
      ],
    };
  }
  return {
    title: "Tramitação administrativa",
    explanation:
      "O processo continua em análise dentro da administração estadual.",
    nextSteps: ["Novo despacho", "Remessa técnica", "Decisão superior"],
  };
}

function movementInPlainLanguage(movement) {
  if (!movement) return "Não foi encontrada uma movimentação recente.";

  const description = movement.description.toLowerCase();
  const origin = movement.description.match(
    /unidade\s+([A-ZÇ]+\/[A-ZÇ]+)/i,
  )?.[1];

  if (description.includes("processo remetido") && origin) {
    return `Em ${movement.dateTime}, o processo saiu de ${origin} e foi enviado para ${movement.unit}.`;
  }
  if (description.includes("processo recebido")) {
    return `Em ${movement.dateTime}, o processo chegou ao setor ${movement.unit}.`;
  }
  if (description.includes("reabertura")) {
    return `Em ${movement.dateTime}, o processo foi reaberto no setor ${movement.unit}.`;
  }
  if (description.includes("conclusão")) {
    return `Em ${movement.dateTime}, o setor ${movement.unit} encerrou sua etapa de análise. Isso não significa que todo o processo terminou.`;
  }
  return `Em ${movement.dateTime}, houve nova movimentação no setor ${movement.unit}: ${movement.description}.`;
}

function readLatestDocument(document) {
  if (!document) {
    return {
      summary: "Ainda não apareceu um novo despacho público para explicar.",
      signal: "",
      risk: "É necessário aguardar o próximo documento ou movimento.",
    };
  }
  if (!document.publicUrl || !document.excerpt) {
    return {
      summary: `Também foi criado o documento ${document.number}, mas seu texto ainda não está aberto ao público. Por enquanto, não é possível saber se ele aprova, corrige ou apenas encaminha o pedido.`,
      signal: `O novo documento ${document.number} já aparece na lista oficial do processo.`,
      risk: "O conteúdo do documento mais recente ainda precisa ser liberado para uma conclusão segura.",
    };
  }

  const text = document.excerpt.toLowerCase();
  if (text.includes("arquiv")) {
    return {
      summary: `O documento ${document.number} menciona arquivamento. É um sinal de alerta e será necessário verificar se o encerramento é definitivo, temporário ou apenas referente a uma etapa.`,
      signal: "O texto do despacho está aberto e permite identificar a decisão tomada.",
      risk: "A menção a arquivamento pode significar paralisação ou encerramento do pedido.",
    };
  }
  if (text.includes("indefer")) {
    return {
      summary: `O documento ${document.number} contém indicação de indeferimento. Em linguagem simples, o pedido pode ter sido negado nessa etapa, embora ainda seja preciso verificar se cabe correção ou nova análise.`,
      signal: "O motivo da decisão pode ser conhecido pelo texto oficial.",
      risk: "Há sinal de negativa formal do pedido.",
    };
  }
  if (
    text.includes("autoriza o prosseguimento") ||
    text.includes("acolho o encaminhamento") ||
    text.includes("de acordo")
  ) {
    return {
      summary: `O documento ${document.number} concorda com o encaminhamento e permite que o processo continue. É um avanço, mas ainda não representa a aprovação final do enquadramento.`,
      signal: "Uma autoridade concordou com a continuidade da proposta.",
      risk: "Ainda podem faltar orçamento, análise jurídica ou decisão superior.",
    };
  }
  if (
    /(retific|corrig|complement|ajuste|saneamento|revisão)/.test(text)
  ) {
    return {
      summary: `O documento ${document.number} pede correção ou complementação das informações. Isso não encerra o pedido: o processo deve voltar ao setor responsável, ser ajustado e seguir novamente.`,
      signal: "O problema apontado pode ser corrigido dentro do próprio processo.",
      risk: "A correção pode atrasar a decisão se não for atendida rapidamente.",
    };
  }
  if (text.includes("não há disponibilidade orçamentária")) {
    return {
      summary: `O documento ${document.number} informa que o órgão não encontrou dinheiro disponível em seu orçamento atual. Isso não é o mesmo que declarar o pedido ilegal, mas exige remanejamento, implantação por etapas ou decisão política para avançar.`,
      signal: "O obstáculo foi identificado com clareza: falta indicar a fonte do dinheiro.",
      risk: "Sem solução orçamentária, o processo pode ficar parado ou voltar para ajustes.",
    };
  }
  if (
    text.includes("encaminho") ||
    text.includes("restituo") ||
    text.includes("providências")
  ) {
    return {
      summary: `O documento ${document.number} encaminha o processo para outro setor continuar a análise. Ele mostra que o pedido segue tramitando, mas não traz uma aprovação final.`,
      signal: "O processo foi enviado para novas providências, sem ordem de arquivamento.",
      risk: "Um simples encaminhamento não garante que a proposta será aceita.",
    };
  }

  return {
    summary: `O documento ${document.number} está aberto. Ele foi produzido por ${document.unit}, mas não contém palavras que indiquem aprovação, negativa ou arquivamento de forma clara. A leitura deve ser feita junto com o próximo movimento.`,
    signal: "O texto oficial do documento mais recente já pode ser consultado.",
    risk: "O despacho não apresenta uma decisão final de forma clara.",
  };
}

function buildAutomaticAnalysis(movements, documents) {
  const latest = movements[0];
  const latestDocument = documents.at(-1);
  const phase = phaseFor(latest?.unit);
  const latestText = (latestDocument?.excerpt || "").toLowerCase();
  const isCurrentBudgetReport =
    latestDocument?.number === "135635411" ||
    (latestText.includes("rioprevidência") &&
      latestText.includes("207,02"));
  const budgetReport = [...documents].reverse().find((document) => {
    const text = (document.excerpt || "").toLowerCase();
    return (
      document.number === "135635411" ||
      (text.includes("rioprevidência") && text.includes("207,02"))
    );
  });
  const numbers = budgetReport
    ? [
        {
          value: "R$ 207,02 milhões",
          label: "Custo total por ano",
          detail: "R$ 160,09 mi para ativos e R$ 46,93 mi para aposentados",
        },
        {
          value: "R$ 17,25 milhões",
          label: "Custo aproximado por mês",
          detail: "R$ 13,34 mi para ativos e R$ 3,91 mi para aposentados",
        },
        {
          value: "6.745 pessoas",
          label: "Total alcançado pela proposta",
          detail: "3.700 ativos e 3.045 aposentados",
        },
      ]
    : [];

  if (isCurrentBudgetReport) {
    return {
      mode: "automatic",
      phase,
      summary: `${movementInPlainLanguage(latest)} Agora o cenário ficou mais claro. O documento 135635411 não negou nem arquivou o pedido. Ele confirma o custo da proposta e mostra que os orçamentos atuais não têm folga para absorver tudo. Em outras palavras: o problema apontado agora é dinheiro, não uma decisão final contra os servidores. O processo voltou ao Orçamento para o governo decidir como pagar, ajustar ou implantar a medida.`,
      numbers,
      signals: [
        "O pedido continua vivo: o despacho não manda negar nem arquivar o processo.",
        "O custo estimado caiu de R$ 275,30 milhões em 2023 para R$ 207,02 milhões em 2026.",
        "A tese de que os cargos mantêm vínculo com a FAETEC continua registrada no processo.",
      ],
      risks: [
        "Os órgãos envolvidos já trabalham com orçamento apertado ou saldo projetado negativo.",
        "Sem indicar uma fonte de dinheiro, o governo pode pedir correções, dividir a implantação em etapas ou adiar a decisão.",
        "O despacho é uma análise financeira, não a aprovação final do enquadramento.",
      ],
    };
  }

  const movementSummary = movementInPlainLanguage(latest);
  const documentReading = readLatestDocument(latestDocument);
  const signals = [
    documentReading.signal,
    budgetReport
      ? "A análise anterior fixou o custo em R$ 207,02 milhões por ano; esse valor continua como referência até surgir novo cálculo."
      : "",
  ].filter(Boolean);
  const risks = [
    documentReading.risk,
    "Uma movimentação no SEI mostra que o processo andou, mas não significa aprovação por si só.",
  ].filter(Boolean);

  return {
    mode: "automatic",
    phase,
    summary: `${movementSummary} ${documentReading.summary}`,
    numbers,
    signals,
    risks,
  };
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

function sourceHash(documents, movements) {
  const publicState = documents.map((document) => [
    document.number,
    document.date,
    document.unit,
    document.type,
    Boolean(document.publicUrl),
  ]);
  return createHash("sha256")
    .update(JSON.stringify({ publicState, movements }))
    .digest("hex");
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
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: "low" },
      max_output_tokens: 850,
      input: [
        {
          role: "system",
          content:
            "Analise este processo administrativo em português brasileiro para pessoas leigas. Use frases simples, explique as siglas e evite linguagem jurídica sem tradução. Diferencie fatos, inferências e hipóteses. Explique situação atual, mudança recente, sinais positivos, riscos e próximos passos. Nunca trate movimentação como aprovação.",
        },
        { role: "user", content: openAiInput(data) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`OpenAI respondeu HTTP ${response.status}`);
  const payload = await response.json();
  return (
    payload.output_text ||
    payload.output
      ?.flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text ||
    null
  );
}

async function main() {
  const previous = await loadPrevious();
  let html;
  try {
    html = await fetchText(PROCESS_URL);
  } catch (error) {
    if (previous) {
      console.error(
        `O portal SEI não respondeu. Mantendo o último relatório válido: ${error.message}`,
      );
      return;
    }
    throw error;
  }
  const rawDocuments = parseDocuments(html);
  const movements = parseMovements(html);
  const hash = sourceHash(rawDocuments, movements);

  const needsAi =
    Boolean(process.env.OPENAI_API_KEY) &&
    previous?.analysis?.mode !== "openai";
  if (
    previous?.sourceHash === hash &&
    previous?.schemaVersion === DATA_SCHEMA_VERSION &&
    !needsAi
  ) {
    console.log("Nenhuma mudança pública desde a última atualização.");
    return;
  }

  const enrichedDocuments = await enrichDocuments(rawDocuments, previous);
  const documents = enrichedDocuments.map((document) => ({
    ...document,
    simpleExplanation: explainDocument(document),
  }));
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
    if (aiText) {
      data.analysis = { ...analysis, mode: "openai", aiText };
    }
  } catch (error) {
    console.error(`Análise por IA indisponível: ${error.message}`);
  }

  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(
    `Atualizado: ${movements.length} movimentos e ${documents.length} documentos.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
