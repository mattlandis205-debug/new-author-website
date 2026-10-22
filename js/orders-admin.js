import { BOOKS, slugify, orderTotal } from './orders-shared.js';
import { escapeHtml, money, fmtDateTime } from './contracts-shared.js';

const $ = id => document.getElementById(id);
let contract = null, password = '', settings = null, orders = [], loadedFor = null;

async function api(path, opts = {}) {
  const r = await fetch('/api/orders/admin/' + contract.id + path, {
    ...opts,
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + password },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (opts.raw) { if (!r.ok) throw new Error('Download failed'); return r; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
}
function showError(msg) { $('o-error').textContent = msg; $('o-error').classList.toggle('hidden', !msg); }
const fmt = n => money(n).replace(/\.00$/, '');

document.addEventListener('contract:state', async (e) => {
  contract = e.detail.contract; password = e.detail.password;
  $('orders-card').classList.toggle('hidden', !contract);
  if (!contract) { loadedFor = null; return; }
  if (loadedFor === contract.id) return;
  loadedFor = contract.id;
  showError('');
  try {
    const d = await api('');
    settings = d.settings; orders = d.orders;
    $('o-setup').classList.toggle('hidden', d.paymentsReady);
    $('o-setup').textContent = 'Stripe isn’t connected yet, so parents will see "Online ordering is almost ready." Add STRIPE_SECRET_KEY in Netlify to turn on payments.';
    fillSettings();
    renderOrders();
    if (orders.some(o => o.status === 'pending')) sync(true);
  } catch (err) { showError(err.message); }
});

function fillSettings() {
  $('o-enabled').checked = !!settings.enabled;
  $('o-slug').value = settings.slug || slugify(contract.school);
  $('o-open').checked = settings.open !== false;
  $('o-message').value = settings.message || '';
  const hidden = new Set(settings.hidden || []);
  $('o-prices').innerHTML = BOOKS.map(b => `
    <div class="item-row" style="grid-template-columns:28px 1fr 100px" data-id="${b.id}">
      <input type="checkbox" class="o-offer" ${hidden.has(b.id) ? '' : 'checked'} aria-label="Offer ${escapeHtml(b.short)}" style="width:20px;height:20px;accent-color:var(--accent-gold)">
      <span style="font-size:.92rem;color:var(--text-primary)">${escapeHtml(b.short)} <span class="c-muted">(${escapeHtml(b.format)})</span></span>
      <input class="c-input o-price" type="number" min="0" step="0.01" value="${settings.prices?.[b.id] ?? b.price}" aria-label="Price for ${escapeHtml(b.short)}">
    </div>`).join('');
  syncEnabledUI();
  updateShare();
}

function syncEnabledUI() {
  const on = $('o-enabled').checked;
  $('o-settings').style.opacity = on ? 1 : .55;
  const pill = $('o-pill');
  const open = $('o-open').checked;
  if (!settings?.enabled) { pill.className = 'pill draft'; pill.textContent = 'Off'; }
  else if (!open || settings.open === false) { pill.className = 'pill sent'; pill.textContent = 'Closed'; }
  else { pill.className = 'pill signed'; pill.textContent = 'Taking orders'; }
}
$('o-enabled').addEventListener('change', syncEnabledUI);

function updateShare() {
  const live = settings?.enabled && settings.slug;
  $('o-share').classList.toggle('hidden', !live);
  if (live) {
    const link = `${location.origin}/order/${settings.slug}`;
    $('o-url').value = link; $('o-open-link').href = link;
  }
}

$('o-save').addEventListener('click', async () => {
  showError('');
  const prices = {}, hidden = [];
  document.querySelectorAll('#o-prices .item-row').forEach(row => {
    const id = row.dataset.id;
    prices[id] = row.querySelector('.o-price').value;
    if (!row.querySelector('.o-offer').checked) hidden.push(id);
  });
  if (hidden.length === BOOKS.length) return showError('Offer at least one book.');
  try {
    settings = await api('/settings', {
      method: 'PUT',
      body: { enabled: $('o-enabled').checked, slug: $('o-slug').value, open: $('o-open').checked, message: $('o-message').value, prices, hidden }
    });
    $('o-slug').value = settings.slug;
    syncEnabledUI(); updateShare(); renderOrders();
    toast('Order page saved');
  } catch (err) { showError(err.message); }
});

$('o-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('o-url').value); toast('Link copied'); }
  catch { $('o-url').select(); toast('Press Cmd+C to copy'); }
});

function renderOrders() {
  const paid = orders.filter(o => o.status === 'paid');
  const pending = orders.filter(o => o.status === 'pending').length;
  $('o-results').classList.toggle('hidden', !orders.length && !settings?.enabled);
  const books = {};
  paid.forEach(o => o.items.forEach(i => { books[i.id] = (books[i.id] || 0) + i.qty; }));
  const revenue = paid.reduce((s, o) => s + (o.amountPaid ?? orderTotal(o.items)), 0);
  const stat = (label, value) => `<div style="padding:.75rem 1rem;border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:.5rem">
      <div class="sig-label">${label}</div><div style="font-family:var(--font-title);font-weight:800;font-size:1.35rem;color:var(--text-primary)">${value}</div></div>`;
  $('o-stats').innerHTML = stat('PAID ORDERS', paid.length) + stat('BOOKS', Object.values(books).reduce((a, b) => a + b, 0)) + stat('COLLECTED', fmt(revenue));
  const perBook = BOOKS.filter(b => books[b.id]).map(b => `${books[b.id]} × ${escapeHtml(b.short)} (${escapeHtml(b.format)})`).join('<br>');
  $('o-table').innerHTML = `
    ${perBook ? `<caption style="text-align:left;padding:.25rem 0 .75rem;font-size:.92rem;color:var(--text-primary);caption-side:top"><strong>Books to bring:</strong><br>${perBook}</caption>` : ''}
    <thead><tr><th>Date</th><th>Parent</th><th>Child</th><th>Books</th><th class="num">Total</th></tr></thead>
    <tbody>${paid.map(o => `<tr>
      <td style="white-space:nowrap">${escapeHtml(fmtDateTime(o.paidAt || o.createdAt).replace(/, \d{4}/, ''))}</td>
      <td>${escapeHtml(o.parentName)}<br><span class="c-muted">${escapeHtml(o.email)}</span></td>
      <td>${escapeHtml(o.childName)}</td>
      <td>${o.items.map(i => `${i.qty} × ${escapeHtml(BOOKS.find(b => b.id === i.id)?.short || i.title)}`).join('<br>')}</td>
      <td class="num">${fmt(o.amountPaid ?? orderTotal(o.items))}</td></tr>`).join('') || '<tr><td colspan="5" class="c-muted">No paid orders yet.</td></tr>'}</tbody>
    ${pending ? `<tfoot><tr><td colspan="5" class="c-muted" style="font-size:.85rem;font-weight:400">${pending} checkout${pending === 1 ? '' : 's'} started but not paid yet (not counted).</td></tr></tfoot>` : ''}`;
}

async function sync(quiet) {
  try {
    const d = await api('/sync', { method: 'POST' });
    orders = d.orders; renderOrders();
    if (!quiet) toast(d.updated ? `${d.updated} order${d.updated === 1 ? '' : 's'} updated` : 'Up to date');
  } catch (err) { if (!quiet) showError(err.message); }
}
$('o-sync').addEventListener('click', () => sync(false));

$('o-csv').addEventListener('click', async () => {
  try {
    const r = await api('/csv', { raw: true });
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Book_Orders.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (err) { showError(err.message); }
});

$('o-print').addEventListener('click', () => {
  const paid = orders.filter(o => o.status === 'paid').slice().sort((a, b) => a.childName.localeCompare(b.childName));
  const rows = paid.map(o => `<tr><td style="width:22px">&#9744;</td><td><strong>${escapeHtml(o.childName)}</strong><br><small>${escapeHtml(o.parentName)}</small></td><td>${o.items.map(i => `${i.qty} × ${escapeHtml(BOOKS.find(b => b.id === i.id)?.short || i.title)}`).join('<br>')}</td></tr>`).join('');
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Signing list - ${escapeHtml(contract.school)}</title>
    <style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:32px;color:#0f172a}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 16px;color:#64748b}
    table{width:100%;border-collapse:collapse;font-size:13px}td{border-bottom:1px solid #e2e8f0;padding:8px 6px;vertical-align:top}small{color:#64748b}</style></head>
    <body><h1>Signing list: ${escapeHtml(contract.school)}</h1><p>${escapeHtml(contract.visitDate || '')} · ${paid.length} orders</p>
    <table>${rows || '<tr><td>No paid orders yet.</td></tr>'}</table><script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
});
