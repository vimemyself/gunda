/* ==========================================================================
   Opportunity Dashboard — Application Logic
   Full manual editing: add, edit, delete for opportunities and actions.
   Local edits accumulate; user copies updated data.json to GitHub to persist.
   ========================================================================== */

let DATA = { opportunities: [], standaloneActions: [], lastUpdated: null };
let SAVED_SNAPSHOT = '';   // JSON string of last saved (loaded) state, for diff
let UNSAVED_COUNT = 0;
const PALETTE_COUNT = 8;

// GitHub repo info — auto-detected from URL on github.io, or user can configure
let REPO_URL = ''; // e.g. https://github.com/username/opportunity-dashboard

/* ---------- Boot ---------- */
async function init() {
  try {
    const res = await fetch('data.json?_=' + Date.now());
    DATA = await res.json();
  } catch (e) {
    console.error('Could not load data.json', e);
    DATA = { opportunities: [], standaloneActions: [], lastUpdated: new Date().toISOString() };
  }

  // Assign stable color index to each opportunity (1..PALETTE_COUNT)
  DATA.opportunities.forEach((opp, i) => {
    if (!opp.colorIndex) opp.colorIndex = ((i % PALETTE_COUNT) + 1);
  });

  SAVED_SNAPSHOT = JSON.stringify(DATA);
  detectRepoUrl();

  setupTabs();
  setupFilters();
  render();
  updateLastUpdated();
  updateConnectionStatus();
}

function detectRepoUrl() {
  // GitHub Pages URL: https://USER.github.io/REPO/
  const host = location.hostname;
  const path = location.pathname.replace(/\/$/, '');
  if (host.endsWith('.github.io')) {
    const user = host.replace('.github.io', '');
    const repo = path.split('/').filter(Boolean)[0] || '';
    if (user && repo) REPO_URL = `https://github.com/${user}/${repo}`;
  }
}

