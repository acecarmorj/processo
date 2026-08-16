const DATA_URL = "./data/processo.json";
const STORAGE_KEY = "painel-faep-ultima-versao-v2";
const UNIQUE_VISITOR_KEY = "painel-faep-visitante-contado-v1";
const UNIQUE_COUNTER_URL =
  "https://api.counterapi.dev/v1/acecarmorj-processo/visitantes-unicos";
const PUBLIC_PANEL_URL = "https://acecarmorj.github.io/processo/";

const ui = {
  refresh: document.querySelector("#refreshButton"),
  officialLink: document.querySelector("#officialLink"),
  whatsappShare: document.querySelector("#whatsappShare"),
  status: document.querySelector("#statusBadge"),
  error: document.querySelector("#errorMessage"),
  news: document.querySelector("#newsMessage"),
  currentTitle: document.querySelector("#currentTitle"),
  currentSummary: document.querySelector("#currentSummary"),
  verdictBadge: document.querySelector("#verdictBadge"),
  directAnswer: document.querySelector("#directAnswer"),
  directAnswerDetail: document.querySelector("#directAnswerDetail"),
  currentUnit: document.querySelector("#currentUnit"),
  lastMovement: document.querySelector("#lastMovement"),
  lastCheckedAt: document.querySelector("#lastCheckedAt"),
  whatHappened: document.querySelector("#whatHappened"),
  whatItMeans: document.querySelector("#whatItMeans"),
  whatIsMissing: document.querySelector("#whatIsMissing"),
  nextStepShort: document.querySelector("#nextStepShort"),
  milestones: document.querySelector("#milestones"),
  keyDocuments: document.querySelector("#keyDocuments"),
  keyDocumentCount: document.querySelector("#keyDocumentCount"),
  timeline: document.querySelector("#timeline"),
  showMore: document.querySelector("#showMoreButton"),
  allDocuments: document.querySelector("#allDocuments"),
  uniqueVisitorCount: document.querySelector("#uniqueVisitorCount"),
};

let currentData;
let movementLimit = 15;

const UNIT_NAMES = {
  "PGE/PG02/SECEXEC/PROPAG": "PGE — área responsável pelo apoio ao PROPAG",
  "SEEDUC/ASSJUR": "Assessoria Jurídica da Secretaria de Educação",
  "FAETEC/PRESI": "Presidência da FAETEC",
  "SEPLAG/SUPEFIS": "Área de estudos fiscais da SEPLAG",
  "SEPLAG/SUBORC": "Área de orçamento da SEPLAG",
  "SEPLAG/SUBAORC": "Área de orçamento da SEPLAG",
  "SEPLAG/SUBGEP": "Área de gestão de pessoas da SEPLAG",
  "SEPLAG/SUPDP": "Área de planejamento de pessoas da SEPLAG",
  "SEEDUC/GABSEC": "Gabinete da Secretaria de Educação",
  "SEEDUC/CHEGAB": "Chefia de Gabinete da Secretaria de Educação",
};

const KEY_DOCUMENTS = {
  "130528267": {
    title: "Nota técnica sobre o vínculo",
    meaning:
      "Documento citado posteriormente pela FAETEC como base para sustentar que os concursados da antiga FAEP mantêm vínculo jurídico com a FAETEC.",
  },
  "135348861": {
    title: "Cálculo atualizado",
    meaning:
      "Consolidou o cálculo oficial necessário para a análise administrativa e orçamentária.",
  },
  "135635411": {
    title: "Obstáculo orçamentário",
    meaning:
      "Registrou que, naquele momento, não havia disponibilidade no orçamento para atender à proposta.",
  },
  "137308944": {
    title: "Pedido de parecer jurídico",
    meaning:
      "A FAETEC pediu resposta sobre duas questões centrais: se a migração precisa de lei e se o PROPAG pode ajudar. Foi um passo importante para destravar o caminho jurídico.",
  },
  "139135021": {
    title: "Envio à PGE/PROPAG",
    meaning:
      "A Assessoria Jurídica da Educação encaminhou o processo à área da PGE ligada ao PROPAG. É o avanço mais concreto até agora, ainda sem aprovação final.",
  },
};

const MILESTONES = [
  {
    date: "17/04/2023",
    title: "Processo iniciado",
    text: "Começou a tramitação administrativa para estudar a situação funcional dos ex-FAEP.",
  },
  {
    date: "29/04/2026",
    title: "Base técnica consolidada",
    text: "Uma nota técnica passou a sustentar a tese de vínculo dos servidores com a FAETEC.",
  },
  {
    date: "30/06/2026",
    title: "Impacto atualizado",
    text: "O governo concluiu uma atualização dos cálculos necessários para analisar a proposta.",
  },
  {
    date: "03/07/2026",
    title: "Falta de orçamento registrada",
    text: "A área fiscal informou que não havia disponibilidade orçamentária naquele momento.",
  },
  {
    date: "23/07/2026",
    title: "FAETEC pediu parecer",
    text: "A fundação perguntou se é necessária uma lei e se o PROPAG pode ajudar na solução.",
  },
  {
    date: "15/08/2026",
    title: "Processo chegou à PGE",
    text: "A área jurídica da Educação enviou o caso à estrutura da PGE ligada ao PROPAG. É o marco mais positivo da tramitação recente.",
  },
];

