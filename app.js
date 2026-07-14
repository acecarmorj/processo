const DATA_URL = "./data/processo.json";
const STORAGE_KEY = "painel-faep-faetec-v1";
const PUBLIC_PANEL_URL = "https://acecarmorj.github.io/processo/";

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
  analysisText: document.querySelector("#analysisText"),
  diagnosisBox: document.querySelector("#diagnosisBox"),
  diagnosisText: document.querySelector("#diagnosisText"),
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
  whatsappShare: document.querySelector("#whatsappShare"),
};

let currentData = null;
let movementLimit = 12;
let transitionTimer = null;

const SHARE_MESSAGE =
  "Cada colega bem informado fortalece nossa causa. Compartilhe este painel agora com pelo menos um ex-FAEP/FAETEC: em poucos segundos, você ajuda mais uma pessoa a acompanhar os fatos diretamente, sem boatos nem informações desencontradas. Quanto mais colegas acompanharem, mais unida e preparada estará a categoria.";
ui.transitionMessage.textContent = SHARE_MESSAGE;
ui.whatsappShare.href = `https://wa.me/?text=${encodeURIComponent(
  `Olá! Quero compartilhar este painel que acompanha o processo dos servidores ex-FAEP/FAETEC de forma clara e atualizada. Assim, podemos acompanhar os fatos diretamente e manter a categoria bem informada. Abra e compartilhe também com outro colega:\n\n${PUBLIC_PANEL_URL}`,
)}`;

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

