import { TEMPLATES, invoiceTotal, money, fmtDateTime, escapeHtml, STATUS_LABEL } from './contracts-shared.js';

const $ = id => document.getElementById(id);
const PW_KEY = 'ml-contracts-pw';
let password = '';
try { password = localStorage.getItem(PW_KEY) || ''; } catch { /* storage blocked */ }

let contracts = [];
let current = null;      // full contract being edited (null = new, unsaved)
let items = [];
let dirty = false;

// ---------- API ----------
async function api(path, opts = {}) {
  const r = await fetch('/api/contracts' + path, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + password, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { logout(); throw new Error('Please log in again.'); }
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- Login ----------
function logout() {
  password = '';
  try { localStorage.removeItem(PW_KEY); } catch {}
  $('app').classList.add('hidden');
  $('logout').classList.add('hidden');
  $('login').classList.remove('hidden');
}

$('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  password = $('pw').value;
  $('login-error').classList.add('hidden');
  try {
    await refreshList();
    try { localStorage.setItem(PW_KEY, password); } catch {}
    showApp();
  } catch (err) {
    $('login-error').textContent = err.message === 'Please log in again.' ? 'Wrong password.' : err.message;
    $('login-error').classList.remove('hidden');
    $('login').classList.remove('hidden');
  }
});
$('logout').addEventListener('click', logout);

function showApp() {
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('logout').classList.remove('hidden');
}

// ---------- List ----------
async function refreshList() {
  contracts = await api('');
  const list = $('list');
  $('empty').classList.toggle('hidden', contracts.length > 0);
  list.innerHTML = contracts.map(c => `
    <div class="c-row ${current && current.id === c.id ? 'active' : ''}" data-id="${c.id}" role="button" tabindex="0">
      <span class="school">${escapeHtml(c.school || 'Untitled contract')}</span>
      <span class="pill ${c.status}">${STATUS_LABEL[c.status] || c.status}</span>
      <span class="meta">${escapeHtml([c.visitDate, c.total ? money(c.total) : ''].filter(Boolean).join(' · '))}</span>
    </div>`).join('');
}

$('list').addEventListener('click', e => {
  const row = e.target.closest('.c-row');
  if (row) openContract(row.dataset.id);
});
$('list').addEventListener('keydown', e => {
  const row = e.target.closest('.c-row');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openContract(row.dataset.id); }
});

function confirmLeave() {
  return !dirty || window.confirm('You have unsaved changes. Discard them?');
}

// ---------- Editor ----------
const FIELDS = [...document.querySelectorAll('#editor [data-k]')];

function showPanel(which) {
  ['welcome', 'settings', 'editor'].forEach(p => $(p).classList.toggle('hidden', p !== which));
  if (which !== 'editor') announce(null);
}

// Lets the book-orders panel (orders-admin.js) follow which contract is open.
function announce(c) {
  document.dispatchEvent(new CustomEvent('contract:state', { detail: { contract: c, password } }));
}

function fillForm(c) {
  FIELDS.forEach(el => { el.value = c[el.dataset.k] ?? (el.tagName === 'SELECT' ? el.options[0].value : ''); });
  items = (c.invoiceItems || []).map(i => ({ ...i }));
  renderItems();
  dirty = false;
}

function readForm() {
  const out = {};
  FIELDS.forEach(el => { out[el.dataset.k] = el.value; });
  out.invoiceItems = items;
  return out;
}

function renderItems() {
  $('items').innerHTML = items.map((it, i) => `
    <div class="item-row" data-i="${i}">
      <input class="c-input" data-f="description" value="${escapeHtml(it.description)}" placeholder="Description" aria-label="Description">
      <input class="c-input" data-f="qty" type="number" min="0" step="1" value="${escapeHtml(it.qty)}" aria-label="Quantity">
      <input class="c-input" data-f="unit" type="number" min="0" step="0.01" value="${escapeHtml(it.unit)}" aria-label="Unit price ($)">
      <button type="button" class="rm" aria-label="Remove line">&times;</button>
    </div>`).join('') || '<p class="c-muted" style="margin:0">No line items yet.</p>';
  $('items-total').textContent = 'Total ' + money(invoiceTotal(items));
}

