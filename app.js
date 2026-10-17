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
  "FAETEC/VICEPRESAD": "Vice-Presidência Administrativa da FAETEC",
  "FAETEC/DIVRH": "Divisão de Recursos Humanos da FAETEC",
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
  "139134917": {
    title: "PGE esclareceu o caminho",
    meaning:
      "A PGE disse que o PROPAG não é o instrumento neste formato. O processo não foi arquivado: volta à FAETEC e os quesitos sobre lei seguem para a ASSJUR/SECTI, o que abre outro caminho.",
  },
  "144310444": {
    title: "Novo despacho da Presidência da FAETEC",
    meaning:
      "A Presidência encaminhou à VPA a análise do impacto já estudado e a pesquisa de formas de resolver o caso. O despacho não aprova a migração nem define recursos.",
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
    date: "19/05/2026",
    title: "Sepe reuniu com Couto",
    text: "O governador interino Ricardo Couto recebeu o Sepe e viu a minuta da Casa Civil sobre isonomia com a FAETEC.",
  },
  {
    date: "02/06/2026",
    title: "Ex-FAEP ouviu o governador",
    text: "Couto recebeu representantes no TJRJ e encaminhou o pleito à SEPLAG. O governo passou a tratar o caso no primeiro escalão.",
  },
  {
    date: "23/07/2026",
    title: "FAETEC pediu parecer",
    text: "A fundação perguntou se é necessária uma lei e se o PROPAG pode ajudar na solução.",
  },
  {
    date: "15/08/2026",
    title: "Processo chegou à PGE",
    text: "A Assessoria Jurídica da Educação encaminhou o caso à área da PGE ligada ao PROPAG.",
  },
  {
    date: "17/08/2026",
    title: "PGE esclareceu o caminho",
    text: "Despacho 139134917: o PROPAG não é o instrumento neste formato. O processo segue aberto.",
  },
  {
    date: "26/08/2026",
    title: "FAETEC recebeu o processo",
    text: "A Presidência da FAETEC registrou o recebimento. O caso está de volta no órgão que pediu a solução.",
  },
  {
    date: "15–16/10/2026",
    title: "FAETEC retoma a tramitação",
    text: "A Presidência enviou o processo à Vice-Presidência Administrativa e à DIVRH. O Despacho 144310444 pediu análise do impacto já estudado e pesquisa de formas de resolução.",
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

function pgeDispatchDocument(data) {
  return data.documents.find((document) => document.number === "139134917");
}

function isPgeDispatchOpen(data) {
  const document = pgeDispatchDocument(data);
  return Boolean(document?.publicUrl && document?.excerpt);
}

function renderCurrentStatus(data) {
  const latest = data.movements[0];
  const atPropag = isAtPropag(data);
  const pgeDispatch = pgeDispatchDocument(data);
  const pgeOpen = isPgeDispatchOpen(data);
  const pgeIndex = data.documents.findIndex(
    (document) => document.number === pgeDispatch?.number,
  );
  const hasPostPgeUpdate =
    pgeOpen && pgeIndex >= 0 && pgeIndex < data.documents.length - 1;

  ui.status.textContent = "Atualizado";
  ui.verdictBadge.textContent = hasPostPgeUpdate
    ? "Na FAETEC"
    : pgeOpen
    ? "Na FAETEC"
    : atPropag
      ? "Na PGE"
      : "Em análise";
  ui.currentTitle.textContent = hasPostPgeUpdate
    ? data.analysis?.result || "A FAETEC retomou a tramitação"
    : pgeOpen
    ? "A FAETEC já recebeu o processo. O semestre segue decisivo"
    : atPropag
      ? "Processo na PGE aguardando posicionamento"
      : data.analysis?.phase?.title || "O processo continua em análise";
  ui.currentSummary.textContent = hasPostPgeUpdate
    ? data.analysis?.summary || plainMovement(latest)
    : pgeOpen
    ? `Em 26/08/2026, às 19:45, a Presidência da FAETEC recebeu o processo devolvido pela PGE. O Despacho ${pgeDispatch.number} esclareceu que o PROPAG não é o instrumento neste formato, mas o pedido segue aberto.`
    : atPropag
      ? "O processo está na PGE. Ainda não há decisão sobre a migração."
      : data.analysis?.summary || plainMovement(latest);

  ui.directAnswer.textContent = hasPostPgeUpdate
    ? "Ainda não há decisão final publicada."
    : pgeOpen
    ? "Ainda não há publicação da migração."
    : "Migração ainda não aprovada.";
  ui.directAnswerDetail.textContent = hasPostPgeUpdate
    ? data.analysis?.practicalReading ||
      "Houve movimentação interna na FAETEC, mas o teor do novo despacho precisa ser publicado."
    : pgeOpen
    ? "O cenário é favorável: a FAETEC já tem o processo em mãos para o próximo encaminhamento. Os próximos meses são a janela para formalizar a solução."
    : atPropag
      ? "O pedido chegou à Procuradoria. Isso coloca o caso no lugar certo."
      : "O processo segue aberto, aguardando próxima decisão oficial.";

  ui.currentUnit.textContent =
    data.analysis?.currentUnit || unitName(latest?.unit);
  ui.lastMovement.textContent = latest?.dateTime || "—";
  ui.lastCheckedAt.textContent = formatCheckedAt(data.lastCheckedAt || data.generatedAt);

  ui.whatHappened.textContent = hasPostPgeUpdate
    ? "Em 15 e 16/10/2026, a Presidência da FAETEC encaminhou o processo à Vice-Presidência Administrativa e à DIVRH e criou o Despacho 144310444."
    : pgeOpen
    ? "A PGE devolveu o processo após esclarecer que o PROPAG não serve neste formato. Em 26/08/2026 a Presidência da FAETEC registrou o recebimento."
    : atPropag
      ? "Em 15/08/2026 o processo foi encaminhado à área da PGE ligada ao PROPAG."
      : plainMovement(latest);
  ui.whatItMeans.textContent = hasPostPgeUpdate
    ? data.analysis?.practicalReading ||
      "O processo voltou a andar dentro da FAETEC, ainda sem decisão final pública."
    : pgeOpen
    ? "O caso saiu da PGE e está de volta na FAETEC, no órgão que pediu a solução. O próximo passo esperado é o encaminhamento à ASSJUR/SECTI e a formalização política."
    : atPropag
      ? "O caso está na Procuradoria, o que é um avanço concreto rumo a uma definição."
      : data.analysis?.practicalReading ||
        "O processo continua tramitando. Cada movimento oficial é um passo a mais rumo a uma definição.";
  ui.whatIsMissing.textContent = hasPostPgeUpdate
    ? data.analysis?.nextMovement ||
      "Publicação do novo despacho e manifestação administrativa da FAETEC."
    : pgeOpen
    ? "Despacho da Presidência da FAETEC, parecer da ASSJUR/SECTI e formalização política até o fim do ano."
    : atPropag
      ? "Manifestação da PGE e continuidade da tramitação."
      : data.analysis?.nextMovement || "Uma manifestação oficial do setor responsável.";
  ui.nextStepShort.textContent = hasPostPgeUpdate
    ? "Ler o Despacho 144310444 e acompanhar a Vice-Presidência Administrativa."
    : pgeOpen
    ? "Despacho da FAETEC e parecer da ASSJUR/SECTI."
    : atPropag
      ? "Aguardar manifestação da PGE."
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
