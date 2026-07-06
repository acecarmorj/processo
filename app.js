const DATA_URL = "./data/processo.json";
const STORAGE_KEY = "painel-faep-faetec-v1";
const PHRASE_STORAGE_KEY = "painel-faep-frase-anterior";

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
  keyNumbers: document.querySelector("#keyNumbers"),
  deepIntro: document.querySelector("#deepIntro"),
  unitMeaning: document.querySelector("#unitMeaning"),
  documentMeaning: document.querySelector("#documentMeaning"),
  scenarioCards: document.querySelector("#scenarioCards"),
  watchList: document.querySelector("#watchList"),
  signals: document.querySelector("#signalsList"),
  risks: document.querySelector("#risksList"),
  nextSteps: document.querySelector("#nextStepsList"),
  movementCount: document.querySelector("#movementCount"),
  timeline: document.querySelector("#timeline"),
  showMore: document.querySelector("#showMoreButton"),
  documentCount: document.querySelector("#documentCount"),
  documents: document.querySelector("#documents"),
  officialLink: document.querySelector("#officialLink"),
  documentTransition: document.querySelector("#documentTransition"),
  transitionMessage: document.querySelector("#transitionMessage"),
  transitionSeconds: document.querySelector("#transitionSeconds"),
};

let currentData = null;
let movementLimit = 12;
let transitionTimer = null;

const MOTIVATIONAL_PHRASES = [
  "Há mais de 30 anos essa categoria espera. Cada despacho lido é mais um passo para transformar espera em justiça.",
  "Uma história de trabalho tão longa merece terminar com reconhecimento, respeito e justiça.",
  "Cada novo documento mostra que a nossa causa continua viva e sendo acompanhada.",
  "Direitos podem ser adiados, mas não devem ser esquecidos. A categoria segue firme.",
  "A união dos servidores transforma uma espera individual em uma luta que ninguém pode ignorar.",
  "Quem dedicou décadas ao serviço público merece uma solução clara, digna e definitiva.",
  "O processo avança porque a categoria acompanha, pergunta, participa e não desiste.",
  "Informação também é força: entender cada despacho ajuda a categoria a defender seus direitos.",
  "Nenhum documento é apenas papel quando carrega a esperança de milhares de famílias.",
  "A espera foi longa, mas cada passo oficial aproxima a categoria de uma resposta definitiva.",
  "Quando a categoria permanece unida, sua história ganha voz e sua reivindicação ganha força.",
  "Justiça é reconhecer hoje o direito de quem serviu ao Estado durante toda uma vida.",
  "Cada assinatura pode aproximar milhares de servidores da reparação que esperam há décadas.",
  "Nossa trajetória é feita de trabalho, resistência e esperança. Seguimos acompanhando cada passo.",
  "O tempo passou, mas o direito e a dignidade desses servidores continuam merecendo resposta.",
  "A categoria ex-FAEP não pede favor: espera o reconhecimento justo de sua história funcional.",
  "Persistir com responsabilidade mantém a causa presente onde as decisões são tomadas.",
  "Transparência fortalece a luta: cada despacho aberto ajuda todos a entender o caminho.",
];

const previousPhraseIndex = Number(
  localStorage.getItem(PHRASE_STORAGE_KEY) ?? -1,
);
let visitPhraseIndex = Math.floor(
  Math.random() * (MOTIVATIONAL_PHRASES.length - 1),
);
if (visitPhraseIndex >= previousPhraseIndex) visitPhraseIndex += 1;
localStorage.setItem(PHRASE_STORAGE_KEY, String(visitPhraseIndex));
const visitPhrase = MOTIVATIONAL_PHRASES[visitPhraseIndex];
ui.transitionMessage.textContent = visitPhrase;

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

function originFromDescription(description = "") {
  return description.match(/unidade\s+([A-ZÇ]+\/[A-ZÇ]+)/i)?.[1] || "";
}