$('items').addEventListener('input', e => {
  const row = e.target.closest('.item-row'); if (!row) return;
  const it = items[+row.dataset.i]; const f = e.target.dataset.f;
  it[f] = f === 'description' ? e.target.value : Number(e.target.value);
  $('items-total').textContent = 'Total ' + money(invoiceTotal(items));
  dirty = true;
});
$('items').addEventListener('click', e => {
  if (!e.target.classList.contains('rm')) return;
  items.splice(+e.target.closest('.item-row').dataset.i, 1); renderItems(); dirty = true;
});
$('add-item').addEventListener('click', () => { items.push({ description: '', qty: 1, unit: 0 }); renderItems(); dirty = true; });
$('editor').addEventListener('input', e => { if (e.target.dataset.k) dirty = true; });

// templates
$('template').innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${escapeHtml(t.label)}</option>`).join('');
$('apply-template').addEventListener('click', () => {
  const t = TEMPLATES[$('template').value];
  const hasText = ['authorBefore', 'authorDay', 'schoolBefore', 'schoolDay'].some(k => $(k).value.trim());
  if (hasText && !window.confirm('Replace the terms below with this template?')) return;
  ['authorBefore', 'authorDay', 'schoolBefore', 'schoolDay', 'contingencyIntro', 'contingency', 'invoiceDue'].forEach(k => { $(k).value = t[k] || ''; });
  $('visitType').value = t.visitType;
  items = t.invoiceItems.map(i => ({ ...i }));
  renderItems();
  dirty = true;
});

function suggestInvoiceNumber() {
  const school = $('school').value.trim();
  if (!school || $('invoiceNumber').value.trim()) return;
  const initials = school.split(/\s+/).map(w => w[0]).join('').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  $('invoiceNumber').value = `${new Date().getFullYear()}_${initials}`;
}
$('school').addEventListener('blur', suggestInvoiceNumber);

function setEditorState(c) {
  const isNew = !c;
  const status = c?.status || 'draft';
  const signed = !!c?.signature;
  $('ed-heading').textContent = isNew ? 'New contract' : (c.school || 'Untitled contract');
  $('ed-status').className = 'pill ' + status;
  $('ed-status').textContent = STATUS_LABEL[status];
  $('template-row').classList.toggle('hidden', !isNew && !!(c.authorDay || '').trim());
  $('fields').disabled = signed;
  ['save-btn', 'send-btn', 'apply-template', 'add-item'].forEach(b => { $(b).disabled = signed; });
  ['preview-btn', 'pdf-btn', 'dup-btn', 'del-btn'].forEach(b => $(b).classList.toggle('hidden', isNew));
  $('send-btn').classList.toggle('hidden', signed);

  const tl = [];
  if (c?.createdAt) tl.push(`Created ${fmtDateTime(c.createdAt)}`);
  if (c?.sentAt) tl.push(`Sent ${fmtDateTime(c.sentAt)}`);
  if (c?.viewedAt) tl.push(`Viewed ${fmtDateTime(c.viewedAt)}`);
  if (c?.signedAt) tl.push(`Signed ${fmtDateTime(c.signedAt)}`);
  $('ed-timeline').innerHTML = tl.map(t => `<span>${escapeHtml(t)}</span>`).join('');

  $('locked').classList.toggle('hidden', !signed);
  if (signed) {
    const s = c.signature;
    $('locked').innerHTML = `<strong>Signed by ${escapeHtml(s.name)}${s.title ? ', ' + escapeHtml(s.title) : ''}</strong> on ${escapeHtml(fmtDateTime(s.signedAt))}. This contract is locked. Use <em>Duplicate</em> if anything needs to change.`;
  }
  $('ed-error').classList.add('hidden');
  announce(c);

  if (c) {
    const link = `${location.origin}/contract/${c.id}`;
    $('preview-btn').href = `/contract/${c.id}?preview=1`;
    $('pdf-btn').href = `/api/contracts/public/${c.id}/pdf?inline=1&preview=1`;
    $('share').classList.toggle('hidden', status === 'draft');
    $('share-url').value = link;
    const first = (c.contactName || '').split(' ')[0] || 'there';
    const msg = `Hi ${first}! Here's the contract for my author visit${c.visitDate ? ' on ' + c.visitDate : ''}. You can read it, sign it, and download a PDF right here: ${link}\n\nThanks so much!\nMatt`;
    const contact = (c.contactEmail || '').trim();
    const isEmail = contact.includes('@');
    $('email-link').href = `mailto:${isEmail ? contact : ''}?subject=${encodeURIComponent(`Author visit contract – ${c.school || ''}`)}&body=${encodeURIComponent(msg)}`;
    $('text-link').href = `sms:${!isEmail ? contact.replace(/[^\d+]/g, '') : ''}?&body=${encodeURIComponent(msg)}`;
  } else {
    $('share').classList.add('hidden');
  }
}

