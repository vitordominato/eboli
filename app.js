/* Éboli — gestão de antibioticoterapia
 * Persistência simples em localStorage. Sem dependências externas.
 *
 * Modelo de dados:
 *   patient = {
 *     id, nome, leito, registro,
 *     antibioticos: [ atb ]
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

function openModal(title, fieldsHtml, onSubmit) {
  modalTitle.textContent = title;
  modalForm.innerHTML = fieldsHtml;
  backdrop.classList.remove("hidden");
  const firstInput = modalForm.querySelector("input, select");
  if (firstInput) firstInput.focus();

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