function describeLatestMovement(movement) {
  if (!movement) {
    return "Ainda nao foi possivel identificar o ultimo andamento publico.";
  }

  const lowerDescription = movement.description.toLowerCase();
  const origin = originFromDescription(movement.description);
  if (origin && lowerDescription.includes("remetido")) {
    return `O ultimo andamento mostra que o processo saiu de ${origin} e foi enviado para ${movement.unit}, em ${movement.dateTime}.`;
  }
  if (lowerDescription.includes("recebido")) {
    return `O ultimo andamento mostra que o processo chegou em ${movement.unit}, em ${movement.dateTime}.`;
  }
  if (lowerDescription.includes("reabertura")) {
    return `O ultimo andamento mostra uma reabertura em ${movement.unit}, em ${movement.dateTime}. Isso costuma indicar retomada da analise naquele setor.`;
  }
  if (lowerDescription.includes("conclus")) {
    return `O ultimo andamento mostra conclusao de etapa em ${movement.unit}, em ${movement.dateTime}. Isso encerra a analise daquele setor, nao o processo inteiro.`;
  }
  return `O ultimo andamento foi em ${movement.dateTime}, na unidade ${movement.unit}: ${movement.description}.`;
}

function unitMeaningText(unit = "") {
  if (unit.includes("CHEGAB") || unit.includes("GABSEC")) {
    return "Quando o processo chega a gabinete, normalmente ele deixa de ser apenas conta tecnica e passa para decisao de encaminhamento: mandar ao secretario, devolver para ajuste, enviar a Casa Civil ou pedir uma definicao superior.";
  }
  if (unit.includes("SUBORC") || unit.includes("SUBAORC")) {
    return "Orcamento e o setor que olha se a despesa cabe, se precisa de fonte de recurso, remanejamento ou implantacao por etapas. E onde o governo transforma o calculo em possibilidade pratica.";
  }
  if (unit.includes("SUPEFIS")) {
    return "Estudos Fiscais analisa o impacto nas contas do Estado. Esse setor nao decide sozinho a causa, mas mostra o tamanho da despesa e os riscos fiscais.";
  }
  if (unit.includes("SUBGEP") || unit.includes("SUPDP")) {
    return "Gestao de Pessoas olha quantidade de servidores, enquadramento, folha, ativos, aposentados e impacto funcional. E a area que ajuda a conferir quem entra e quanto custaria.";
  }
  if (unit.includes("FAETEC")) {
    return "Quando passa pela FAETEC, o processo toca no orgao de origem da carreira. Isso pode servir para ciencia, manifestacao institucional ou alinhamento sobre o enquadramento.";
  }
  if (unit.includes("SEEDUC")) {
    return "Quando passa pela SEEDUC, o processo volta ao orgao onde muitos servidores ainda estao em exercicio. Ali podem ser pedidos dados, validacoes ou posicionamento do secretario.";
  }
  return "Esse setor faz parte da tramitacao administrativa. Para entender melhor, o mais importante e observar o texto do despacho e o proximo destino do processo.";
}

