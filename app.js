/* Éboli — gestão de antibioticoterapia
 * Persistência simples em localStorage. Sem dependências externas.
 *
 * Modelo de dados:
 *   patient = {
 *     id, nome, leito, registro,
 *     antibioticos: [ atb ],
 *     katz,                // avaliação Katz (ou null) — ver ESCALAS
 *     nead                 // avaliação NEAD (ou null) — ver ESCALAS
 *   }
 *
 *   katz / nead = {
 *     data,                // ISO yyyy-mm-dd da avaliação
 *     itens: { chave: pontuacao, ... },
 *     total                // soma das pontuações
 *   }
 *   atb = {
 *     id,
 *     nome,                // nome do antibiótico
 *     sitio,               // sítio de infecção
 *     dataPrescricao,      // ISO yyyy-mm-dd
 *     scihCiente,          // boolean — SCIH estava ciente
 *     dataInicio,          // ISO yyyy-mm-dd (início do uso)
 *     dataFim,             // ISO yyyy-mm-dd ou null (preenchido ao finalizar)
 *     status               // 'ativo' | 'finalizado'
 *   }
 */

const STORAGE_KEY = "eboli.pacientes.v1";

/* ----------------------------- Estado ----------------------------- */
let patients = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Falha ao ler dados salvos:", e);
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* --------------------------- Utilitários --------------------------- */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Tempo de uso em dias (inclusivo). Para antibiótico ativo, usa a data atual.
function diasDeUso(inicio, fim) {
  if (!inicio) return null;
  const ini = new Date(inicio + "T00:00:00");
  const end = new Date((fim || todayISO()) + "T00:00:00");
  const ms = end - ini;
  const dias = Math.floor(ms / 86400000) + 1; // inclui o dia de início
  return dias < 1 ? 1 : dias;
}

function tempoLabel(inicio, fim) {
  const d = diasDeUso(inicio, fim);
  if (d == null) return "—";
  return d === 1 ? "1 dia" : `${d} dias`;
}

/* ----------------------------- Render ----------------------------- */
const listEl = document.getElementById("patientList");
const cardTpl = document.getElementById("patientCardTemplate");

function render() {
  listEl.innerHTML = "";
  if (patients.length === 0) {
    const p = document.createElement("p");
    p.className = "empty-msg";
    p.style.textAlign = "center";
    p.textContent = "Nenhum paciente cadastrado. Clique em “+ Novo paciente”.";
    listEl.appendChild(p);
    return;
  }
  patients.forEach((pt) => listEl.appendChild(renderPatient(pt)));
}

function renderPatient(pt) {
  const node = cardTpl.content.cloneNode(true);
  const card = node.querySelector(".patient-card");
  card.dataset.id = pt.id;

  card.querySelector(".patient-name").textContent = pt.nome;
  const meta = [pt.leito && `Leito ${pt.leito}`, pt.registro && `Reg. ${pt.registro}`]
    .filter(Boolean)
    .join(" · ");
  card.querySelector(".patient-meta").textContent = meta;

  card.querySelector(".btn-remove-patient").addEventListener("click", () => removePatient(pt.id));
  card.querySelector(".btn-add-atb").addEventListener("click", () => openAtbModal(pt.id));

  const ativos = pt.antibioticos.filter((a) => a.status === "ativo");
  const historico = pt.antibioticos.filter((a) => a.status === "finalizado");

  /* Antibióticos em uso */
  const activeList = card.querySelector(".atb-active-list");
  card.querySelector(".active-empty").style.display = ativos.length ? "none" : "block";
  ativos.forEach((a) => activeList.appendChild(renderAtbCard(pt.id, a)));

  /* Histórico */
  const body = card.querySelector(".atb-history-body");
  card.querySelector(".history-empty").style.display = historico.length ? "none" : "block";
  card.querySelector(".table-scroll").style.display = historico.length ? "block" : "none";
  // mais recentes primeiro (pela data de prescrição)
  historico
    .slice()
    .sort((a, b) => (b.dataPrescricao || "").localeCompare(a.dataPrescricao || ""))
    .forEach((a) => body.appendChild(renderHistoryRow(a)));

  /* Escalas de avaliação (NEAD / Katz) */
  const katzBtn = card.querySelector(".btn-scale-katz");
  katzBtn.textContent = pt.katz ? "Reavaliar" : "Avaliar";
  katzBtn.addEventListener("click", () => openKatzModal(pt.id));
  card.querySelector(".katz-result").innerHTML = renderScaleResult("katz", pt.katz);

  const neadBtn = card.querySelector(".btn-scale-nead");
  neadBtn.textContent = pt.nead ? "Reavaliar" : "Avaliar";
  neadBtn.addEventListener("click", () => openNeadModal(pt.id));
  card.querySelector(".nead-result").innerHTML = renderScaleResult("nead", pt.nead);

  return node;
}

