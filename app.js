const DATA_URL = "./data/processo.json";
const STORAGE_KEY = "painel-faep-faetec-v1";

const ui = {
  refresh: document.querySelector("#refreshButton"),
  history: document.querySelector("#historyButton"),
  historyDialog: document.querySelector("#historyDialog"),
  closeHistory: document.querySelector("#closeHistoryButton"),
  historyContent: document.querySelector("#historyContent"),
  status: document.querySelector("#statusBadge"),
  error: document.querySelector("#errorMessage"),
  news: document.querySelector("#newsMessage"),
  phaseTitle: document.querySelector("#phaseTitle"),
  phaseExplanation: document.querySelector("#phaseExplanation"),
  currentUnit: document.querySelector("#currentUnit"),
  lastMovement: document.querySelector("#lastMovement"),
  generatedAt: document.querySelector("#generatedAt"),
  analysisTitle: document.querySelector("#analysisTitle"),
  analysisMode: document.querySelector("#analysisMode"),
  analysisText: document.querySelector("#analysisText"),
  signals: document.querySelector("#signalsList"),
  risks: document.querySelector("#risksList"),
  nextSteps: document.querySelector("#nextStepsList"),
  movementCount: document.querySelector("#movementCount"),
  timeline: document.querySelector("#timeline"),
  showMore: document.querySelector("#showMoreButton"),
  documentCount: document.querySelector("#documentCount"),
  documents: document.querySelector("#documents"),
  officialLink: document.querySelector("#officialLink"),
};

let currentData = null;
let movementLimit = 12;

const UNIT_NAMES = {
  "SEPLAG/SUPEFIS": "Estudos Fiscais",
  "SEPLAG/SUBORC": "Subsecretaria de Orçamento",
  "SEPLAG/SUBAORC": "Subsecretaria Adjunta de Orçamento",
  "SEPLAG/SUBGEP": "Gestão de Pessoas",
  "SEPLAG/SUPDP": "Planejamento e Desenvolvimento de Pessoas",
  "SEPLAG/SUBPLO": "Planejamento e Orçamento",
  "SEPLAG/CHEGAB": "Chefia de Gabinete da SEPLAG",
  "SEEDUC/CHEGAB": "Chefia de Gabinete da Educação",
  "SEEDUC/GABSEC": "Gabinete da Secretaria de Educação",
  "FAETEC/PRESI": "Presidência da FAETEC",
};

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
      movements: data.movements.map(movementKey),
      documents: data.documents.map((document) => document.number),
    }),
  );
}

function formatGeneratedAt(value) {
  const date = new Date(value);
  const exact = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date) / 60_000));

  if (elapsedMinutes < 1) return `${exact} — agora`;
  if (elapsedMinutes < 60) {
    return `${exact} — há ${elapsedMinutes} minuto${elapsedMinutes > 1 ? "s" : ""}`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${exact} — há ${elapsedHours} hora${elapsedHours > 1 ? "s" : ""}`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${exact} — há ${elapsedDays} dia${elapsedDays > 1 ? "s" : ""}`;
}

function readableUnit(unit) {
  const name = UNIT_NAMES[unit];
  return name ? `${unit} — ${name}` : unit;
}

function fillList(element, values) {
  element.replaceChildren();
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    element.append(item);
  }
}

function detectNews(data, old) {
  if (!old) return { movements: new Set(), documents: new Set() };
  const oldMovements = new Set(old.movements || []);
  const oldDocuments = new Set(old.documents || []);
  return {
    movements: new Set(
      data.movements
        .filter((item) => !oldMovements.has(movementKey(item)))
        .map(movementKey),
    ),
    documents: new Set(
      data.documents
        .filter((item) => !oldDocuments.has(item.number))
        .map((item) => item.number),
    ),
  };
}

function renderNews(news) {
  const parts = [];
  if (news.movements.size) {
    parts.push(`${news.movements.size} novo(s) andamento(s)`);
  }
  if (news.documents.size) {
    parts.push(`${news.documents.size} novo(s) documento(s)`);
  }
  if (!parts.length) {
    ui.news.classList.add("hidden");
    return;
  }
  ui.news.textContent = `Novidade desde sua última visita: ${parts.join(" e ")}.`;
  ui.news.classList.remove("hidden");
}