function documentMeaningText(documentData) {
  if (!documentData) {
    return "Ainda nao ha documento recente identificado para leitura.";
  }
  if (!documentData.publicUrl || !documentData.excerpt) {
    return `O documento ${documentData.number} ja foi criado, mas ainda nao abriu para leitura publica. Isso e comum no SEI: primeiro aparece o numero, depois o conteudo fica visivel. Ate abrir, nao da para afirmar se ele aprovou, pediu ajuste ou apenas encaminhou.`;
  }

  const text = documentData.excerpt.toLowerCase();
  if (text.includes("rioprevid") && text.includes("207,02")) {
    return `O documento ${documentData.number} e uma peca forte de orcamento. Ele confirmou o impacto anual aproximado de R$ 207,02 milhoes e separou ativos, aposentados e orgaos envolvidos. Isso nao aprova, mas tira a discussao do campo da duvida e coloca o custo oficialmente na mesa.`;
  }
  if (text.includes("nao ha disponibilidade") || text.includes("não há disponibilidade")) {
    return `O documento ${documentData.number} aponta falta de disponibilidade no orcamento atual. Isso e obstaculo importante, mas nao significa automaticamente que o direito foi negado. Pode exigir fonte, faseamento ou decisao politica.`;
  }
  if (text.includes("de acordo") || text.includes("prosseguimento")) {
    return `O documento ${documentData.number} tem linguagem de concordancia ou continuidade. Isso e positivo porque autoriza o processo a seguir, mas ainda nao e a publicacao final do enquadramento.`;
  }
  if (/(retific|corrig|complement|ajuste|saneamento|revis)/.test(text)) {
    return `O documento ${documentData.number} parece pedir correcao ou complementacao. Isso atrasa, mas normalmente e corrigivel: o setor responsavel ajusta e devolve para nova analise.`;
  }
  if (text.includes("encaminho") || text.includes("restituo") || text.includes("provid")) {
    return `O documento ${documentData.number} e principalmente um encaminhamento. Em linguagem simples: o processo nao parou; ele foi mandado para outro setor tomar ciencia ou dar o proximo passo.`;
  }
  return `O documento ${documentData.number} esta aberto, mas nao traz uma palavra clara de aprovacao, negativa ou arquivamento. A melhor leitura vem combinando esse texto com o setor para onde o processo foi enviado.`;
}

function scenarioList(data) {
  const latest = data.movements[0];
  const unit = latest?.unit || "";
  const latestDocument = data.documents.at(-1);
  const scenarios = [];

  if (!latestDocument?.publicUrl) {
    scenarios.push({
      title: "Documento fechado abrir",
      text: "O primeiro passo e o despacho mais novo ficar visivel. So com o texto aberto da para saber se foi encaminhamento simples, pedido de ajuste ou decisao mais forte.",
    });
  }

  if (unit.includes("CHEGAB") || unit.includes("GABSEC")) {
    scenarios.push(
      {
        title: "Subir para decisao do secretario",
        text: "O gabinete pode levar o caso ao secretario da pasta para definir se segue para Casa Civil, SEEDUC ou outro setor decisorio.",
      },
      {
        title: "Pedir ajuste antes de decidir",
        text: "O gabinete pode devolver para orcamento, pessoal, SEEDUC ou FAETEC corrigirem detalhe de fonte, impacto, minuta ou grupo de servidores.",
      },
      {
        title: "Preparar caminho para ato final",
        text: "Se a decisao politica estiver madura, o processo pode caminhar para Casa Civil ou para o instrumento juridico escolhido pelo governo.",
      },
    );
  } else if (unit.includes("SUBORC") || unit.includes("SUBAORC")) {
    scenarios.push(
      {
        title: "Indicar fonte ou remanejamento",
        text: "O orcamento pode dizer de onde viria o dinheiro ou quais ajustes seriam necessarios para acomodar a despesa.",
      },
      {
        title: "Sugerir implantacao gradual",
        text: "Uma saida possivel e fasear a implantacao para reduzir impacto imediato e permitir decisao politica com menor risco fiscal.",
      },
      {
        title: "Encaminhar ao gabinete",
        text: "Depois da analise tecnica, o caminho natural e subir para gabinete, onde a decisao deixa de ser so conta e vira escolha administrativa.",
      },
    );
  } else if (unit.includes("SUBGEP") || unit.includes("SUPDP")) {
    scenarios.push(
      {
        title: "Revisar numeros e grupos",
        text: "A area de pessoas pode separar ativos, aposentados, pensionistas, cargos e regras de enquadramento.",
      },
      {
        title: "Atualizar impacto da folha",
        text: "Se houver duvida no valor, esse setor pode refazer ou confirmar o calculo antes do retorno ao orcamento.",
      },
    );
  } else {
    scenarios.push(
      {
        title: "Novo despacho de encaminhamento",
        text: "O mais comum e aparecer um despacho dizendo para qual setor o processo deve seguir e qual providencia foi pedida.",
      },
      {
        title: "Pedido de complementacao",
        text: "Se faltar alguma informacao, o processo pode voltar para quem tem os dados corrigir e enviar novamente.",
      },
    );
  }

  return scenarios.slice(0, 4);
}

