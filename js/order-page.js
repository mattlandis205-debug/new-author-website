import { CAMP_Q, CAMP_YES, CAMP_NO, POD_Q, POD_YES, POD_NO, MAX_QTY, orderTotal } from './orders-shared.js';
import { escapeHtml, money } from './contracts-shared.js';

const $ = id => document.getElementById(id);
const slug = location.pathname.split('/').filter(Boolean).pop();
const params = new URLSearchParams(location.search);
const api = `/api/orders/page/${encodeURIComponent(slug)}`;
const DRAFT_KEY = `ml-order-${slug}`;
let books = [];
const qty = {};

$('camp-q').textContent = CAMP_Q; $('camp-yes').textContent = CAMP_YES; $('camp-no').textContent = CAMP_NO;
$('pod-q').textContent = POD_Q; $('pod-yes').textContent = POD_YES; $('pod-no').textContent = POD_NO;

const fmt = n => money(n).replace(/\.00$/, '');

function renderBooks() {
  $('books').innerHTML = books.map(b => `
    <div class="book ${qty[b.id] ? 'has-qty' : ''}" data-id="${b.id}">
      <img src="${encodeURI(b.cover)}" alt="Cover of ${escapeHtml(b.title)}" loading="lazy">
      <div>
        <h3>${escapeHtml(b.title)}</h3>
        <div class="meta">${escapeHtml(b.format)} · ${escapeHtml(b.grades)}</div>
        ${(b.awards || []).length ? `<div class="awards">${b.awards.map(a => `<span class="award">${escapeHtml(a)}</span>`).join('')}</div>` : ''}
        <p class="blurb">${escapeHtml(b.blurb)}</p>
        <div class="row">
          <span class="price">${fmt(b.price)}</span>
          <span class="stepper">
            <button type="button" data-d="-1" aria-label="One fewer ${escapeHtml(b.short)}">&minus;</button>
            <output aria-live="polite">${qty[b.id] || 0}</output>
            <button type="button" data-d="1" aria-label="One more ${escapeHtml(b.short)}">+</button>
          </span>
        </div>
      </div>
    </div>`).join('');
  updateTotal();
}

function items() {
  return books.filter(b => qty[b.id] > 0).map(b => ({ ...b, qty: qty[b.id] }));
}

function updateTotal() {
  const its = items();
  const n = its.reduce((s, i) => s + i.qty, 0);
  $('total').textContent = fmt(orderTotal(its));
  $('count').textContent = n ? `${n} signed book${n === 1 ? '' : 's'}` : 'No books yet';
  $('pay').disabled = !n;
}

$('books').addEventListener('click', e => {
  const btn = e.target.closest('button[data-d]'); if (!btn) return;
  const card = btn.closest('.book'); const id = card.dataset.id;
  qty[id] = Math.max(0, Math.min(MAX_QTY, (qty[id] || 0) + Number(btn.dataset.d)));
  card.querySelector('output').textContent = qty[id];
  card.classList.toggle('has-qty', qty[id] > 0);
  updateTotal(); saveDraft();
});

function saveDraft() {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ qty, parentName: $('parentName').value, email: $('email').value, childName: $('childName').value }));
  } catch { /* storage unavailable */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (!d) return;
    Object.assign(qty, d.qty || {});
    $('parentName').value = d.parentName || ''; $('email').value = d.email || ''; $('childName').value = d.childName || '';
  } catch { /* ignore */ }
}
['parentName', 'email', 'childName'].forEach(id => $(id).addEventListener('input', saveDraft));

function fail(msg) {
  $('error').textContent = msg; $('error').classList.remove('hidden');
  $('error').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('pay').addEventListener('click', async () => {
  $('error').classList.add('hidden');
  const parentName = $('parentName').value.trim(), email = $('email').value.trim(), childName = $('childName').value.trim();
  if (parentName.length < 2) { $('parentName').focus(); return fail('Please enter your full name.'); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('email').focus(); return fail('Please enter a valid email address.'); }
  if (!childName) { $('childName').focus(); return fail("Please enter your child's first name."); }
  const btn = $('pay'); btn.disabled = true; btn.textContent = 'One sec…';
  try {
    const r = await fetch(`${api}/checkout`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parentName, email, childName, qty,
        camp: document.querySelector('input[name=camp]:checked')?.value,
        podcast: document.querySelector('input[name=podcast]:checked')?.value
      })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.url) throw new Error(data.error || 'Something went wrong. Please try again.');
    location.href = data.url;
  } catch (e) {
    fail(e.message); btn.disabled = false; btn.textContent = 'Checkout';
  }
});

async function showThanks(sessionId) {
  try {
    const r = await fetch(`${api}/confirm?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw new Error();
    $('loading').classList.add('hidden');
    $('thanks').classList.remove('hidden');
    if (d.status === 'paid') {
      $('thanks-text').innerHTML = `Matt will sign these for <strong>${escapeHtml(d.childName)}</strong> and bring them to school on visit day:`;
      $('thanks-items').innerHTML = d.items.map(i => `<li>${i.qty} × ${escapeHtml(i.title)} (${escapeHtml(i.format)})</li>`).join('');
      $('thanks-email').textContent = `A receipt for ${fmt(d.total)} is on its way to ${d.email}.`;
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    } else {
      $('thanks').querySelector('h2').textContent = 'Almost there…';
      $('thanks-text').textContent = "We haven't received the payment confirmation yet. If you completed checkout, you'll get a receipt by email shortly.";
    }
    $('again').href = location.pathname;
  } catch {
    $('loading').classList.add('hidden');
    $('notfound').classList.remove('hidden');
  }
}

async function load() {
  if (params.get('paid')) return showThanks(params.get('paid'));
  try {
    const r = await fetch(api, { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const d = await r.json();
    books = d.books;
    document.title = `Signed Books for ${d.school} | Matthew Landis`;
    $('school').textContent = d.school;
    $('intro').textContent = `Want a signed book from Matt's ${d.visitDate ? 'visit on ' + d.visitDate : 'visit'}? Pick your books below. Matt signs every copy and brings them to school on visit day.`;
    if (d.message) { $('message').textContent = d.message; $('message').classList.remove('hidden'); }
    $('loading').classList.add('hidden');
    $('page').classList.remove('hidden');
    if (!d.open) { $('closed').classList.remove('hidden'); return; }
    if (!d.paymentsReady) { $('closed').classList.remove('hidden'); $('closed').textContent = 'Online ordering is almost ready. Check back soon!'; return; }
    if (params.has('canceled')) $('canceled').classList.remove('hidden');
    loadDraft();
    renderBooks();
    $('form').classList.remove('hidden');
    $('paybar').classList.remove('hidden');
  } catch {
    $('loading').classList.add('hidden');
    $('notfound').classList.remove('hidden');
  }
}
load();