function renderAtbCard(patientId, a) {
  const wrap = document.createElement("div");
  wrap.className = "atb-card";

  const scihTag = a.scihCiente
    ? '<span class="tag tag-ok">SCIH ciente</span>'
    : '<span class="tag tag-no">SCIH não ciente</span>';

  wrap.innerHTML = `
    <div>
      <div class="atb-name">${escapeHtml(a.nome)} ${scihTag}
        <span class="tag tag-days">${tempoLabel(a.dataInicio, null)}</span>
      </div>
      <div class="atb-info">
        <span><strong>Sítio:</strong> ${escapeHtml(a.sitio || "—")}</span>
        <span><strong>Prescrição:</strong> ${formatDate(a.dataPrescricao)}</span>
        <span><strong>Início:</strong> ${formatDate(a.dataInicio)}</span>
      </div>
    </div>
    <div class="atb-actions">
      <button class="btn btn-finish">Finalizar</button>
      <button class="btn btn-delete-atb">Excluir</button>
    </div>
  `;

  wrap.querySelector(".btn-finish").addEventListener("click", () => finishAtb(patientId, a.id));
  wrap.querySelector(".btn-delete-atb").addEventListener("click", () => deleteAtb(patientId, a.id));
  return wrap;
}

function renderHistoryRow(a) {
  const tr = document.createElement("tr");
  const scih = a.scihCiente
    ? '<span class="tag tag-ok">Sim</span>'
    : '<span class="tag tag-no">Não</span>';
  tr.innerHTML = `
    <td>${formatDate(a.dataPrescricao)}</td>
    <td><strong>${escapeHtml(a.nome)}</strong></td>
    <td>${escapeHtml(a.sitio || "—")}</td>
    <td>${scih}</td>
    <td>${tempoLabel(a.dataInicio, a.dataFim)}</td>
  `;
  return tr;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ----------------------------- Escalas ---------------------------- */
/* Cada item tem opções [pontuação, rótulo]. A pontuação final é a soma
 * das opções escolhidas e a classificação é calculada automaticamente. */

// Escala de Katz — independência nas atividades de vida diária (0–6).
const KATZ_OPCOES = [
  [1, "Independente"],
  [0, "Dependente"],
];
const KATZ_ITENS = [
  { key: "banho", label: "Banhar-se", opts: KATZ_OPCOES },
  { key: "vestir", label: "Vestir-se", opts: KATZ_OPCOES },
  { key: "banheiro", label: "Ir ao banheiro", opts: KATZ_OPCOES },
  { key: "transferencia", label: "Transferência", opts: KATZ_OPCOES },
  { key: "continencia", label: "Continência", opts: KATZ_OPCOES },
  { key: "alimentacao", label: "Alimentação", opts: KATZ_OPCOES },
];

// Escala NEAD — Grupo 3: critérios de apoio para planejamento de atenção domiciliar.
const NEAD_ITENS = [
  { key: "nutricional", label: "Estado nutricional", opts: [
    [0, "Eutrófico"], [1, "Sobrepeso / Emagrecido"], [2, "Obeso / Desnutrido"] ] },
  { key: "enteral", label: "Alimentação ou medicações por via enteral", opts: [
    [0, "Sem auxílio"], [1, "Assistida"], [2, "Gastrostomia / Jejunostomia"], [3, "Por SNG / SNE"] ] },
  { key: "katz", label: "Katz (se pediatria, pontuar 2)", opts: [
    [0, "Independente"], [1, "Dependente parcial"], [2, "Dependente total"] ] },
  { key: "internacoes", label: "Internações no último ano", opts: [
    [0, "0 – 1 internação"], [1, "2 – 3 internações"], [2, "> 3 internações"] ] },
  { key: "aspiracoes", label: "Aspirações de vias aéreas superiores", opts: [
    [0, "Ausente"], [1, "Até 5 vezes ao dia"], [2, "Mais de 5 vezes ao dia"] ] },
  { key: "lesoes", label: "Lesões", opts: [
    [0, "Nenhuma ou lesão única com curativo simples"],
    [1, "Múltiplas lesões com curativos simples ou lesão única com curativo complexo"],
    [2, "Múltiplas lesões com curativos complexos"] ] },
  { key: "medicacoes", label: "Medicações", opts: [
    [0, "Via enteral"], [1, "Intramuscular ou subcutânea"], [2, "Intravenosa até 4x/dia / Hipodermóclise"] ] },
  { key: "exercicios", label: "Exercícios ventilatórios", opts: [
    [0, "Ausente"], [1, "Intermitente"] ] },
  { key: "oxigenio", label: "Uso de oxigenioterapia", opts: [
    [0, "Ausente"], [1, "Intermitente"], [2, "Contínuo"] ] },
  { key: "consciencia", label: "Nível de consciência", opts: [
    [0, "Alerta"], [1, "Confuso / Desorientado"], [2, "Comatoso"] ] },
];

function katzClass(total) {
  if (total >= 5) return { label: "Independente", cls: "ok" };
  if (total >= 3) return { label: "Dependência parcial", cls: "warn" };
  return { label: "Dependente total", cls: "no" };
}

function neadClass(total) {
  if (total <= 5) return { label: "Procedimentos pontuais exclusivos ou outros programas", cls: "ok" };
  if (total <= 11) return { label: "Atendimento Domiciliar Multiprofissional", cls: "warn" };
  if (total <= 17) return { label: "Internação Domiciliar 12h", cls: "no" };
  return { label: "Internação Domiciliar 24h", cls: "no" };
}

// Converte a avaliação Katz na pontuação correspondente do item Katz do NEAD.
function katzParaNead(katz) {
  if (!katz) return null;
  if (katz.total >= 5) return 0;
  if (katz.total >= 3) return 1;
  return 2;
}

const SCALE_META = {
  katz: { itens: KATZ_ITENS, max: 6, unidade: "/ 6", classFn: katzClass, titulo: "Escala de Katz" },
  nead: { itens: NEAD_ITENS, max: 25, unidade: "pts", classFn: neadClass, titulo: "Escala NEAD" },
};

function renderScaleResult(type, data) {
  if (!data) return '<span class="empty-msg">Ainda não avaliado.</span>';
  const meta = SCALE_META[type];
  const c = meta.classFn(data.total);
  return `
    <div class="scale-result">
      <span class="scale-score">${data.total} <small>${meta.unidade}</small></span>
      <span class="tag tag-${c.cls}">${escapeHtml(c.label)}</span>
      <span class="scale-date">Avaliado em ${formatDate(data.data)}</span>
    </div>`;
}

// Monta o formulário de uma escala e conecta o cálculo automático ao vivo.
function openScaleModal(type, current, onSave) {
  const meta = SCALE_META[type];
  const hoje = todayISO();
  const itensAtuais = current ? current.itens : {};

  const dateField = `
    <div class="field">
      <label for="f-scale-data">Data da avaliação</label>
      <input id="f-scale-data" name="__data" type="date" value="${current ? current.data : hoje}" />
    </div>`;

  const campos = meta.itens.map((it) => {
    const atual = itensAtuais[it.key];
    const opts = it.opts.map(([v, l]) =>
      `<option value="${v}" ${atual != null && Number(atual) === v ? "selected" : ""}>${escapeHtml(l)} (${v} pt${v === 1 ? "" : "s"})</option>`
    ).join("");
    return `
      <div class="field">
        <label>${escapeHtml(it.label)}</label>
        <select name="${it.key}">${opts}</select>
      </div>`;
  }).join("");

  const resultBox = `<div class="scale-live"><div class="scale-live-box"></div></div>`;

  openModal(
    meta.titulo,
    dateField + campos + resultBox,
    (data) => {
      const itens = {};
      let total = 0;
      meta.itens.forEach((it) => {
        const v = Number(data[it.key] || 0);
        itens[it.key] = v;
        total += v;
      });
      onSave({ data: data.__data || hoje, itens, total });
    },
    (form) => {
      const box = form.querySelector(".scale-live-box");
      const atualizar = () => {
        let total = 0;
        meta.itens.forEach((it) => { total += Number(form.elements[it.key].value || 0); });
        const c = meta.classFn(total);
        box.innerHTML = `
          <span class="scale-live-total">Pontuação: <strong>${total}</strong> ${meta.unidade}</span>
          <span class="tag tag-${c.cls}">${escapeHtml(c.label)}</span>`;
      };
      form.addEventListener("change", atualizar);
      atualizar();
    }
  );
}

function openKatzModal(patientId) {
  const pt = findPatient(patientId);
  if (!pt) return;
  openScaleModal("katz", pt.katz, (resultado) => {
    pt.katz = resultado;
    // Reflete automaticamente o item Katz na avaliação NEAD já existente.
    if (pt.nead) {
      pt.nead.itens.katz = katzParaNead(resultado);
      pt.nead.total = Object.values(pt.nead.itens).reduce((s, v) => s + Number(v || 0), 0);
    }
    save();
    render();
  });
}

function openNeadModal(patientId) {
  const pt = findPatient(patientId);
  if (!pt) return;
  // Se ainda não houver avaliação NEAD, aproveita o resultado da Katz para
  // pré-preencher o item correspondente (resultado automático).
  let atual = pt.nead;
  if (!atual && pt.katz) {
    atual = { data: todayISO(), itens: { katz: katzParaNead(pt.katz) }, total: 0 };
  }
  openScaleModal("nead", atual, (resultado) => {
    pt.nead = resultado;
    save();
    render();
  });
}

/* ----------------------------- Ações ------------------------------ */
function findPatient(id) {
  return patients.find((p) => p.id === id);
}

function removePatient(id) {
  const pt = findPatient(id);
  if (!pt) return;
  if (confirm(`Remover o paciente "${pt.nome}" e todos os seus registros?`)) {
    patients = patients.filter((p) => p.id !== id);
    save();
    render();
  }
}

function finishAtb(patientId, atbId) {
  const pt = findPatient(patientId);
  if (!pt) return;
  const atb = pt.antibioticos.find((a) => a.id === atbId);
  if (!atb) return;
  // Migração automática para o histórico: marca como finalizado e registra a data de término.
  atb.status = "finalizado";
  atb.dataFim = todayISO();
  save();
  render();
}

function deleteAtb(patientId, atbId) {
  const pt = findPatient(patientId);
  if (!pt) return;
  const atb = pt.antibioticos.find((a) => a.id === atbId);
  if (!atb) return;
  if (confirm(`Excluir o antibiótico "${atb.nome}"?`)) {
    pt.antibioticos = pt.antibioticos.filter((a) => a.id !== atbId);
    save();
    render();
  }
}

/* ----------------------------- Modais ----------------------------- */
const backdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalForm = document.getElementById("modalForm");

function openModal(title, fieldsHtml, onSubmit, onRender) {
  modalTitle.textContent = title;
  modalForm.innerHTML = fieldsHtml;
  backdrop.classList.remove("hidden");
  const firstInput = modalForm.querySelector("input, select");
  if (firstInput) firstInput.focus();

  // Permite que o chamador conecte cálculos ao vivo (resultado automático).
  if (typeof onRender === "function") onRender(modalForm);

  function close() {
    backdrop.classList.add("hidden");
    modalForm.onsubmit = null;
  }
  modalForm.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(modalForm).entries());
    if (onSubmit(data) !== false) close();
  };
  document.getElementById("modalCancel").onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };
}

