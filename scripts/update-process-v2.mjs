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
const DATA_SCHEMA_VERSION = 17;
const EXCERPT_VERSION = 4;
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
      const separator = url.includes("?") ? "&" : "?";
      const requestUrl = `${url}${separator}_=${Date.now()}-${attempt}`;
      const response = await undiciFetch(requestUrl, {
        dispatcher: SEI_AGENT,
        headers: {
          "User-Agent": "Mozilla/5.0 (Painel público FAEP-FAETEC)",
          Referer: PROCESS_URL,
          "Cache-Control": "no-cache, no-store, max-age=0",
          Pragma: "no-cache",
        },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new Error(`Consulta falhou: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "";
      const encoding = /charset=(?:iso-8859-1|latin1)/i.test(contentType)
        ? "iso-8859-1"
        : "utf-8";
      return new TextDecoder(encoding).decode(bytes);
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
    const unit = cells.find((cell) => /^[A-ZÇ]+(?:\/[A-ZÇ0-9]+)+$/.test(cell));
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
    const unit = cells.find((cell) => /^[A-ZÇ]+(?:\/[A-ZÇ0-9]+)+$/.test(cell));
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
    .slice(0, 30_000)
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
  if (!document.publicUrl) {
    if (document.number === "139134917" || document.unit?.includes("SECEXEC/PROPAG")) {
      return "A PGE já registrou este despacho, mas o texto ainda está fechado. A abertura pública está prevista para a meia-noite.";
    }
    return "O documento foi criado, mas seu conteúdo ainda não está liberado para leitura pública.";
  }
  const text = (document.excerpt || "").toLowerCase();
  if (!document.excerpt) return "O documento já possui link público, mas o painel ainda não conseguiu extrair seu texto.";
  if (document.number === "139134917") {
    return "A PGE esclareceu que o PROPAG não é o instrumento neste formato. O processo não foi arquivado: volta à FAETEC e os quesitos sobre lei seguem para a ASSJUR/SECTI.";
  }
  if (text.includes("propag") && (text.includes("vínculo jurídico") || text.includes("vinculo juridico") || text.includes("migração") || text.includes("migracao"))) {
    return "Ofício estratégico da FAETEC: pede parecer jurídico sobre a migração, necessidade de lei e possibilidade de uso do PROPAG para enfrentar a trava orçamentária.";
  }
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
  if (unit.includes("SECEXEC/PROPAG")) {
    return {
      title: "Na PGE para análise do PROPAG",
      explanation: "A PGE recebeu o processo para avaliar o caminho jurídico ligado ao PROPAG.",
      nextSteps: ["Manifestação da PGE", "Definição do caminho jurídico", "Retorno aos órgãos responsáveis"],
    };
  }
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
  const origin = movement.description.match(/unidade\s+([A-ZÇ]+(?:\/[A-ZÇ0-9]+)+)/i)?.[1];
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
  const numbers = budgetNumbers(documents);
  const recentDocuments = documents.slice(-12);
  const normalized = (value = "") =>
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const findRecent = (test) =>
    [...recentDocuments].reverse().find((document) => test(normalized(document.excerpt)));
  const budgetBlock = findRecent(
    (text) => text.includes("nao ha disponibilidade orcamentaria") || text.includes("sem disponibilidade orcamentaria"),
  );
  const archiveDocument = findRecent((text) => text.includes("arquiv"));
  const deniedDocument = findRecent((text) => text.includes("indefer"));
  const positiveDocument = findRecent(
    (text) => text.includes("de acordo") || text.includes("acolho") || text.includes("autorizo o prosseguimento"),
  );
  const strategicLegalDocument = findRecent(
    (text) =>
      text.includes("propag") &&
      (text.includes("vinculo juridico") || text.includes("vínculo jurídico") || text.includes("necessidade ou nao de lei") || text.includes("necessidade ou não de lei")) &&
      (text.includes("migracao") || text.includes("migração") || text.includes("transferencia") || text.includes("transferência")),
  );
  const propagReferral = recentDocuments.find(
    (document) =>
      document.number === "139135021" ||
      (normalized(document.excerpt).includes("secretaria executiva de apoio ao propag") &&
        normalized(document.excerpt).includes("encaminho")),
  );
  const atPropag = latest?.unit?.includes("SECEXEC/PROPAG");
  const pgeDispatch = [...documents].reverse().find(
    (document) =>
      document.number === "139134917" ||
      (document.unit?.includes("SECEXEC/PROPAG") && /despacho/i.test(document.type || "")),
  );
  const pgeDispatchClosed = Boolean(
    pgeDispatch && (!pgeDispatch.publicUrl || !pgeDispatch.excerpt),
  );
  const pgeDispatchOpen = Boolean(
    pgeDispatch && pgeDispatch.publicUrl && pgeDispatch.excerpt,
  );
  const pgeText = normalized(pgeDispatch?.excerpt || "");
  const latestReading = latestDocumentReading(latestDocument);

  let result = "O processo continua ativo e avançando, ainda sem decisão final.";
  let resultLevel = "neutral";
  let summary = `${movementInPlainLanguage(latest)} ${latestReading.summary}`;
  let practicalReading =
    "Há movimentação oficial, o que é positivo. Ainda não dá para falar em aprovação, mas também não há sinal de arquivamento.";
  let positive = latestReading.signal || "O processo continua vivo e com tramitação registrada no SEI.";
  let negative = latestReading.risk || "Ainda falta uma decisão expressa sobre o pedido.";
  let nextMovement = phase.nextSteps[0];
  let conclusion =
    "O processo segue aberto. Cada etapa cumprida aproxima a categoria de uma resposta oficial.";

  const pgeDispatchNegative =
    pgeDispatchOpen &&
    (pgeDispatch?.number === "139134917" ||
      (pgeText.includes("nao se vislumbra") && pgeText.includes("propag")));

  if (pgeDispatchNegative) {
    result = "O processo segue aberto e o segundo semestre é decisivo.";
    resultLevel = "positive";
    summary = `Em ${pgeDispatch.date || "17/08/2026"}, a PGE publicou o Despacho ${pgeDispatch.number} e esclareceu que o PROPAG não é o instrumento neste formato. Em 18/08/2026 o processo já voltou à Presidência da FAETEC, com atenção do governador Ricardo Couto e minuta na Casa Civil.`;
    practicalReading =
      "O cenário é favorável. Governo já atuou, a PGE deu clareza jurídica e o processo continua vivo. Os próximos meses são a janela para avançar nos vencimentos e formalizar a solução de modo estável, de preferência por lei do Executivo.";
    positive =
      "O governador recebeu a categoria, existe minuta na Casa Civil e a PGE não arquivou o processo.";
    negative =
      "Ainda falta publicar a migração no SEI e concluir o parecer da ASSJUR/SECTI.";
    nextMovement = "Continuidade na FAETEC, parecer da ASSJUR/SECTI e formalização política até o fim do ano";
    conclusion =
      "Leitura favorável: o atalho do PROPAG saiu, mas o caso ganhou caminho mais claro. Ainda não há publicação da migração, porém os próximos meses importam para consolidar a solução.";
    phase.title = "Caminho aberto após a PGE";
    phase.explanation =
      "A Procuradoria esclareceu o instrumento e devolveu o processo à FAETEC, sem encerrar o pedido.";
    phase.nextSteps = [
      "Continuidade na FAETEC",
      "Parecer da ASSJUR/SECTI sobre lei",
      "Formalização política até o fim do ano",
    ];
  } else if (atPropag && pgeDispatchClosed) {
    result = "A PGE já fez um despacho. O texto abre à meia-noite.";
    resultLevel = "positive";
    summary = `Em ${pgeDispatch.date || "17/08/2026"}, a área da PGE ligada ao PROPAG registrou o Despacho ${pgeDispatch.number}. O texto ainda está fechado e só deve abrir à meia-noite.`;
    practicalReading =
      "É um avanço concreto: a Procuradoria não deixou o processo parado. Como o despacho ainda está fechado, não dá para afirmar se é um encaminhamento interno, um pedido de informação ou um posicionamento jurídico. A leitura segura começa à meia-noite, quando o texto abrir.";
    positive =
      "Dois dias após o recebimento, a PGE já produziu um despacho oficial no processo.";
    negative =
      "Enquanto o conteúdo não abrir, não é possível saber se houve avanço de mérito ou apenas tramitação interna.";
    nextMovement = "Abertura pública do despacho da PGE à meia-noite e leitura do próximo destino do processo";
    conclusion =
      "O cenário continua positivo. A PGE já atuou. O próximo marco é a abertura do texto, prevista para a meia-noite.";
  } else if (atPropag && propagReferral) {
    result = "Bom avanço: o processo chegou à PGE. Ainda não há aprovação da migração.";
    resultLevel = "positive";
    summary =
      "Em 15/08/2026, a Assessoria Jurídica da SEEDUC enviou o processo à área da PGE que acompanha o PROPAG. A PGE registrou o recebimento no mesmo dia.";
    practicalReading =
      "Este é o melhor movimento recente do processo: o pedido chegou à área certa da Procuradoria. A PGE agora deve avaliar se o PROPAG pode ser usado e qual caminho jurídico seguir. O tom é positivo, mas ainda sem decisão final.";
    positive =
      "O processo saiu da análise interna da Educação e chegou formalmente à PGE/PROPAG.";
    negative =
      "Ainda faltam o parecer da PGE e uma solução para a questão orçamentária.";
    nextMovement = "Manifestação da PGE sobre a viabilidade jurídica e o uso do PROPAG";
    conclusion =
      "A etapa atual é promissora: o caso está na PGE. Não há aprovação publicada, mas também não há negativa nem arquivamento.";
  } else if (archiveDocument) {
    result = "O documento mais recente traz sinal de arquivamento e exige atenção imediata.";
    resultLevel = "critical";
    summary = `O documento ${archiveDocument.number} menciona arquivamento. É preciso conferir se ele encerra o pedido, apenas uma etapa ou uma unidade do processo.`;
    practicalReading = "Arquivamento pode significar paralisação ou encerramento. O efeito real depende das palavras exatas do despacho e da existência de remessa posterior.";
    positive = "O teor está público e permite identificar o fundamento usado pela administração.";
    negative = "Existe risco real de o processo ter sido interrompido ou encerrado.";
    nextMovement = "Verificar eventual reabertura, recurso, pedido de reconsideração ou nova remessa";
    conclusion = "Este é um sinal negativo. A prioridade passa a ser entender o tipo de arquivamento e a forma administrativa ou política de reverter a decisão.";
  } else if (deniedDocument) {
    result = "O documento traz sinal de negativa formal ao pedido.";
    resultLevel = "critical";
    summary = `O documento ${deniedDocument.number} contém linguagem de indeferimento. A decisão precisa ser lida junto com seu fundamento e com os movimentos posteriores.`;
    practicalReading = "A administração apresentou uma negativa nesta etapa. Isso pode exigir correção da proposta, reconsideração ou atuação política e jurídica.";
    positive = "O motivo oficial da negativa pode ser conhecido e enfrentado de forma objetiva.";
    negative = "Há uma manifestação contrária registrada no processo.";
    nextMovement = "Identificar se haverá reconsideração, correção da proposta ou encaminhamento superior";
    conclusion = "A situação ficou desfavorável, mas o efeito definitivo depende do fundamento e de eventual decisão superior posterior.";
  } else if (strategicLegalDocument) {
    result = "Etapa jurídica importante aberta: a FAETEC pediu parecer sobre lei e PROPAG.";
    resultLevel = "positive";
    summary = `O Ofício ${strategicLegalDocument.number}, da Presidência da FAETEC, pediu parecer à Assessoria Jurídica da Secretaria de Educação sobre dois pontos: se a migração exige lei e se o PROPAG pode ser usado. Em ${latest?.dateTime || "data não identificada"}, o processo foi recebido pela Assessoria Jurídica da Secretaria de Educação.`;
    practicalReading =
      "É um avanço real: a FAETEC formalizou as perguntas certas para destravar o caminho. O parecer ainda não é aprovação, mas coloca o caso em posição melhor do que uma simples espera sem rumo.";
    positive =
      "A FAETEC pediu formalmente uma solução jurídica e o processo seguiu aberto, sem arquivamento.";
    negative =
      "Ainda falta a resposta jurídica e uma solução para a restrição orçamentária já registrada.";
    nextMovement =
      "Parecer da Assessoria Jurídica da Secretaria de Educação ou encaminhamento à PGE";
    conclusion =
      "A fase é promissora: o processo deixou de ser apenas conta e passou a discutir caminho jurídico concreto. A aprovação ainda depende dos próximos despachos.";
  } else if (budgetBlock) {
    const movedToCabinet = latest?.unit?.includes("CHEGAB") || latestDocument?.unit?.includes("ASSUBEXE");
    const movedToFaetec = latest?.unit?.startsWith("FAETEC/");
    const movedToAssjurAfterFaetec =
      latest?.unit === "SEEDUC/ASSJUR" && normalized(latest?.description).includes("faetec/presi");
    const latestDocumentFromFaetec = latestDocument?.unit === "FAETEC/PRESI";
    const faetecUnitConclusion =
      movedToFaetec && normalized(latest?.description).includes("conclus");
    const latestDocumentClosed = latestDocument && (!latestDocument.publicUrl || !latestDocument.excerpt);
    const latestDocumentText = normalized(latestDocument?.excerpt);
    const faetecAskedToAnalyze =
      movedToFaetec &&
      !latestDocumentClosed &&
      latestDocumentText.includes("faetec") &&
      latestDocumentText.includes("analise e manifestacao");
    result = movedToAssjurAfterFaetec
      ? "O processo avançou para análise jurídica após manifestação da FAETEC, mas ainda depende de solução orçamentária."
      : "O documento é ruim para a categoria, mas não encerra o processo.";
    resultLevel = movedToAssjurAfterFaetec ? "neutral" : "warning";
    summary = movedToAssjurAfterFaetec
      ? `A FAETEC/PRESI criou o documento ${latestDocument?.number || "mais recente"} em ${latestDocument?.date || "data recente"} e, em ${latest?.dateTime}, o processo foi enviado para a SEEDUC/ASSJUR. O conteúdo do ofício ainda ${latestDocumentClosed ? "não está aberto ao público" : "precisa ser lido com atenção"}. A leitura segura é que a FAETEC fez uma manifestação formal e levou o caso para análise jurídica da Educação; isso não é aprovação final, mas também não é arquivamento.`
      : movedToFaetec
        ? latestDocumentClosed
          ? `O documento ${budgetBlock.number}, da área de Orçamento e Finanças da Educação, registrou que não há disponibilidade orçamentária neste momento. Depois dessa manifestação, o processo passou pela Chefia de Gabinete e pelo Gabinete da Secretária de Educação. Em ${latest?.dateTime}, saiu do Gabinete da Secretária e foi enviado à Chefia de Gabinete da FAETEC. O documento ${latestDocument?.number || "mais recente"} foi criado, mas seu texto ainda não está aberto ao público.`
          : faetecAskedToAnalyze
            ? `O documento ${budgetBlock.number}, da área de Orçamento e Finanças da Educação, registrou que não há disponibilidade orçamentária neste momento. Depois disso, o processo passou pelo Gabinete da Secretária de Educação. O despacho ${latestDocument.number}, agora aberto ao público, encaminhou o processo à FAETEC para análise e manifestação.`
            : `O documento ${budgetBlock.number} registrou falta de disponibilidade orçamentária neste momento. Depois disso, o processo foi encaminhado à FAETEC. O despacho ${latestDocument.number} está aberto e deve ser lido junto com a manifestação que a fundação apresentar.`
        : `O documento ${budgetBlock.number}, da área de Orçamento e Finanças da Educação, registrou que não há disponibilidade orçamentária neste momento. Depois disso, ${movementInPlainLanguage(latest)}${latestDocumentClosed ? ` O documento ${latestDocument.number} ainda está fechado ao público.` : ""}`;
    practicalReading = movedToAssjurAfterFaetec
      ? "A ida para a ASSJUR é relevante porque pode servir para validar o instrumento jurídico da migração/transferência, inclusive diante da restrição orçamentária já apontada pela SUPOF. A trava financeira permanece, mas o processo saiu da FAETEC com ofício e ganhou uma nova etapa jurídica."
      : movedToFaetec
        ? latestDocumentClosed
          ? "A trava financeira continua existindo, mas o processo não parou nela. O envio à FAETEC indica que a fundação deverá tomar ciência ou adotar alguma providência. Como o novo despacho ainda está fechado, não é seguro atribuir a ele uma decisão."
          : faetecAskedToAnalyze
            ? "A trava financeira continua existindo, mas o processo não foi encerrado. A Secretaria de Educação pediu expressamente que a FAETEC analise o caso e se manifeste. Isso abre uma nova etapa técnica, mas ainda não significa aprovação nem superação da falta de recursos."
            : "A trava financeira continua existindo e o processo está na FAETEC. O efeito prático dependerá da manifestação oficial que a fundação produzir."
        : "A principal trava agora é financeira. A área técnica não disse que o pedido é ilegal nem mandou arquivar; disse que a Educação não tem recursos disponíveis hoje. A solução depende de encontrar fonte de dinheiro, implantação por etapas ou decisão política superior.";
    positive = movedToAssjurAfterFaetec
      ? "A FAETEC se manifestou por ofício e enviou o processo para a Assessoria Jurídica da SEEDUC, sem arquivamento."
      : movedToFaetec
        ? "O processo passou pelo Gabinete da Secretária de Educação e foi encaminhado à FAETEC, sem arquivamento nem negativa final."
        : movedToCabinet
          ? "O processo subiu para a Chefia de Gabinete da Educação, setor capaz de levar a questão à secretária, negociar com a SEPLAG ou buscar decisão do governo."
          : "O processo não foi arquivado e continua tramitando depois da manifestação orçamentária.";
    negative = movedToAssjurAfterFaetec
      ? "O Ofício da FAETEC ainda pode trazer ressalvas, pedido de ajuste ou simples ciência da falta de orçamento."
      : "A falta de disponibilidade orçamentária ficou registrada oficialmente e pode ser usada para adiar a implantação.";
    nextMovement = movedToAssjurAfterFaetec
      ? `Abertura do documento ${latestDocument?.number || "novo"} e manifestação da SEEDUC/ASSJUR; depois, remessa para GABSEC, SEPLAG ou Casa Civil`
      : movedToFaetec
        ? latestDocumentClosed
          ? `Abertura do documento ${latestDocument?.number || "novo"} e manifestação da FAETEC`
          : "Manifestação da FAETEC em resposta ao pedido da Secretaria de Educação"
        : "Saída da Chefia de Gabinete para o gabinete da secretária, SEPLAG, Casa Civil ou setor encarregado de indicar recursos";
    conclusion = movedToAssjurAfterFaetec
      ? "O processo ganhou um passo jurídico importante. Agora o conteúdo do Ofício da FAETEC e a manifestação da ASSJUR dirão se a fundação apoiou a migração com ressalvas, pediu ajustes ou apenas devolveu o tema para nova análise."
      : movedToFaetec
        ? latestDocumentClosed
          ? "O processo continua vivo e chegou novamente à FAETEC, mas a trava orçamentária ainda não foi superada. É preciso aguardar a abertura do despacho e a resposta da fundação."
          : faetecAskedToAnalyze
            ? "O processo continua vivo e a FAETEC recebeu uma tarefa concreta: analisar o caso e apresentar manifestação. O avanço é administrativo, enquanto a solução financeira ainda depende de decisão do governo."
            : "O processo continua vivo e está na FAETEC, mas a trava orçamentária ainda não foi superada."
        : "O processo não morreu, mas sofreu uma trava séria. O problema deixou de ser apenas técnico: agora precisa de solução orçamentária e decisão política para avançar.";

    if (faetecUnitConclusion) {
      result = "A FAETEC concluiu a tramitação em uma unidade, mas não há decisão final pública.";
      resultLevel = "warning";
      summary = `Em 18/07/2026, o processo foi recebido pela Secretaria da Presidência da FAETEC às 14:47. Às 14:48, o SEI registrou "Conclusão do processo na unidade". Não apareceu novo despacho público nem remessa para outro setor.`;
      practicalReading = "No SEI, concluir o processo em uma unidade pode significar que aquele setor terminou sua parte ou fechou o processo em sua fila. Sozinho, esse registro não prova arquivamento, aprovação ou negativa do pedido inteiro. Como não há novo documento público, ainda não é possível saber qual manifestação a FAETEC adotou.";
      positive = "A Secretaria da Presidência da FAETEC recebeu e processou o pedido de análise enviado pela Secretaria de Educação.";
      negative = "A conclusão ocorreu sem despacho público e sem remessa visível para outro setor, o que pode representar pausa ou encerramento apenas dentro dessa unidade.";
      nextMovement = "Publicação de despacho da FAETEC, reabertura do processo ou remessa para outro setor";
      conclusion = "O novo registro exige cautela: houve tratamento pela Secretaria da Presidência da FAETEC, mas ainda não existe prova pública de decisão sobre o mérito. O próximo movimento ou documento dirá se o processo continuará ou ficará parado nessa etapa.";
    }
  } else if (positiveDocument) {
    result = "Há sinal favorável de continuidade, mas ainda não é aprovação final.";
    resultLevel = "positive";
    summary = `O documento ${positiveDocument.number} usa linguagem favorável ao prosseguimento. ${movementInPlainLanguage(latest)}`;
    practicalReading = "Uma área ou autoridade concordou com a continuidade do processo. Ainda podem faltar definição orçamentária, jurídica ou política.";
    positive = "O pedido venceu uma etapa e recebeu autorização para continuar.";
    negative = "Prosseguimento não significa que o enquadramento já foi aprovado ou publicado.";
    nextMovement = phase.nextSteps[0];
    conclusion = "O sinal é favorável, mas a confirmação depende do próximo setor e de uma decisão expressa sobre o mérito.";
  }

  return {
    mode: "automatic",
    phase,
    result,
    resultLevel,
    summary,
    practicalReading,
    conclusion,
    numbers,
    signals: [positive],
    risks: [negative],
    nextMovement,
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
      period: "Maio e junho de 2026",
      text: "O governador interino Ricardo Couto recebeu o Sepe e representantes ex-FAEP. O sindicato apresentou minuta da Casa Civil sobre isonomia com a FAETEC. Couto encaminhou estudos à SEPLAG e o caso passou a ser tratado no primeiro escalão.",
    },
    {
      period: "23 de julho de 2026",
      text: "A Presidência da FAETEC pediu análise jurídica sobre a necessidade de lei e sobre a possibilidade de usar o PROPAG como caminho para a solução.",
    },
    {
      period: "15 de agosto de 2026",
      text: "A Assessoria Jurídica da SEEDUC encaminhou o processo à área da PGE responsável pelo apoio ao PROPAG. A PGE recebeu o processo no mesmo dia.",
    },
    {
      period: "17 de agosto de 2026",
      text: "A PGE publicou despacho esclarecendo que o PROPAG não é o instrumento neste formato. O processo não foi arquivado: volta à FAETEC e os quesitos sobre lei seguem para a ASSJUR/SECTI.",
    },
    {
      period: "Situação atual",
      text:
        latestDocument?.number === "139134917"
          ? "Governador interino: Ricardo Couto. Em 18/08/2026 o processo já voltou à Presidência da FAETEC. A PGE esclareceu que o PROPAG não é o instrumento neste formato, mas o pedido segue aberto. Há minuta na Casa Civil e os próximos meses são a janela para formalizar a solução de modo estável."
          : `O registro público mais recente é de ${latestMovement?.dateTime || "data não identificada"}, em ${latestMovement?.unit || "unidade não identificada"}. O documento mais recente é ${latestDocument?.number || "não identificado"}, de ${latestDocument?.unit || "unidade não identificada"}. Ainda não existe publicação definitiva do enquadramento.`,
    },
  ];
}

function formatPtLongDate(iso) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function noChangeContext(previous, checkedAt) {
  const latest = previous?.movements?.[0];
  const unit = latest?.unit || "unidade não identificada";
  return {
    dateLabel: formatPtLongDate(checkedAt),
    processNumber: previous?.processNumber || PROCESS_NUMBER,
    unit,
    lastMovementAt: latest?.dateTime || "data não identificada",
  };
}

/** Textos rotativos para checagens sem andamento novo no SEI. Evita repetir a mesma frase. */
function noChangeVariants(ctx) {
  return [
    {
      phaseTitle: "Aguardando manifestação jurídica",
      phaseExplanation:
        "A consulta mais recente mantém o processo na Assessoria Jurídica da SEEDUC, sem despacho posterior disponível ao público.",
      result: "A tramitação continua ativa, mas ainda não há manifestação jurídica nova publicada.",
      summary: `Monitoramento concluído em ${ctx.dateLabel}. Foi realizada uma nova conferência dos registros públicos do processo ${ctx.processNumber}. Nesta consulta não foram identificados novos documentos, despachos ou movimentações posteriores ao recebimento pela Assessoria Jurídica da SEEDUC.`,
      practicalReading:
        "O processo continua na mesma fase de análise jurídica, aguardando manifestação da área competente antes dos próximos encaminhamentos administrativos.",
      conclusion:
        "O acompanhamento permanece ativo e novas informações serão publicadas assim que houver qualquer alteração na tramitação.",
      signal: `O processo continua aberto e formalmente localizado em ${ctx.unit}, sem registro público de encerramento ou arquivamento.`,
      risk: "Sem um novo despacho disponível, ainda não é possível saber se a análise jurídica acolherá a proposta, pedirá ajustes ou devolverá o caso por causa da restrição orçamentária.",
      historyPeriod: `Verificação de ${ctx.dateLabel}`,
      historyText: `Monitoramento concluído em ${ctx.dateLabel}. A conferência aos registros públicos não apontou documento, despacho ou movimentação posterior ao recebimento em ${ctx.unit}. O processo segue em análise jurídica e o acompanhamento permanece ativo.`,
    },
    {
      phaseTitle: "Conferência sem andamento novo",
      phaseExplanation:
        "Nova checagem ao portal público do SEI confirma que o expediente permanece na mesma unidade, ainda sem publicação posterior.",
      result: "A situação pública permanece a mesma: o processo segue sob análise jurídica.",
      summary: `Em ${ctx.dateLabel}, o painel voltou a consultar o SEI. O último registro público continua sendo o de ${ctx.lastMovementAt}, em ${ctx.unit}. Não surgiu remessa, conclusão de etapa nem documento novo acessível ao público.`,
      practicalReading:
        "Isso não indica arquivamento nem abandono do caso. Significa apenas que a área jurídica ainda não publicou a próxima providência no sistema aberto.",
      conclusion:
        "A página segue sendo atualizada a cada verificação. Qualquer mudança na tramitação será registrada aqui assim que aparecer no SEI.",
      signal: "A ausência de publicação nova não equivale a encerramento do processo.",
      risk: "Enquanto o próximo despacho não for publicado, o caminho jurídico e administrativo permanece indefinido para a categoria.",
      historyPeriod: `Verificação de ${ctx.dateLabel}`,
      historyText: `Nova conferência em ${ctx.dateLabel} manteve o quadro anterior: processo em ${ctx.unit}, último andamento em ${ctx.lastMovementAt}, sem despacho posterior visível ao público.`,
    },
    {
      phaseTitle: "Análise jurídica em curso",
      phaseExplanation:
        "O processo permanece na Assessoria Jurídica da Educação, aguardando posicionamento formal antes de novos encaminhamentos.",
      result: "Nenhuma alteração pública foi localizada nesta rodada de monitoramento.",
      summary: `A checagem de ${ctx.dateLabel} revisou movimentações e documentos do ${ctx.processNumber}. O expediente segue em ${ctx.unit}, sem acréscimo posterior ao recebimento já conhecido.`,
      practicalReading:
        "A leitura prática é de espera produtiva: o caso está formalmente sob análise da área competente, e a próxima publicação deve esclarecer o rumo administrativo.",
      conclusion:
        "O monitoramento continua. Assim que o SEI registrar despacho, remessa ou documento novo, o painel será atualizado.",
      signal: `Último andamento público conhecido: ${ctx.lastMovementAt}, em ${ctx.unit}.`,
      risk: "A demora sem texto público deixa a categoria sem sinal claro de acolhimento, ajuste ou devolução.",
      historyPeriod: `Verificação de ${ctx.dateLabel}`,
      historyText: `Em ${ctx.dateLabel} o monitoramento confirmou continuidade da fase jurídica em ${ctx.unit}, sem novidade documental publicada após ${ctx.lastMovementAt}.`,
    },
    {
      phaseTitle: "Situação do processo estável",
      phaseExplanation:
        "A tramitação pública não mudou desde a última movimentação conhecida; o acompanhamento técnico permanece em dia.",
      result: "O processo segue aberto na mesma fase, sem sinal público de arquivamento.",
      summary: `Nesta conferência de ${ctx.dateLabel}, os registros públicos do ${ctx.processNumber} foram novamente confrontados. Não houve inclusão de despacho, parecer ou remessa depois do recebimento pela Assessoria Jurídica da SEEDUC.`,
      practicalReading:
        "Estabilidade no SEI, neste momento, significa que a análise jurídica ainda não foi publicada — e não que o pedido tenha sido descartado.",
      conclusion:
        "Novas informações serão divulgadas neste painel no momento em que a tramitação pública apresentar qualquer alteração.",
      signal: "O acompanhamento oficial permanece ativo mesmo nos dias sem andamento novo.",
      risk: "Sem o texto do próximo despacho, ainda não dá para antecipar se virá pedido de informação, devolução ou encaminhamento superior.",
      historyPeriod: `Verificação de ${ctx.dateLabel}`,
      historyText: `Conferência de ${ctx.dateLabel}: sem alteração pública após o andamento de ${ctx.lastMovementAt} em ${ctx.unit}. Acompanhamento mantido.`,
    },
    {
      phaseTitle: "Monitoramento em andamento",
      phaseExplanation:
        "Foi feita nova leitura do SEI. O processo continua na fase jurídica, aguardando a próxima publicação oficial.",
      result: "A checagem foi concluída e o quadro público permanece inalterado.",
      summary: `Monitoramento de ${ctx.dateLabel} sobre o ${ctx.processNumber}. Depois do recebimento em ${ctx.unit}, nenhum documento ou movimentação posterior ficou disponível na consulta pública.`,
      practicalReading:
        "Enquanto a Assessoria Jurídica não se manifesta de forma publicada, o próximo passo administrativo permanece pendente — mas o processo segue vivo no sistema.",
      conclusion:
        "O painel continuará registrando tanto novas movimentações quanto verificações em que a situação pública permaneça igual.",
      signal: `Localização pública atual: ${ctx.unit}.`,
      risk: "A restrição orçamentária já registrada no processo pode influenciar o teor do próximo parecer, ainda não publicado.",
      historyPeriod: `Verificação de ${ctx.dateLabel}`,
      historyText: `Monitoramento de ${ctx.dateLabel} sem alteração pública. Processo em ${ctx.unit}; último registro em ${ctx.lastMovementAt}.`,
    },
    {
      phaseTitle: "Aguardando o próximo despacho",
      phaseExplanation:
        "A consulta pública mais recente não acrescentou andamento novo; o caso permanece sob exame da área jurídica da Educação.",
      result: "Continuidade da fase jurídica, com acompanhamento ativo deste painel.",
      summary: `Em ${ctx.dateLabel} foi feita nova varredura nos registros abertos do ${ctx.processNumber}. O último marco público segue sendo o recebimento em ${ctx.unit}, em ${ctx.lastMovementAt}.`,
      practicalReading:
        "Para a categoria, o ponto central continua o mesmo: aguardar a manifestação jurídica que desbloqueie os próximos encaminhamentos administrativos.",
      conclusion:
        "Qualquer mudança — despacho, remessa ou documento — será refletida aqui assim que estiver visível no SEI.",
      signal: "Não há registro público de arquivamento ou encerramento nesta conferência.",
      risk: "Até sair o próximo despacho, não é possível afirmar acolhimento, exigência de ajuste ou devolução do caso.",
      historyPeriod: `Verificação de ${ctx.dateLabel}`,
      historyText: `Varredura de ${ctx.dateLabel} sem novos registros públicos. Processo permanece em ${ctx.unit} desde ${ctx.lastMovementAt}.`,
    },
  ];
}

function upsertVerificationHistory(history = [], period, text) {
  const preserved = history.filter(
    (item) => !/^(verifica|monitoramento)/i.test(String(item.period || "")),
  );
  return [{ period, text }, ...preserved];
}

function applyNoChangeNarrative(previous, checkedAt) {
  previous.lastCheckedAt = checkedAt;
  return previous;
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
            "Analise este processo administrativo em português brasileiro para pessoas leigas. Use frases simples. Diferencie fatos, inferências e hipóteses. Explique situação atual, mudança recente, sinais positivos, riscos e próximos passos. Nunca trate movimentação como aprovação. Nunca atribua conteúdo a documento fechado ou sem trecho extraído. Quando o texto não estiver disponível, diga apenas que o documento está fechado ao público e aguarde a leitura oficial.",
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
    if (!html.includes(PROCESS_NUMBER) && !html.includes(PROCESS_NUMBER.replace("SEI-", ""))) {
      throw new Error(`a página recebida não corresponde ao processo ${PROCESS_NUMBER}`);
    }
  } catch (error) {
    if (process.env.CI === "true") {
      throw new Error(`O portal SEI bloqueou a consulta do GitHub: ${error.message}`);
    }
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

  const checkedAt = new Date().toISOString();
  if (previous?.sourceHash === hash && previous?.schemaVersion === DATA_SCHEMA_VERSION && !needsAi && !needsDocumentRead) {
    applyNoChangeNarrative(previous, checkedAt);
    await writeFile(DATA_PATH, `${JSON.stringify(previous, null, 2)}\n`, "utf8");
    console.log(
      `Sem mudança pública no SEI. Texto de acompanhamento rotacionado (variante ${previous.statusVariantIndex + 1}).`,
    );
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
    lastCheckedAt: checkedAt,
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