function unitName(unit = "") {
  if (UNIT_NAMES[unit]) return UNIT_NAMES[unit];
  if (unit.startsWith("PGE/")) return "Procuradoria-Geral do Estado";
  if (unit.startsWith("SEEDUC/")) return "Secretaria de Educação";
  if (unit.startsWith("FAETEC/")) return "FAETEC";
  if (unit.startsWith("SEPLAG/")) return "SEPLAG";
  return unit || "Setor não identificado";
}

function formatCheckedAt(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function movementKey(item) {
  return `${item.dateTime}|${item.unit}|${item.description}`;
}

function previousState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveState(data) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      movement: movementKey(data.movements[0] || {}),
      document: data.documents.at(-1)?.number || "",
    }),
  );
}

async function loadUniqueVisitorCount() {
  if (!ui.uniqueVisitorCount) return;

  let firstAccess = false;
  try {
    firstAccess = !localStorage.getItem(UNIQUE_VISITOR_KEY);
    if (firstAccess) localStorage.setItem(UNIQUE_VISITOR_KEY, "registrando");
  } catch {
    firstAccess = false;
  }

  const endpoint = firstAccess ? `${UNIQUE_COUNTER_URL}/up` : `${UNIQUE_COUNTER_URL}/`;
  try {
    const response = await fetch(`${endpoint}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`contador indisponível (${response.status})`);
    const data = await response.json();
    const count = Number(data.count);
    if (!Number.isFinite(count)) throw new Error("resposta inválida do contador");
    ui.uniqueVisitorCount.textContent = new Intl.NumberFormat("pt-BR").format(count);
    if (firstAccess) localStorage.setItem(UNIQUE_VISITOR_KEY, "contado");
  } catch {
    ui.uniqueVisitorCount.textContent = "indisponível";
  }
}

function plainMovement(movement) {
  const description = String(movement?.description || "").toLowerCase();
  const origin = movement?.description?.match(
    /unidade\s+([A-ZÇ]+(?:\/[A-ZÇ0-9]+)+)/i,
  )?.[1];

  if (description.includes("remetido") && origin) {
    return `Saiu de ${unitName(origin)} e foi enviado para ${unitName(movement.unit)}.`;
  }
  if (description.includes("recebido")) {
    return `O processo chegou a ${unitName(movement.unit)}.`;
  }
  if (description.includes("reabertura")) {
    return `O processo voltou a ser analisado por ${unitName(movement.unit)}.`;
  }
  if (description.includes("conclus")) {
    return `${unitName(movement.unit)} encerrou sua parte da análise.`;
  }
  return "Houve uma atualização administrativa no processo.";
}

function isAtPropag(data) {
  return data.movements[0]?.unit?.includes("SECEXEC/PROPAG");
}

function renderCurrentStatus(data) {
  const latest = data.movements[0];
  const atPropag = isAtPropag(data);

  ui.status.textContent = "Atualizado";
  ui.verdictBadge.textContent = atPropag ? "Bom avanço" : "Em análise";
  ui.currentTitle.textContent = atPropag
    ? "Boa notícia: o processo chegou à PGE para análise do PROPAG"
    : data.analysis?.phase?.title || "O processo continua em análise";
  ui.currentSummary.textContent = atPropag
    ? "Em 15/08/2026, a PGE recebeu o processo. Isso coloca o caso na área certa para avaliar o uso do PROPAG. Ainda não é a decisão final, mas é um avanço concreto."
    : data.analysis?.summary || plainMovement(latest);

  ui.directAnswer.textContent = "Ainda não há aprovação final, mas o processo avançou.";
  ui.directAnswerDetail.textContent = atPropag
    ? "O pedido saiu da análise interna da Educação e chegou formalmente à PGE. O próximo marco esperado é a manifestação da Procuradoria."
    : "O processo segue aberto e em tramitação, aguardando a próxima decisão oficial.";

  ui.currentUnit.textContent = unitName(latest?.unit);
  ui.lastMovement.textContent = latest?.dateTime || "—";
  ui.lastCheckedAt.textContent = formatCheckedAt(data.lastCheckedAt || data.generatedAt);

  ui.whatHappened.textContent = atPropag
    ? "Em 15/08/2026, a Assessoria Jurídica da Educação enviou o processo para a área da PGE que acompanha o PROPAG. A PGE recebeu no mesmo dia."
    : plainMovement(latest);
  ui.whatItMeans.textContent = atPropag
    ? "É um avanço relevante: a discussão chegou à Procuradoria, exatamente no setor ligado ao PROPAG. Isso não aprova a migração, mas mostra que o pedido está sendo tratado no lugar certo."
    : data.analysis?.practicalReading ||
      "O processo continua tramitando. Cada movimento oficial é um passo a mais rumo a uma definição.";
  ui.whatIsMissing.textContent = atPropag
    ? "Ainda falta a PGE dizer se a solução é possível dentro do PROPAG, qual instrumento jurídico usar e como enfrentar a questão orçamentária."
    : data.analysis?.nextMovement || "Uma manifestação oficial do setor responsável.";
  ui.nextStepShort.textContent = atPropag
    ? "Aguardar a manifestação da PGE."
    : data.analysis?.nextMovement || "Novo despacho oficial.";
}

function renderNews(data, old) {
  const latestMovement = movementKey(data.movements[0] || {});
  const latestDocument = data.documents.at(-1)?.number || "";
  if (old && (old.movement !== latestMovement || old.document !== latestDocument)) {
    ui.news.textContent = "Há novidade oficial desde sua última visita.";
    ui.news.classList.remove("hidden");
    return;
  }
  ui.news.classList.add("hidden");
}

function renderMilestones() {
  ui.milestones.replaceChildren();
  for (const item of MILESTONES) {
    const article = document.createElement("article");
    article.innerHTML = `
      <time>${item.date}</time>
      <div>
        <h3>${item.title}</h3>
        <p>${item.text}</p>
      </div>
    `;
    ui.milestones.append(article);
  }
}

function renderKeyDocuments(data) {
  const selected = data.documents.filter((document) => KEY_DOCUMENTS[document.number]);
  ui.keyDocumentCount.textContent = `${selected.length} documentos-chave`;
  ui.keyDocuments.replaceChildren();

  for (const documentData of selected) {
    const copy = KEY_DOCUMENTS[documentData.number];
    const article = document.createElement("article");
    article.className = "key-document";

    const link = documentData.publicUrl
      ? `<a href="${documentData.publicUrl}" target="_blank" rel="noreferrer">Ler no SEI</a>`
      : "<span>Texto não liberado no SEI</span>";

    article.innerHTML = `
      <div class="key-document-date">
        <time>${documentData.date}</time>
        <small>Doc. ${documentData.number}</small>
      </div>
      <div>
        <h3>${copy.title}</h3>
        <p>${copy.meaning}</p>
        ${link}
      </div>
    `;
    ui.keyDocuments.append(article);
  }
}

function renderTimeline(data) {
  const template = document.querySelector("#movementTemplate");
  ui.timeline.replaceChildren();
  for (const movement of data.movements.slice(0, movementLimit)) {
    const fragment = template.content.cloneNode(true);
    fragment.querySelector("time").textContent = movement.dateTime;
    fragment.querySelector(".unit").textContent = unitName(movement.unit);
    fragment.querySelector("p").textContent = plainMovement(movement);
    ui.timeline.append(fragment);
  }
  ui.showMore.classList.toggle("hidden", movementLimit >= Math.min(data.movements.length, 60));
}

function renderAllDocuments(data) {
  const template = document.querySelector("#documentTemplate");
  ui.allDocuments.replaceChildren();

  for (const documentData of data.documents.slice(-30).reverse()) {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".document");
    const keyCopy = KEY_DOCUMENTS[documentData.number];
    if (!documentData.publicUrl) item.classList.add("locked");

    fragment.querySelector(".document-title").textContent =
      keyCopy?.title || `${documentData.type} — documento ${documentData.number}`;
    fragment.querySelector(".document-meta").textContent =
      `${documentData.date} · ${unitName(documentData.unit)}`;
    fragment.querySelector(".document-explanation").textContent =
      keyCopy?.meaning || "Documento oficial incluído no processo.";
    fragment.querySelector(".document-excerpt").textContent =
      documentData.excerpt || "Trecho não disponível.";

    const link = fragment.querySelector(".document-link");
    if (documentData.publicUrl) link.href = documentData.publicUrl;
    ui.allDocuments.append(fragment);
  }
}

function render(data, old) {
  currentData = data;
  ui.officialLink.href = data.officialUrl;
  renderCurrentStatus(data);
  renderNews(data, old);
  renderMilestones();
  renderKeyDocuments(data);
  renderTimeline(data);
  renderAllDocuments(data);
  saveState(data);
}

async function loadData() {
  ui.refresh.disabled = true;
  ui.refresh.textContent = "Atualizando...";
  ui.status.textContent = "Consultando";
  ui.error.classList.add("hidden");

  try {
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`dados indisponíveis (${response.status})`);
    render(await response.json(), previousState());
  } catch (error) {
    ui.status.textContent = "Falha";
    ui.error.textContent = `Não foi possível carregar o painel: ${error.message}`;
    ui.error.classList.remove("hidden");
  } finally {
    ui.refresh.disabled = false;
    ui.refresh.textContent = "Atualizar";
  }
}

ui.whatsappShare.href = `https://wa.me/?text=${encodeURIComponent(
  `Veja a situação atual do processo dos ex-FAEP/FAETEC, explicada de forma simples:\n\n${PUBLIC_PANEL_URL}`,
)}`;

ui.refresh.addEventListener("click", loadData);
ui.showMore.addEventListener("click", () => {
  movementLimit = Math.min(movementLimit + 15, 60);
  if (currentData) renderTimeline(currentData);
});

loadData();
loadUniqueVisitorCount();