Object.assign(UNIT_NAMES, {
  "FAETEC/ASSJUR": "Assessoria Juridica da FAETEC",
  "FAETEC/CHEGAB": "Chefia de Gabinete da FAETEC",
  "FAETEC/DIVRH": "Divisao de Recursos Humanos da FAETEC",
  "FAETEC/PRESI": "Presidencia da FAETEC",
  "FAETEC/SECPRES": "Secretaria da Presidencia da FAETEC",
  "PGE/CHEGAB": "Chefia de Gabinete da Procuradoria-Geral do Estado",
  "PGE/PG": "Procuradoria-Geral do Estado",
  "RIOPREV/DIRSE": "Diretoria de Seguridade do Rioprevidencia",
  "RIOPREV/GERBE": "Gerencia de Beneficios do Rioprevidencia",
  "RIOPREV/GERCAP": "Gerencia de Cadastro e Pagamento do Rioprevidencia",
  "RIOPREV/GERPA": "Gerencia de Pagamento do Rioprevidencia",
  "RIOPREV/PRESI": "Presidencia do Rioprevidencia",
  "SECC/ASSAL": "Assessoria da Casa Civil",
  "SECC/ASSOC": "Assessoria da Casa Civil",
  "SECC/CHEGAB": "Chefia de Gabinete da Casa Civil",
  "SECC/COGIC": "Coordenacao da Casa Civil",
  "SECC/COPRE": "Coordenacao da Casa Civil",
  "SECC/SUBG": "Subsecretaria-Geral da Casa Civil",
  "SECC/SUBGEP": "Subsecretaria de Gestao de Pessoas da Casa Civil",
  "SECC/SUBJUR": "Subsecretaria Juridica da Casa Civil",
  "SECC/SUBTEX": "Subsecretaria de Texto e Expediente da Casa Civil",
  "SECC/SUPDP": "Superintendencia de Planejamento e Desenvolvimento de Pessoas da Casa Civil",
  "SECC/SUPTEX": "Superintendencia de Texto e Expediente da Casa Civil",
  "SECTI/ASSJUR": "Assessoria Juridica da Secretaria de Ciencia, Tecnologia e Inovacao",
  "SECTI/CHEGAB": "Chefia de Gabinete da Secretaria de Ciencia, Tecnologia e Inovacao",
  "SECTI/GABSEC": "Gabinete da Secretaria de Ciencia, Tecnologia e Inovacao",
  "SEEDUC/ARQDOC": "Arquivo e Documentacao da Secretaria de Educacao",
  "SEEDUC/ASPLO": "Assessoria de Planejamento e Orcamento da Secretaria de Educacao",
  "SEEDUC/ASSCONT": "Assessoria de Controle e Contabilidade da Secretaria de Educacao",
  "SEEDUC/ASSJUR": "Assessoria Juridica da Secretaria de Educacao",
  "SEEDUC/ASSPLAG": "Assessoria de Planejamento e Gestao da Secretaria de Educacao",
  "SEEDUC/ASSUBEXE": "Assessoria da Subsecretaria Executiva da Secretaria de Educacao",
  "SEEDUC/ASSUPOF": "Assessoria de Orcamento e Financas da Secretaria de Educacao",
  "SEEDUC/CHEGAB": "Chefia de Gabinete da Secretaria de Educacao",
  "SEEDUC/GABSEC": "Gabinete da Secretaria de Educacao",
  "SEEDUC/NUCALC": "Nucleo de Calculos da Secretaria de Educacao",
  "SEEDUC/NUCSPEA": "Nucleo da Secretaria de Educacao ligado ao processo",
  "SEEDUC/PROTPUB": "Protocolo e Publicacao da Secretaria de Educacao",
  "SEEDUC/SUBAD": "Subsecretaria Administrativa da Secretaria de Educacao",
  "SEEDUC/SUBEXE": "Subsecretaria Executiva da Secretaria de Educacao",
  "SEEDUC/SUPGP": "Superintendencia de Gestao de Pessoas da Secretaria de Educacao",
  "SEEDUC/SUPOF": "Superintendencia de Orcamento e Financas da Secretaria de Educacao",
  "SEEDUC/SUPTA": "Superintendencia da Secretaria de Educacao",
  "SEFAZ/CHEGAB": "Chefia de Gabinete da Secretaria de Fazenda",
  "SEFAZ/COMISARRF": "Comissao do Regime de Recuperacao Fiscal da Secretaria de Fazenda",
  "SEFAZ/GABSEC": "Gabinete da Secretaria de Fazenda",
  "SEFAZ/SUBAPOF": "Subsecretaria Adjunta de Politica Orcamentaria e Financeira da Fazenda",
  "SEFAZ/SUBTES": "Subsecretaria do Tesouro da Secretaria de Fazenda",
  "SEPLAG/CHEGAB": "Chefia de Gabinete da SEPLAG",
  "SEPLAG/SUBAORC": "Subsecretaria Adjunta de Orcamento",
  "SEPLAG/SUBGEP": "Subsecretaria de Gestao de Pessoas",
  "SEPLAG/SUBORC": "Subsecretaria de Orcamento",
  "SEPLAG/SUBPLO": "Subsecretaria de Planejamento e Orcamento",
  "SEPLAG/SUPDP": "Superintendencia de Planejamento e Desenvolvimento de Pessoas",
  "SEPLAG/SUPEFIS": "Superintendencia de Estudos Fiscais",
});