function showError(msg) {
  $('ed-error').textContent = msg;
  $('ed-error').classList.remove('hidden');
}

async function openContract(id) {
  if (!confirmLeave()) return;
  try {
    current = await api('/' + id);
    fillForm(current);
    setEditorState(current);
    showPanel('editor');
    refreshList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { toast(err.message); }
}

$('new-btn').addEventListener('click', () => {
  if (!confirmLeave()) return;
  current = null;
  fillForm({ visitType: 'in-person', invoiceDue: 'Upon day of visit' });
  setEditorState(null);
  showPanel('editor');
  $('apply-template').click();
  dirty = false;
  refreshList();
  $('school').focus();
});

async function save() {
  const data = readForm();
  if (!data.school.trim()) { showError('Add the school name first.'); $('school').focus(); return false; }
  $('save-btn').disabled = true;
  try {
    current = current ? await api('/' + current.id, { method: 'PUT', body: data })
                      : await api('', { method: 'POST', body: data });
    dirty = false;
    setEditorState(current);
    await refreshList();
    toast('Saved');
    return true;
  } catch (err) { showError(err.message); return false; }
  finally { $('save-btn').disabled = !!current?.signature; }
}

$('editor').addEventListener('submit', e => { e.preventDefault(); save(); });

$('send-btn').addEventListener('click', async () => {
  if ((dirty || !current) && !(await save())) return;
  try {
    current = await api(`/${current.id}/send`, { method: 'POST' });
    setEditorState(current);
    await refreshList();
    $('share').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('share-url').select();
  } catch (err) { showError(err.message); }
});

for (const btn of ['preview-btn', 'pdf-btn']) {
  $(btn).addEventListener('click', async (e) => {
    if (dirty) { e.preventDefault(); if (await save()) window.open($(btn).href, '_blank'); }
  });
}

$('copy-btn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('share-url').value); toast('Link copied'); }
  catch { $('share-url').select(); toast('Press Cmd+C to copy'); }
});

$('dup-btn').addEventListener('click', async () => {
  if (!confirmLeave()) return;
  try {
    const copy = await api(`/${current.id}/duplicate`, { method: 'POST' });
    dirty = false;
    await openContract(copy.id);
    toast('Duplicated as a new draft');
  } catch (err) { showError(err.message); }
});

$('del-btn').addEventListener('click', async () => {
  const warn = current.signature ? 'This contract is SIGNED. Delete it permanently?' : `Delete the contract for ${current.school || 'this school'}?`;
  if (!window.confirm(warn)) return;
  try {
    await api('/' + current.id, { method: 'DELETE' });
    current = null; dirty = false;
    showPanel('welcome');
    await refreshList();
    toast('Deleted');
  } catch (err) { showError(err.message); }
});

// ---------- Settings ----------
$('settings-btn').addEventListener('click', async () => {
  if (!confirmLeave()) return;
  try {
    const s = await api('/settings');
    $('s-name').value = s.authorName || ''; $('s-phone').value = s.phone || '';
    $('s-email').value = s.email || ''; $('s-address').value = s.address || '';
    current = null; dirty = false;
    showPanel('settings');
    refreshList();
  } catch (err) { toast(err.message); }
});
$('settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/settings', { method: 'PUT', body: { authorName: $('s-name').value, phone: $('s-phone').value, email: $('s-email').value, address: $('s-address').value } });
    toast('Saved');
  } catch (err) { toast(err.message); }
});

window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Start ----------
(async () => {
  if (password) {
    try { await refreshList(); showApp(); return; } catch { /* fall through to login */ }
  }
  $('login').classList.remove('hidden');
})();