function updateLastUpdated() {
  const el = document.getElementById('last-updated');
  if (DATA.lastUpdated) {
    const d = new Date(DATA.lastUpdated);
    el.textContent = `Last saved ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else {
    el.textContent = 'Just initialized';
  }
}

/* ---------- Tabs ---------- */
function setupTabs() {
  document.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ptab').forEach(t => t.classList.remove('ptab-active'));
      tab.classList.add('ptab-active');
      const view = tab.dataset.view;
      document.getElementById('view-opps').style.display = view === 'opps' ? '' : 'none';
      document.getElementById('view-actions').style.display = view === 'actions' ? '' : 'none';
    });
  });
}

/* ---------- Filters / search ---------- */
function setupFilters() {
  document.getElementById('opp-search').addEventListener('input', renderOpportunities);
  document.getElementById('opp-filter-client').addEventListener('change', renderOpportunities);
  document.getElementById('opp-sort').addEventListener('change', renderOpportunities);
  document.getElementById('act-filter').addEventListener('change', renderActions);
  document.getElementById('act-group').addEventListener('change', renderActions);
}

/* ---------- Helpers ---------- */
function fmtCurrency(n) {
  const v = Number(n) || 0;
  // Stored value is in USD millions. Trim trailing zeros: 1.5 -> $1.5M, 1 -> $1M, 0.34 -> $0.34M
  let str = v.toFixed(2);
  str = str.replace(/\.?0+$/, '');
  return '$' + str + 'M';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysFromNow(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

function dueLabel(iso) {
  if (!iso) return { text: 'No due date', cls: '' };
  const days = daysFromNow(iso);
  if (days < 0) return { text: `Due ${fmtDate(iso)} · Overdue ${Math.abs(days)}d`, cls: 'danger' };
  if (days === 0) return { text: `Due today`, cls: 'warn' };
  if (days <= 3) return { text: `Due ${fmtDate(iso)}`, cls: 'warn' };
  return { text: `Due ${fmtDate(iso)}`, cls: '' };
}

function colorVars(idx) {
  const i = idx || 1;
  return `--c-color: var(--c${i}); --c-bg: var(--c${i}-bg); --c-ink: var(--c${i}-ink);`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function escapeAttr(s) { return escapeHtml(s); }

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function nextColorIndex() {
  const used = DATA.opportunities.map(o => o.colorIndex || 0);
  for (let i = 1; i <= PALETTE_COUNT; i++) {
    if (!used.includes(i)) return i;
  }
  return ((DATA.opportunities.length % PALETTE_COUNT) + 1);
}

/* ---------- Render ---------- */
function render() {
  renderMetrics();
  renderClientFilter();
  renderOpportunities();
  renderActions();
  renderTabCounts();
  updateSaveBanner();
}

function renderTabCounts() {
  document.getElementById('count-opps').textContent = DATA.opportunities.length;
  const allActions = collectAllActions();
  document.getElementById('count-actions').textContent = allActions.filter(a => !a.done).length;
}

function renderMetrics() {
  const allActions = collectAllActions();
  const open = allActions.filter(a => !a.done);
  const overdue = open.filter(a => a.dueDate && daysFromNow(a.dueDate) < 0);
  const linked = open.filter(a => a.opportunityId);
  const standalone = open.filter(a => !a.opportunityId);

  const totalPipeline = DATA.opportunities.reduce((s, o) => s + (Number(o.size) || 0), 0);
  const thisMonth = DATA.opportunities.filter(o => {
    if (!o.etaCloseDate) return false;
    const d = new Date(o.etaCloseDate); const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, o) => s + (Number(o.size) || 0), 0);

  // Opportunities view metrics
  setText('metric-pipeline', fmtCurrency(totalPipeline));
  setText('metric-opps', DATA.opportunities.length);
  setText('metric-thismonth', fmtCurrency(thisMonth));
  setText('metric-overdue', overdue.length);
  toggleEl('metric-overdue-pill', overdue.length > 0);

  // Actions view metrics
  setText('metric-actions-open', open.length);
  setText('metric-actions-overdue', overdue.length);
  setText('metric-actions-linked', linked.length);
  setText('metric-actions-standalone', standalone.length);
  toggleEl('metric-overdue-pill-2', overdue.length > 0);

  // Opp count text
  setText('opp-count-text', DATA.opportunities.length);

  // Top status badge — Active (green) if any, else Empty (neutral)
  const statusEl = document.getElementById('overall-status');
  if (statusEl) {
    if (DATA.opportunities.length === 0) {
      statusEl.className = 'status-badge neutral';
      statusEl.innerHTML = '<span class="dot"></span> No data';
    } else if (overdue.length > 0) {
      statusEl.className = 'status-badge warn';
      statusEl.innerHTML = '<span class="dot"></span> Attention needed';
    } else {
      statusEl.className = 'status-badge success';
      statusEl.innerHTML = '<span class="dot"></span> Active';
    }
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toggleEl(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? '' : 'none';
}

function renderClientFilter() {
  const select = document.getElementById('opp-filter-client');
  const current = select.value;
  const clients = [...new Set(DATA.opportunities.map(o => o.clientName))].sort();
  select.innerHTML = '<option value="">All clients</option>' + clients.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(c)}</option>`).join('');
  if (clients.includes(current)) select.value = current;
}