const ORG_NAMES = {
  FAETEC: "Fundacao de Apoio a Escola Tecnica",
  PGE: "Procuradoria-Geral do Estado",
  RIOPREV: "Rioprevidencia",
  SECC: "Secretaria de Estado da Casa Civil",
  SECTI: "Secretaria de Ciencia, Tecnologia e Inovacao",
  SEEDUC: "Secretaria de Estado de Educacao",
  SEFAZ: "Secretaria de Estado de Fazenda",
  SEPLAG: "Secretaria de Estado de Planejamento e Gestao",
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

function readableUnit(unit = "") {
  const cleanUnit = String(unit || "").trim();
  if (!cleanUnit) return "";

  const name = UNIT_NAMES[cleanUnit];
  if (name) return `${cleanUnit} - ${name}`;

  const [org, sector] = cleanUnit.split("/");
  const orgName = ORG_NAMES[org];
  if (orgName && sector) return `${cleanUnit} - ${sector} da ${orgName}`;

  return cleanUnit;
}

function expandUnitsInText(text = "") {
  return String(text || "").replace(
    /\b([A-Z]{2,12}\/[A-Z0-9]{2,14})\b(?!\s+-)/g,
    (unit) => readableUnit(unit),
  );
}

function currentSignals(values = []) {
  return values.filter(
    (value) => !/estimativa mais recente de impacto continua/i.test(value),
  );
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
    return `O ultimo andamento mostra que o processo saiu de ${readableUnit(origin)} e foi enviado para ${readableUnit(movement.unit)}, em ${movement.dateTime}.`;
  }
  if (lowerDescription.includes("recebido")) {
    return `O ultimo andamento mostra que o processo chegou em ${readableUnit(movement.unit)}, em ${movement.dateTime}.`;
  }
  if (lowerDescription.includes("reabertura")) {
    return `O ultimo andamento mostra uma reabertura em ${readableUnit(movement.unit)}, em ${movement.dateTime}. Isso costuma indicar retomada da analise naquele setor.`;
  }
  if (lowerDescription.includes("conclus")) {
    return `O ultimo andamento mostra conclusao de etapa em ${readableUnit(movement.unit)}, em ${movement.dateTime}. Isso encerra a analise daquele setor, nao o processo inteiro.`;
  }
  return `O ultimo andamento foi em ${movement.dateTime}, na unidade ${readableUnit(movement.unit)}: ${expandUnitsInText(movement.description)}.`;
}

function buildStatusExplanation(data) {
  const latest = data?.movements?.[0];
  if (!latest) {
    return "O painel ainda não conseguiu identificar a situação atual do processo.";
  }

  const unit = readableUnit(latest.unit);
  const origin = originFromDescription(latest.description);
  const movedFrom = origin ? `, depois de sair de ${readableUnit(origin)}` : "";

  if (latest.unit.includes("CHEGAB") || latest.unit.includes("GABSEC")) {
    return `O processo está em ${unit}${movedFrom}. Isso mostra que ele chegou a uma área de decisão e encaminhamento superior. Ainda não significa aprovação nem negativa: o gabinete precisa definir o próximo passo.`;
  }
  if (latest.unit.includes("ASSUBEXE") || latest.unit.includes("SUBEXE")) {
    return `O processo está em ${unit}${movedFrom}. Essa área reúne as análises já feitas e prepara o encaminhamento para uma autoridade superior. Ainda não é a decisão final.`;
  }
  if (latest.unit.includes("SUBORC") || latest.unit.includes("SUBAORC")) {
    return `O processo está em ${unit}${movedFrom}. Nessa etapa, o governo verifica como acomodar a medida no orçamento e quais providências financeiras seriam necessárias.`;
  }
  if (latest.unit.includes("SUPEFIS")) {
    return `O processo está em ${unit}${movedFrom}. Essa área avalia o efeito da proposta nas contas do Estado antes de o caso seguir para decisão superior.`;
  }
  if (latest.unit.includes("SUBGEP") || latest.unit.includes("SUPDP")) {
    return `O processo está em ${unit}${movedFrom}. Nessa etapa são conferidos servidores, enquadramento, folha e demais dados usados na decisão.`;
  }

  return `O processo está em ${unit}${movedFrom}. O próximo despacho deverá explicar qual providência esse setor adotou e para onde o caso seguirá.`;
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

  ui.unitMeaning.textContent = expandUnitsInText(unitMeaningText(latest?.unit));
  ui.documentMeaning.textContent = expandUnitsInText(documentMeaningText(latestDocument));

  ui.scenarioCards.replaceChildren();
  for (const scenario of scenarioList(data)) {
    const card = document.createElement("article");
    card.className = "scenario-card";
    const title = document.createElement("h4");
    const text = document.createElement("p");
    title.textContent = expandUnitsInText(scenario.title);
    text.textContent = expandUnitsInText(scenario.text);
    card.append(title, text);
    ui.scenarioCards.append(card);
  }

  fillList(ui.watchList, watchItems(data));
}