function renderTimeline(data, newKeys) {
  const template = document.querySelector("#movementTemplate");
  ui.timeline.replaceChildren();
  ui.movementCount.textContent = `${data.movements.length} registros`;

  for (const movement of data.movements.slice(0, movementLimit)) {
    const fragment = template.content.cloneNode(true);
    const article = fragment.querySelector(".movement");
    if (newKeys.has(movementKey(movement))) article.classList.add("new");
    fragment.querySelector("time").textContent = movement.dateTime;
    const unit = fragment.querySelector(".unit");
    unit.textContent = movement.unit;
    unit.title = UNIT_NAMES[movement.unit] || movement.unit;
    fragment.querySelector("p").textContent = movement.description;
    ui.timeline.append(fragment);
  }

  ui.showMore.classList.toggle(
    "hidden",
    movementLimit >= Math.min(data.movements.length, 50),
  );
}

function renderDocuments(data, newNumbers) {
  const template = document.querySelector("#documentTemplate");
  ui.documents.replaceChildren();
  ui.documentCount.textContent = `${data.documents.length} documentos`;

  for (const documentData of data.documents.slice(-20).reverse()) {
    const fragment = template.content.cloneNode(true);
    const item = fragment.querySelector(".document");
    if (newNumbers.has(documentData.number)) item.classList.add("new");
    if (!documentData.publicUrl) item.classList.add("locked");

    fragment.querySelector(".document-number").textContent =
      `Documento ${documentData.number}`;
    fragment.querySelector(".document-type").textContent = documentData.type;
    fragment.querySelector(".document-unit").textContent = documentData.unit;
    fragment.querySelector("time").textContent = documentData.date;
    fragment.querySelector(".document-explanation").textContent =
      documentData.simpleExplanation ||
      "Documento oficial incluído no processo.";
    fragment.querySelector(".document-excerpt").textContent =
      documentData.excerpt || "Documento disponível no SEI.";
    const link = fragment.querySelector(".document-link");
    if (documentData.publicUrl) link.href = documentData.publicUrl;
    ui.documents.append(fragment);
  }
}

function renderHistory(data) {
  ui.historyContent.replaceChildren();
  for (const section of data.history) {
    const article = document.createElement("article");
    article.className = "history-item";
    const title = document.createElement("h3");
    title.textContent = section.period;
    const text = document.createElement("p");
    text.textContent = section.text;
    article.append(title, text);
    ui.historyContent.append(article);
  }
}

function render(data, old) {
  currentData = data;
  const latest = data.movements[0];
  const news = detectNews(data, old);
  const analysis = data.analysis;

  ui.status.textContent = "Atualizado";
  ui.phaseTitle.textContent = analysis.phase.title;
  ui.phaseExplanation.textContent = analysis.phase.explanation;
  ui.currentUnit.textContent = latest?.unit ? readableUnit(latest.unit) : "-";
  ui.lastMovement.textContent = latest?.dateTime || "-";
  ui.generatedAt.textContent = formatGeneratedAt(data.generatedAt);
  ui.officialLink.href = data.officialUrl;

  const hasAi = analysis.mode === "openai" && analysis.aiText;
  ui.analysisTitle.textContent = hasAi
    ? "Análise por inteligência artificial"
    : "Análise automática";
  ui.analysisMode.textContent = hasAi ? "IA" : "Automática";
  ui.analysisText.textContent = hasAi ? analysis.aiText : analysis.summary;
  fillList(ui.signals, analysis.signals);
  fillList(ui.risks, analysis.risks);
  fillList(ui.nextSteps, analysis.phase.nextSteps);

  renderNews(news);
  renderTimeline(data, news.movements);
  renderDocuments(data, news.documents);
  renderHistory(data);
  saveState(data);
}

async function loadData() {
  ui.refresh.disabled = true;
  ui.refresh.textContent = "Verificando...";
  ui.status.textContent = "Consultando";
  ui.error.classList.add("hidden");

  try {
    const old = previousState();
    const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`arquivo de dados indisponível (${response.status})`);
    const data = await response.json();
    render(data, old);
  } catch (error) {
    ui.status.textContent = "Falha";
    ui.error.textContent = `Não foi possível carregar o painel: ${error.message}`;
    ui.error.classList.remove("hidden");
  } finally {
    ui.refresh.disabled = false;
    ui.refresh.textContent = "Verificar atualização";
  }
}

ui.refresh.addEventListener("click", loadData);
ui.history.addEventListener("click", () => {
  if (currentData) ui.historyDialog.showModal();
});
ui.closeHistory.addEventListener("click", () => ui.historyDialog.close());
ui.historyDialog.addEventListener("click", (event) => {
  if (event.target === ui.historyDialog) ui.historyDialog.close();
});
ui.showMore.addEventListener("click", () => {
  movementLimit = Math.min(movementLimit + 15, 50);
  if (currentData) {
    renderTimeline(currentData, new Set());
  }
});

loadData();