function renderOpportunities() {
  const search = document.getElementById('opp-search').value.toLowerCase();
  const filterClient = document.getElementById('opp-filter-client').value;
  const sortBy = document.getElementById('opp-sort').value;

  let opps = DATA.opportunities.slice();

  if (search) {
    opps = opps.filter(o =>
      (o.clientName || '').toLowerCase().includes(search) ||
      (o.opportunityName || '').toLowerCase().includes(search) ||
      (o.description || '').toLowerCase().includes(search)
    );
  }
  if (filterClient) opps = opps.filter(o => o.clientName === filterClient);

  opps.sort((a, b) => {
    if (sortBy === 'size') return (Number(b.size) || 0) - (Number(a.size) || 0);
    if (sortBy === 'received') return new Date(b.receivedDate || 0) - new Date(a.receivedDate || 0);
    return new Date(a.etaCloseDate || '9999') - new Date(b.etaCloseDate || '9999');
  });

  const list = document.getElementById('opps-list');
  const empty = document.getElementById('opps-empty');
  if (opps.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = opps.map(renderOpportunityCard).join('');
}

function renderOpportunityCard(opp) {
  const actions = (opp.actions || []);
  const openCount = actions.filter(a => !a.done).length;
  const doneCount = actions.length - openCount;
  const countLabel = actions.length === 0 ? 'No actions' :
    doneCount > 0 ? `${openCount} open · ${doneCount} done` : `${openCount} open`;

  const actionsHtml = actions.length === 0
    ? `<p style="font-size:12.5px;color:var(--ink-3);font-style:italic;">No actions yet.</p>`
    : actions.map(a => renderActionRow(a, opp.id)).join('');

  // Stage / status badge — derived from action state
  let statusBadge = '';
  const overdueCount = actions.filter(a => !a.done && a.dueDate && daysFromNow(a.dueDate) < 0).length;
  if (overdueCount > 0) {
    statusBadge = `<span class="status-badge warn"><span class="dot"></span>At Risk</span>`;
  } else if (openCount === 0 && actions.length > 0) {
    statusBadge = `<span class="status-badge success"><span class="dot"></span>Up to date</span>`;
  } else if (openCount > 0) {
    statusBadge = `<span class="status-badge accent"><span class="dot"></span>Active</span>`;
  } else {
    statusBadge = `<span class="status-badge neutral"><span class="dot"></span>New</span>`;
  }

  return `
    <article class="opp-card" style="${colorVars(opp.colorIndex)}">
      <button class="opp-delete-btn" onclick="confirmDeleteOpportunity('${opp.id}')" title="Delete this opportunity">
        <i class="ti ti-trash"></i>
      </button>

      <div class="opp-card-header">
        <div class="opp-icon-chip"><i class="ti ti-briefcase"></i></div>
        <div class="opp-header-text">
          <div class="opp-client">
            <span>${escapeHtml(opp.clientName)}</span>
            ${statusBadge}
          </div>
          <div class="opp-size-tag">${fmtCurrency(opp.size)}</div>
        </div>
      </div>

      <h3 class="opp-name" onclick="openOpportunityForm('${opp.id}')" title="Click to edit">${escapeHtml(opp.opportunityName)}</h3>
      ${opp.description ? `<p class="opp-description">${escapeHtml(opp.description)}</p>` : ''}

      <div class="opp-meta">
        <span><i class="ti ti-calendar-event"></i>Received ${fmtDate(opp.receivedDate)}</span>
        <span><i class="ti ti-target"></i>Close ${fmtDate(opp.etaCloseDate)}</span>
        <a class="opp-meta-edit" href="#" onclick="event.preventDefault();openOpportunityForm('${opp.id}')"><i class="ti ti-edit"></i>Edit</a>
      </div>

      ${opp.keyAspects ? `
        <div class="opp-section">
          <div class="opp-section-title">Key aspects</div>
          <div class="opp-aspects-text">${escapeHtml(opp.keyAspects)}</div>
        </div>
      ` : ''}

      <div class="opp-actions-block">
        <div class="opp-actions-header">
          <div class="opp-actions-meta">Actions <span class="opp-actions-count">${countLabel}</span></div>
          <button class="btn btn-small" onclick="openActionForm(null, '${opp.id}')">
            <i class="ti ti-plus"></i> Add
          </button>
        </div>
        ${actionsHtml}
      </div>
    </article>
  `;
}

function renderActionRow(action, opportunityId) {
  const due = action.dueDate ? dueLabel(action.dueDate) : { text: '', cls: '' };
  const oppArg = opportunityId ? `'${opportunityId}'` : 'null';
  return `
    <label class="action-row ${action.done ? 'done' : ''}">
      <input type="checkbox" ${action.done ? 'checked' : ''} onchange="toggleAction('${action.id}', ${oppArg})">
      <span class="action-text" onclick="event.preventDefault();openActionForm('${action.id}', ${oppArg})" style="cursor:pointer;" title="Click to edit">${escapeHtml(action.text)}</span>
      <span class="action-due ${due.cls}">${due.text || (action.done ? 'Done' : '')}</span>
      <button class="action-delete-btn" onclick="event.preventDefault();confirmDeleteAction('${action.id}', ${oppArg})" title="Delete">
        <i class="ti ti-x"></i>
      </button>
    </label>
  `;
}

/* ---------- Actions view ---------- */
function collectAllActions() {
  const out = [];
  DATA.opportunities.forEach(opp => {
    (opp.actions || []).forEach(a => out.push({ ...a, opportunityId: opp.id, _opp: opp }));
  });
  (DATA.standaloneActions || []).forEach(a => out.push({ ...a, opportunityId: null }));
  return out;
}

function renderActions() {
  const filter = document.getElementById('act-filter').value;
  const group = document.getElementById('act-group').value;

  let actions = collectAllActions();

  if (filter === 'linked') actions = actions.filter(a => a.opportunityId);
  if (filter === 'standalone') actions = actions.filter(a => !a.opportunityId);
  if (filter === 'open') actions = actions.filter(a => !a.done);
  if (filter === 'done') actions = actions.filter(a => a.done);

  const list = document.getElementById('actions-list');
  const empty = document.getElementById('actions-empty');
  if (actions.length === 0) { list.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  if (group === 'opp') {
    list.innerHTML = renderActionsByOpp(actions);
  } else {
    list.innerHTML = renderActionsByDue(actions);
  }
}

function renderActionsByDue(actions) {
  const overdue = [], thisWeek = [], later = [], noDate = [], done = [];
  actions.forEach(a => {
    if (a.done) { done.push(a); return; }
    if (!a.dueDate) { noDate.push(a); return; }
    const d = daysFromNow(a.dueDate);
    if (d < 0) overdue.push(a);
    else if (d <= 7) thisWeek.push(a);
    else later.push(a);
  });

  const sortByDue = (a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999');
  [overdue, thisWeek, later].forEach(arr => arr.sort(sortByDue));

  let html = '';
  if (overdue.length) html += `<div class="actions-section-label danger">Overdue · ${overdue.length}</div>` + overdue.map(renderActionCard).join('');
  if (thisWeek.length) html += `<div class="actions-section-label">This week · ${thisWeek.length}</div>` + thisWeek.map(renderActionCard).join('');
  if (later.length) html += `<div class="actions-section-label">Later · ${later.length}</div>` + later.map(renderActionCard).join('');
  if (noDate.length) html += `<div class="actions-section-label">No due date · ${noDate.length}</div>` + noDate.map(renderActionCard).join('');
  if (done.length) html += `<div class="actions-section-label">Completed · ${done.length}</div>` + done.map(renderActionCard).join('');
  return html;
}

function renderActionsByOpp(actions) {
  const groups = {};
  actions.forEach(a => {
    const key = a.opportunityId || '__standalone__';
    if (!groups[key]) groups[key] = { items: [], opp: a._opp || null };
    groups[key].items.push(a);
  });

  return Object.keys(groups).map(key => {
    const g = groups[key];
    const label = g.opp ? `${g.opp.clientName} — ${g.opp.opportunityName}` : 'Standalone tasks';
    return `<div class="actions-section-label">${escapeHtml(label)} · ${g.items.length}</div>` + g.items.map(renderActionCard).join('');
  }).join('');
}

function renderActionCard(action) {
  const opp = action._opp;
  const colorIdx = opp ? opp.colorIndex : null;
  const styleVars = colorIdx ? colorVars(colorIdx) : '--c-color: var(--c-neutral); --c-bg: var(--c-neutral-bg); --c-ink: var(--c-neutral-ink);';
  const oppArg = action.opportunityId ? `'${action.opportunityId}'` : 'null';

  const due = action.dueDate ? dueLabel(action.dueDate) : { text: action.done ? 'Done' : 'No due date', cls: '' };

  const linkBlock = opp
    ? `<div class="action-link-info">
         <span class="action-link-chip"><i class="ti ti-briefcase"></i>${escapeHtml(opp.clientName)}</span>
         <span class="action-link-opp">${escapeHtml(opp.opportunityName)}</span>
       </div>`
    : `<div class="action-link-info">
         <span class="action-link-chip" style="background: var(--c-neutral-bg); color: var(--c-neutral-ink);"><i class="ti ti-circle-dashed"></i>Standalone</span>
       </div>`;

  return `
    <div class="action-card" style="${styleVars}">
      <div class="action-card-top">
        ${linkBlock}
        <span class="action-due ${due.cls}">${due.text}</span>
      </div>
      <label class="action-row ${action.done ? 'done' : ''}">
        <input type="checkbox" ${action.done ? 'checked' : ''} onchange="toggleAction('${action.id}', ${oppArg})">
        <span class="action-text" onclick="event.preventDefault();openActionForm('${action.id}', ${oppArg})" style="cursor:pointer;" title="Click to edit">${escapeHtml(action.text)}</span>
        <button class="action-delete-btn" onclick="event.preventDefault();confirmDeleteAction('${action.id}', ${oppArg})" title="Delete">
          <i class="ti ti-x"></i>
        </button>
      </label>
    </div>
  `;
}

/* ==========================================================================
   MUTATIONS
   ========================================================================== */

/* ---------- Toggle action done ---------- */
function toggleAction(actionId, opportunityId) {
  const action = findAction(actionId, opportunityId);
  if (!action) return;
  action.done = !action.done;
  markDirty();
  render();
}

function findAction(actionId, opportunityId) {
  if (opportunityId) {
    const opp = DATA.opportunities.find(o => o.id === opportunityId);
    if (!opp) return null;
    return (opp.actions || []).find(a => a.id === actionId);
  }
  return (DATA.standaloneActions || []).find(a => a.id === actionId);
}

/* ---------- Delete opportunity ---------- */
function confirmDeleteOpportunity(oppId) {
  const opp = DATA.opportunities.find(o => o.id === oppId);
  if (!opp) return;
  const actionCount = (opp.actions || []).length;
  const body = `Delete <strong>${escapeHtml(opp.clientName)} — ${escapeHtml(opp.opportunityName)}</strong>?` +
    (actionCount ? ` This will also remove ${actionCount} linked action${actionCount === 1 ? '' : 's'}.` : '');
  showModal('Delete opportunity?', body, () => {
    DATA.opportunities = DATA.opportunities.filter(o => o.id !== oppId);
    markDirty();
    render();
    showToast('Opportunity deleted');
  });
}

/* ---------- Delete action ---------- */
function confirmDeleteAction(actionId, opportunityId) {
  const action = findAction(actionId, opportunityId);
  if (!action) return;
  const body = `Delete the action: <em>"${escapeHtml(action.text)}"</em>?`;
  showModal('Delete action?', body, () => {
    if (opportunityId) {
      const opp = DATA.opportunities.find(o => o.id === opportunityId);
      if (opp) opp.actions = (opp.actions || []).filter(a => a.id !== actionId);
    } else {
      DATA.standaloneActions = (DATA.standaloneActions || []).filter(a => a.id !== actionId);
    }
    markDirty();
    render();
    showToast('Action deleted');
  });
}

/* ==========================================================================
   FORMS — opportunity and action editors
   ========================================================================== */

function openOpportunityForm(oppId) {
  const isEdit = !!oppId;
  const opp = isEdit ? DATA.opportunities.find(o => o.id === oppId) : null;

  const html = `
    <h3>${isEdit ? 'Edit opportunity' : 'New opportunity'}</h3>
    <div class="form-grid">
      <label class="form-field">
        <span>Client name</span>
        <input type="text" id="f-clientName" value="${escapeAttr(opp?.clientName || '')}" required>
      </label>
      <label class="form-field">
        <span>Opportunity name</span>
        <input type="text" id="f-opportunityName" value="${escapeAttr(opp?.opportunityName || '')}" required>
      </label>
      <label class="form-field full">
        <span>Description</span>
        <textarea id="f-description" rows="2">${escapeHtml(opp?.description || '')}</textarea>
      </label>
      <label class="form-field">
        <span>Opportunity size (USD millions)</span>
        <input type="number" id="f-size" value="${opp?.size ?? ''}" min="0" step="0.01" placeholder="e.g. 1.5">
      </label>
      <label class="form-field">
        <span>Received date</span>
        <input type="date" id="f-receivedDate" value="${escapeAttr(opp?.receivedDate || '')}">
      </label>
      <label class="form-field">
        <span>ETA close date</span>
        <input type="date" id="f-etaCloseDate" value="${escapeAttr(opp?.etaCloseDate || '')}">
      </label>
      <label class="form-field full">
        <span>Key aspects</span>
        <textarea id="f-keyAspects" rows="3">${escapeHtml(opp?.keyAspects || '')}</textarea>
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveOpportunityForm('${oppId || ''}')">${isEdit ? 'Save changes' : 'Add opportunity'}</button>
    </div>
  `;
  showFormModal(html);
  // Focus first field
  setTimeout(() => { const el = document.getElementById('f-clientName'); el && el.focus(); }, 30);
}

function saveOpportunityForm(oppId) {
  const v = id => document.getElementById(id).value.trim();
  const clientName = v('f-clientName');
  const opportunityName = v('f-opportunityName');
  if (!clientName || !opportunityName) {
    showToast('Client name and opportunity name are required');
    return;
  }

  const fields = {
    clientName,
    opportunityName,
    description: v('f-description'),
    size: Number(document.getElementById('f-size').value) || 0,
    receivedDate: v('f-receivedDate'),
    etaCloseDate: v('f-etaCloseDate'),
    keyAspects: v('f-keyAspects'),
  };

  if (oppId) {
    const opp = DATA.opportunities.find(o => o.id === oppId);
    if (!opp) return;
    Object.assign(opp, fields);
    showToast('Opportunity updated');
  } else {
    const newOpp = {
      id: generateId('opp'),
      ...fields,
      colorIndex: nextColorIndex(),
      actions: []
    };
    DATA.opportunities.push(newOpp);
    showToast('Opportunity added');
  }

  markDirty();
  closeModal();
  render();
}

function openActionForm(actionId, opportunityId) {
  const isEdit = !!actionId;
  const action = isEdit ? findAction(actionId, opportunityId) : null;
  const linkVal = action ? (opportunityId || '') : (opportunityId || '');

  const oppOptions = '<option value="">— Standalone (not linked) —</option>' +
    DATA.opportunities.map(o => `<option value="${escapeAttr(o.id)}" ${linkVal === o.id ? 'selected' : ''}>${escapeHtml(o.clientName)} — ${escapeHtml(o.opportunityName)}</option>`).join('');

  const html = `
    <h3>${isEdit ? 'Edit action' : 'New action'}</h3>
    <div class="form-grid">
      <label class="form-field full">
        <span>Action description</span>
        <input type="text" id="f-actText" value="${escapeAttr(action?.text || '')}" placeholder="e.g. Send pricing proposal" required>
      </label>
      <label class="form-field">
        <span>Due date</span>
        <input type="date" id="f-actDue" value="${escapeAttr(action?.dueDate || '')}">
      </label>
      <label class="form-field">
        <span>Status</span>
        <select id="f-actDone">
          <option value="false" ${!action?.done ? 'selected' : ''}>Open</option>
          <option value="true" ${action?.done ? 'selected' : ''}>Done</option>
        </select>
      </label>
      <label class="form-field full">
        <span>Linked to opportunity</span>
        <select id="f-actOpp">${oppOptions}</select>
      </label>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveActionForm('${actionId || ''}', '${opportunityId || ''}')">${isEdit ? 'Save changes' : 'Add action'}</button>
    </div>
  `;
  showFormModal(html);
  setTimeout(() => { const el = document.getElementById('f-actText'); el && el.focus(); }, 30);
}

function saveActionForm(existingActionId, existingOpportunityId) {
  const text = document.getElementById('f-actText').value.trim();
  if (!text) { showToast('Action description is required'); return; }
  const dueDate = document.getElementById('f-actDue').value.trim();
  const done = document.getElementById('f-actDone').value === 'true';
  const newOppId = document.getElementById('f-actOpp').value;

  // If editing, remove from old location first
  if (existingActionId) {
    if (existingOpportunityId) {
      const oldOpp = DATA.opportunities.find(o => o.id === existingOpportunityId);
      if (oldOpp) oldOpp.actions = (oldOpp.actions || []).filter(a => a.id !== existingActionId);
    } else {
      DATA.standaloneActions = (DATA.standaloneActions || []).filter(a => a.id !== existingActionId);
    }
  }

  const actionObj = {
    id: existingActionId || generateId('a'),
    text,
    dueDate: dueDate || undefined,
    done
  };
  // Strip undefined dueDate to keep JSON clean
  if (!actionObj.dueDate) delete actionObj.dueDate;

  if (newOppId) {
    const target = DATA.opportunities.find(o => o.id === newOppId);
    if (!target) { showToast('Linked opportunity not found'); return; }
    target.actions = target.actions || [];
    target.actions.push(actionObj);
  } else {
    DATA.standaloneActions = DATA.standaloneActions || [];
    DATA.standaloneActions.push(actionObj);
  }

  markDirty();
  closeModal();
  render();
  showToast(existingActionId ? 'Action updated' : 'Action added');
}

/* ==========================================================================
   SAVE BANNER + GITHUB API AUTO-SAVE
   ========================================================================== */

function markDirty() {
  const current = JSON.stringify(DATA);
  if (current === SAVED_SNAPSHOT) {
    UNSAVED_COUNT = 0;
  } else {
    UNSAVED_COUNT++;
  }
  updateSaveBanner();
}

function updateSaveBanner() {
  const banner = document.getElementById('save-banner');
  const current = JSON.stringify(DATA);
  if (current === SAVED_SNAPSHOT) {
    banner.style.display = 'none';
    UNSAVED_COUNT = 0;
    return;
  }
  banner.style.display = '';
  document.getElementById('unsaved-count').textContent = UNSAVED_COUNT || '·';
  document.getElementById('unsaved-noun').textContent = UNSAVED_COUNT === 1 ? 'change' : 'changes';

  // Update save button text based on whether token is configured
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) {
    const hasToken = !!getGitHubToken();
    saveBtn.innerHTML = hasToken
      ? '<i class="ti ti-device-floppy"></i> Save to GitHub'
      : '<i class="ti ti-clipboard-copy"></i> Copy updated data.json';
  }
}

function discardChanges() {
  showModal('Discard all unsaved changes?', 'Your local edits will be reverted to the last saved version.', () => {
    DATA = JSON.parse(SAVED_SNAPSHOT);
    UNSAVED_COUNT = 0;
    render();
    showToast('Changes discarded');
  });
}

/* ---------- GitHub Token Management ---------- */
const TOKEN_KEY = 'opp-dashboard-gh-token';
const REPO_INFO_KEY = 'opp-dashboard-repo-info';

function getGitHubToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function setGitHubToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

function clearGitHubToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

function getRepoInfo() {
  // Returns { owner, repo } from stored value or auto-detected
  try {
    const stored = localStorage.getItem(REPO_INFO_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}

  // Auto-detect from URL on github.io
  const host = location.hostname;
  const path = location.pathname.replace(/\/$/, '');
  if (host.endsWith('.github.io')) {
    const owner = host.replace('.github.io', '');
    const repo = path.split('/').filter(Boolean)[0] || '';
    if (owner && repo) return { owner, repo };
  }
  return null;
}

function setRepoInfo(owner, repo) {
  try { localStorage.setItem(REPO_INFO_KEY, JSON.stringify({ owner, repo })); } catch {}
}

/* ---------- Setup Flow (first-time per device) ---------- */
function openSetupModal() {
  const info = getRepoInfo();
  const token = getGitHubToken();
  const html = `
    <h3>Connect to GitHub</h3>
    <p>Enter your Personal Access Token so the dashboard can save directly to your repository. This is stored only in your browser on this device.</p>
    <div class="form-grid">
      <label class="form-field full">
        <span>GitHub Personal Access Token</span>
        <input type="password" id="f-ghToken" value="${escapeAttr(token)}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
      </label>
      <label class="form-field">
        <span>Repository owner (your GitHub username)</span>
        <input type="text" id="f-ghOwner" value="${escapeAttr(info?.owner || '')}" placeholder="e.g. johndoe">
      </label>
      <label class="form-field">
        <span>Repository name</span>
        <input type="text" id="f-ghRepo" value="${escapeAttr(info?.repo || '')}" placeholder="e.g. opportunity-dashboard">
      </label>
    </div>
    <p style="font-size:12px;color:var(--ink-3);margin-bottom:16px;">
      <i class="ti ti-info-circle" style="vertical-align:-2px;"></i>
      Need a token? Go to GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate. Give it only <strong>Contents: Read and write</strong> permission for this repo.
    </p>
    <div class="modal-actions">
      ${token ? '<button class="btn" onclick="disconnectGitHub()" style="margin-right:auto;color:var(--status-danger);">Disconnect</button>' : ''}
      <button class="btn" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveSetup()">Connect</button>
    </div>
  `;
  showFormModal(html);
  setTimeout(() => { const el = document.getElementById('f-ghToken'); el && el.focus(); }, 30);
}

function saveSetup() {
  const token = document.getElementById('f-ghToken').value.trim();
  const owner = document.getElementById('f-ghOwner').value.trim();
  const repo = document.getElementById('f-ghRepo').value.trim();
  if (!token || !owner || !repo) {
    showToast('All three fields are required');
    return;
  }
  setGitHubToken(token);
  setRepoInfo(owner, repo);
  closeModal();
  updateSaveBanner();
  updateConnectionStatus();
  showToast('GitHub connected — you can now save with one click');
}

function disconnectGitHub() {
  clearGitHubToken();
  closeModal();
  updateSaveBanner();
  updateConnectionStatus();
  showToast('GitHub disconnected');
}

function updateConnectionStatus() {
  const el = document.getElementById('gh-status');
  if (!el) return;
  const token = getGitHubToken();
  const info = getRepoInfo();
  if (token && info) {
    el.innerHTML = `<span class="status-badge success"><span class="dot"></span>Connected</span>`;
  } else {
    el.innerHTML = `<span class="status-badge neutral"><span class="dot"></span>Not connected</span>`;
  }
}

/* ---------- One-Click Save to GitHub ---------- */
async function saveToGitHub() {
  const token = getGitHubToken();
  const info = getRepoInfo();

  if (!token || !info) {
    // Fallback to copy-paste if not connected
    copyUpdatedJSON();
    return;
  }

  const saveBtn = document.getElementById('save-btn');
  const origHtml = saveBtn.innerHTML;
  saveBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Saving...';
  saveBtn.disabled = true;

  try {
    DATA.lastUpdated = new Date().toISOString();
    const content = JSON.stringify(DATA, null, 2);
    const encoded = btoa(unescape(encodeURIComponent(content)));

    // Get current file SHA (required for updates)
    const getRes = await fetch(
      `https://api.github.com/repos/${info.owner}/${info.repo}/contents/data.json`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
    );

    if (getRes.status === 401 || getRes.status === 403) {
      throw new Error('Token expired or invalid. Please reconnect via the Settings button.');
    }

    let sha = '';
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // Commit the update
    const putBody = {
      message: `Update dashboard data — ${new Date().toLocaleString()}`,
      content: encoded,
      branch: 'main'
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${info.owner}/${info.repo}/contents/data.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(putBody)
      }
    );

    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error ${putRes.status}`);
    }

    SAVED_SNAPSHOT = JSON.stringify(DATA);
    UNSAVED_COUNT = 0;
    updateSaveBanner();
    updateLastUpdated();
    showToast('Saved to GitHub! Site updates in ~30 seconds.');

  } catch (e) {
    console.error('GitHub save failed:', e);
    showToast(e.message || 'Save failed — check your token and try again');
  } finally {
    saveBtn.innerHTML = origHtml;
    saveBtn.disabled = false;
  }
}

/* ---------- Fallback: Copy JSON to clipboard ---------- */
function copyUpdatedJSON() {
  DATA.lastUpdated = new Date().toISOString();
  const text = JSON.stringify(DATA, null, 2);

  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied! Now paste into data.json on GitHub.');
    SAVED_SNAPSHOT = JSON.stringify(DATA);
    UNSAVED_COUNT = 0;
    updateSaveBanner();
    updateLastUpdated();
  }).catch(() => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
    SAVED_SNAPSHOT = JSON.stringify(DATA);
    UNSAVED_COUNT = 0;
    updateSaveBanner();
    showToast('Downloaded — upload data.json to your repo');
  });
}

function openGitHubEditor() {
  const info = getRepoInfo();
  if (info) {
    window.open(`https://github.com/${info.owner}/${info.repo}/edit/main/data.json`, '_blank');
  } else if (REPO_URL) {
    window.open(`${REPO_URL}/edit/main/data.json`, '_blank');
  } else {
    const url = window.prompt(
      'Enter your GitHub repo URL (e.g. https://github.com/yourname/opportunity-dashboard):',
      ''
    );
    if (url) {
      REPO_URL = url.replace(/\/$/, '');
      window.open(`${REPO_URL}/edit/main/data.json`, '_blank');
    }
  }
}

/* ==========================================================================
   MODAL HELPERS
   ========================================================================== */

function showModal(title, bodyHtml, onConfirm) {
  const overlay = document.getElementById('modal-overlay');
  // Restore default modal structure (in case form-modal swapped it)
  overlay.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <p>${bodyHtml}</p>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" id="modal-confirm">Delete</button>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
  document.getElementById('modal-confirm').onclick = () => {
    onConfirm();
    closeModal();
  };
}

function showFormModal(innerHtml) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `<div class="modal modal-form">${innerHtml}</div>`;
  overlay.style.display = 'flex';
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'none';
  overlay.innerHTML = '';
}

// Close modal on outside click + Esc
document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ==========================================================================
   CLAUDE BRIDGE (still useful for bulk asks)
   ========================================================================== */

function askClaude(prompt) {
  navigator.clipboard.writeText(prompt).then(() => {
    showToast('Prompt copied — paste into Claude chat');
  }).catch(() => {
    window.prompt('Copy this prompt and paste it into Claude chat:', prompt);
  });
}

/* ==========================================================================
   TOAST
   ========================================================================== */

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- Download (manual backup) ---------- */
function downloadJSON() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Warn before navigating away with unsaved changes ---------- */
window.addEventListener('beforeunload', (e) => {
  if (JSON.stringify(DATA) !== SAVED_SNAPSHOT) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('DOMContentLoaded', init);