function openPatientModal() {
  openModal(
    "Novo paciente",
    `
      <div class="field">
        <label for="f-nome">Nome do paciente *</label>
        <input id="f-nome" name="nome" required autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-leito">Leito</label>
        <input id="f-leito" name="leito" autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-registro">Registro / Prontuário</label>
        <input id="f-registro" name="registro" autocomplete="off" />
      </div>
    `,
    (data) => {
      if (!data.nome.trim()) return false;
      patients.push({
        id: uid(),
        nome: data.nome.trim(),
        leito: data.leito.trim(),
        registro: data.registro.trim(),
        antibioticos: [],
        katz: null,
        nead: null,
      });
      save();
      render();
    }
  );
}

function openAtbModal(patientId) {
  const hoje = todayISO();
  openModal(
    "Adicionar antibiótico",
    `
      <div class="field">
        <label for="f-atb-nome">Nome do antibiótico *</label>
        <input id="f-atb-nome" name="nome" required autocomplete="off" />
      </div>
      <div class="field">
        <label for="f-atb-sitio">Sítio de infecção *</label>
        <input id="f-atb-sitio" name="sitio" required autocomplete="off"
               placeholder="Ex.: trato urinário, pulmonar, corrente sanguínea..." />
      </div>
      <div class="field">
        <label for="f-atb-presc">Data da prescrição *</label>
        <input id="f-atb-presc" name="dataPrescricao" type="date" required value="${hoje}" />
      </div>
      <div class="field">
        <label for="f-atb-inicio">Início do uso *</label>
        <input id="f-atb-inicio" name="dataInicio" type="date" required value="${hoje}" />
      </div>
      <div class="field field-check">
        <input id="f-atb-scih" name="scihCiente" type="checkbox" />
        <label for="f-atb-scih">SCIH estava ciente</label>
      </div>
    `,
    (data) => {
      const pt = findPatient(patientId);
      if (!pt) return;
      if (!data.nome.trim() || !data.sitio.trim()) return false;
      pt.antibioticos.push({
        id: uid(),
        nome: data.nome.trim(),
        sitio: data.sitio.trim(),
        dataPrescricao: data.dataPrescricao || hoje,
        dataInicio: data.dataInicio || hoje,
        dataFim: null,
        scihCiente: data.scihCiente === "on",
        status: "ativo",
      });
      save();
      render();
    }
  );
}

/* --------------------------- Inicialização ------------------------ */
document.getElementById("addPatientBtn").addEventListener("click", openPatientModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") backdrop.classList.add("hidden");
});

render();