function watchItems(data) {
  const latestDocument = data.documents.at(-1);
  const items = [
    "Se aparecer 'de acordo', 'acolho' ou 'prosseguimento', e sinal de continuidade.",
    "Se aparecer 'fonte', 'remanejamento' ou 'adequacao orcamentaria', o debate virou como pagar.",
    "Se aparecer 'faseamento' ou 'implantacao gradual', pode ser tentativa de viabilizar por etapas.",
    "Se aparecer 'Casa Civil', 'Governador' ou 'Secretario', o processo subiu para decisao politica.",
  ];

  if (!latestDocument?.publicUrl) {
    items.unshift(
      `O documento ${latestDocument?.number || "mais recente"} ainda precisa abrir para leitura publica.`,
    );
  }

  return items;
}

function renderDeepExplanation(data) {
  const latest = data.movements[0];
  const latestDocument = data.documents.at(-1);

  ui.deepIntro.textContent = `${describeLatestMovement(latest)} Em linguagem simples: o SEI mostra o caminho oficial do processo, mas a conclusao depende do texto do despacho e do setor que recebeu a demanda.`;
  ui.unitMeaning.textContent = unitMeaningText(latest?.unit);
  ui.documentMeaning.textContent = documentMeaningText(latestDocument);

  ui.scenarioCards.replaceChildren();
  for (const scenario of scenarioList(data)) {
    const card = document.createElement("article");
    card.className = "scenario-card";
    const title = document.createElement("h4");
    const text = document.createElement("p");
    title.textContent = scenario.title;
    text.textContent = scenario.text;
    card.append(title, text);
    ui.scenarioCards.append(card);
  }

  fillList(ui.watchList, watchItems(data));
}

function fillList(element, values) {
  element.replaceChildren();
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = value;
    element.append(item);
  }
}

function renderKeyNumbers(numbers = []) {
  ui.keyNumbers.replaceChildren();
  ui.keyNumbers.classList.toggle("hidden", numbers.length === 0);

  for (const number of numbers) {
    const item = document.createElement("div");
    const value = document.createElement("strong");
    const label = document.createElement("span");
    const detail = document.createElement("small");
    value.textContent = number.value;
    label.textContent = number.label;
    detail.textContent = number.detail || "";
    item.append(value, label);
    if (number.detail) item.append(detail);
    ui.keyNumbers.append(item);
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

function hideTransition() {
  ui.documentTransition.classList.add("hidden");
  document.body.style.overflow = "";
}

function showTransition() {
  if (transitionTimer) clearInterval(transitionTimer);

  let seconds = 6;
  ui.transitionSeconds.textContent = seconds;
  ui.documentTransition.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  transitionTimer = setInterval(() => {
    seconds -= 1;
    ui.transitionSeconds.textContent = Math.max(seconds, 0);

    if (seconds <= 0) {
      clearInterval(transitionTimer);
      transitionTimer = null;
      hideTransition();
    }
  }, 1000);
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
    ? "Explicação por inteligência artificial"
    : "Explicação simples";
  ui.analysisMode.textContent = hasAi ? "IA" : "Automática";
  ui.analysisText.textContent = hasAi ? analysis.aiText : analysis.summary;
  renderKeyNumbers(analysis.numbers);
  renderDeepExplanation(data);
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
  ui.refresh.textContent = "Carregando...";
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
    ui.refresh.textContent = "Recarregar painel";
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
window.addEventListener("load", () => showTransition(), { once: true });
window.addEventListener("pageshow", (event) => {
  if (event.persisted) hideTransition();
});
ui.showMore.addEventListener("click", () => {
  movementLimit = Math.min(movementLimit + 15, 50);
  if (currentData) {
    renderTimeline(currentData, new Set());
  }
});

loadData();