function fillList(element, values) {
  element.replaceChildren();
  for (const value of values) {
    const item = document.createElement("li");
    item.textContent = expandUnitsInText(value);
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
    unit.textContent = readableUnit(movement.unit);
    unit.title = readableUnit(movement.unit);
    fragment.querySelector("p").textContent = expandUnitsInText(movement.description);
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
    fragment.querySelector(".document-unit").textContent = readableUnit(documentData.unit);
    fragment.querySelector("time").textContent = documentData.date;
    fragment.querySelector(".document-explanation").textContent =
      documentData.simpleExplanation ||
      "Documento oficial incluído no processo.";
    fragment.querySelector(".document-excerpt").textContent =
      documentData.excerpt || "Documento disponível no SEI.";
    const explanation = fragment.querySelector(".document-explanation");
    const excerpt = fragment.querySelector(".document-excerpt");
    explanation.textContent = expandUnitsInText(explanation.textContent);
    excerpt.textContent = expandUnitsInText(excerpt.textContent);
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
    text.textContent = expandUnitsInText(section.text);
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

function buildDiagnosis(data) {
  const latest = data?.movements?.[0];
  const latestDocument = data?.documents?.at(-1);
  const unit = latest?.unit || "";
  const description = (latest?.description || "").toLowerCase();
  const documentNumber = latestDocument?.number || "";
  const documentText = (latestDocument?.excerpt || "").toLowerCase();
  const documentIsOpen = Boolean(latestDocument?.publicUrl && latestDocument?.excerpt);

  if (!latest) {
    return "Ainda não há andamento suficiente para formar um diagnóstico seguro. O painel continuará acompanhando o SEI.";
  }

  if (unit.includes("SEPLAG/CHEGAB")) {
    const seeducHint = documentText.includes("secretaria de estado de educação")
      ? " O despacho anterior aponta possível envio à SEEDUC para novas providências."
      : "";
    if (description.includes("recebido")) {
      return `É um andamento pequeno, mas confirma que o processo não ficou perdido. A bola está agora no gabinete da SEPLAG para formalizar o encaminhamento. Ainda não é aprovação, mas também não é negativa. É a transição da análise orçamentária para uma decisão administrativa superior.${seeducHint}`;
    }
    return `O gabinete da SEPLAG movimentou o processo. Isso costuma significar que a análise técnica saiu da área responsável e precisa de encaminhamento formal para o próximo setor.${seeducHint}`;
  }

  if (unit.includes("SEPLAG/SUBORC") || unit.includes("SEPLAG/SUBAORC")) {
    return "O processo está na área de Orçamento. Esta é a etapa em que o governo olha fonte de recursos, impacto financeiro e forma de implantação. É uma fase decisiva, porque o direito pode estar bem fundamentado, mas ainda precisa caber no planejamento financeiro do Estado.";
  }

  if (unit.includes("SEPLAG/SUPEFIS")) {
    return "O processo está na área fiscal. Aqui a análise tende a verificar se a despesa respeita limites, regras fiscais e capacidade financeira. É um sinal de que o assunto está sendo tratado como decisão de impacto real, não apenas como protocolo parado.";
  }

  if (unit.includes("SEPLAG/SUBGEP") || unit.includes("SEPLAG/SUPDP")) {
    return "O processo está na área de gestão de pessoas. Essa passagem costuma tratar de quantitativo de servidores, ativos, aposentados, pensionistas, enquadramento, folha e projeção do impacto. É onde os números precisam ficar bem amarrados para o Orçamento decidir.";
  }

  if (unit.includes("SEEDUC/CHEGAB") || unit.includes("SEEDUC/GABSEC")) {
    if (latestDocument && !documentIsOpen) {
      return `O processo subiu para ${readableUnit(unit)} depois de passar pelas áreas técnicas da Educação. Também existe o documento ${documentNumber}, mas seu texto ainda está fechado. O movimento indica decisão administrativa superior; não permite afirmar aprovação, negativa ou pedido de correção até o despacho abrir.`;
    }
    return `O processo está em ${readableUnit(unit)}, uma área que formaliza decisões e encaminhamentos superiores. O próximo movimento pode levá-lo ao secretário, devolvê-lo para ajuste ou enviá-lo a outro órgão decisório.`;
  }

  if (unit.includes("SEEDUC/ASSUBEXE") || unit.includes("SEEDUC/SUBEXE")) {
    return "O processo chegou à estrutura da Subsecretaria Executiva da Educação. Essa área costuma reunir as manifestações técnicas e preparar uma decisão ou encaminhamento superior. É avanço de hierarquia, mas ainda não aprovação final.";
  }

  if (unit.includes("SEEDUC")) {
    return "O processo está na Educação. Isso indica que a SEEDUC pode precisar complementar informação, validar dados ou receber de volta a orientação da SEPLAG. O ponto central é saber se a volta veio para ajuste técnico ou para encaminhamento político.";
  }

  if (unit.includes("FAETEC")) {
    return "O processo passou pela FAETEC. Essa etapa costuma envolver manifestação sobre vínculo, enquadramento e impacto na estrutura da fundação. Como a causa trata de servidores ex-FAEP/FAETEC, a passagem pela fundação é relevante.";
  }

  if (latestDocument && !documentIsOpen) {
    return `Há documento novo listado no SEI (${documentNumber}), mas o texto ainda não está aberto ao público. Por enquanto, dá para afirmar que houve movimentação; a conclusão só fica segura quando o despacho puder ser lido.`;
  }

  if (documentText.includes("encaminh")) {
    return `O documento mais recente (${documentNumber}) parece ser de encaminhamento. Isso normalmente não resolve o mérito, mas mostra qual setor deve dar o próximo passo. O importante agora é acompanhar se o processo vai para decisão superior, correção técnica ou nova análise orçamentária.`;
  }

  return "O processo teve movimentação administrativa. Ainda não há sinal público de aprovação final, negativa ou arquivamento. A leitura segura depende do próximo despacho e do setor para onde ele será encaminhado.";
}

function render(data, old) {
  currentData = data;
  const latest = data.movements[0];
  const news = detectNews(data, old);
  const analysis = data.analysis;

  ui.status.textContent = "Atualizado";
  ui.phaseTitle.textContent = analysis.phase.title;
  ui.phaseExplanation.textContent = expandUnitsInText(buildStatusExplanation(data));
  ui.currentUnit.textContent = latest?.unit ? readableUnit(latest.unit) : "-";
  ui.lastMovement.textContent = latest?.dateTime || "-";
  ui.generatedAt.textContent = formatGeneratedAt(data.generatedAt);
  ui.officialLink.href = data.officialUrl;

  const hasAi = analysis.mode === "openai" && analysis.aiText;
  ui.analysisTitle.textContent = "O que aconteceu";
  ui.analysisText.textContent = expandUnitsInText(hasAi ? analysis.aiText : analysis.summary);
  const diagnosis = buildDiagnosis(data);
  ui.diagnosisText.textContent = expandUnitsInText(diagnosis);
  ui.diagnosisBox.classList.toggle("hidden", !diagnosis);
  renderDeepExplanation(data);
  fillList(ui.signals, currentSignals(analysis.signals).slice(0, 3));
  fillList(ui.risks, analysis.risks.slice(0, 3));
  fillList(ui.nextSteps, analysis.phase.nextSteps.slice(0, 3));

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
