import {
  inlineToHtml, sectionLines, contractTitle, introLine, fillPlaceholders, filledItems,
  invoiceTotal, money, fmtDateTime, escapeHtml, termsSnapshot
} from './contracts-shared.js';

const $ = id => document.getElementById(id);
const id = location.pathname.split('/').filter(Boolean).pop();
const preview = new URLSearchParams(location.search).has('preview');
const api = `/api/contracts/public/${encodeURIComponent(id)}`;
let contract = null;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fillList(elId, c, field) {
  const items = sectionLines(c, field);
  $(elId).innerHTML = items.map(l => `<li>${inlineToHtml(l)}</li>`).join('');
  return items.length;
}

function render(c) {
  contract = c;
  document.title = `${c.school || 'School'} – Author Visit Contract | Matthew Landis`;
  $('title').textContent = contractTitle(c);
  $('intro').innerHTML = inlineToHtml(introLine(c));
  ['authorBefore', 'authorDay', 'schoolBefore', 'schoolDay', 'contingency'].forEach(f => fillList(f, c, f));
  $('additional-wrap').classList.toggle('hidden', !fillList('additional', c, 'additional'));
  $('contingencyIntro').innerHTML = inlineToHtml(fillPlaceholders(c.contingencyIntro, c));

  $('fee-rows').innerHTML = filledItems(c).map(it => `<tr>
      <td>${escapeHtml(it.description)}</td><td class="num">${escapeHtml(it.qty)}</td>
      <td class="num">${money(it.unit)}</td><td class="num">${money(it.qty * it.unit)}</td></tr>`).join('');
  $('fee-total').textContent = money(invoiceTotal(c.invoiceItems));
  $('fee-due').textContent = `Due: ${c.invoiceDue || 'Upon day of visit'}. No payment is collected through this page.`;

  const a = c.authorSignature;
  $('author-sig').textContent = a ? a.name : '';
  $('author-meta').textContent = a ? `Matthew Landis, Author · signed ${fmtDateTime(a.signedAt)}` : 'Matthew Landis, Author';
  $('agree-school').textContent = c.school || 'my school';

  const s = c.signature;
  const pdfHref = `${api}/pdf${preview ? '?preview=1' : ''}`;
  $('pdf-link').href = pdfHref;
  $('pdf-link-unsigned').href = pdfHref;
  if (s) {
    $('school-sig').textContent = s.name;
    $('school-meta').textContent = `${s.name}${s.title ? ', ' + s.title : ''} · signed ${fmtDateTime(s.signedAt)}`;
    $('sign-form').classList.add('hidden');
    $('after').classList.remove('hidden');
    $('signed-banner').classList.remove('hidden');
    $('signed-banner').innerHTML = `<strong>Signed</strong> by ${escapeHtml(s.name)} on ${escapeHtml(fmtDateTime(s.signedAt))}. <a href="${pdfHref}">Download the signed PDF</a>`;
  } else {
    $('school-sig').textContent = '';
    $('school-meta').textContent = c.contactName ? `Awaiting signature · ${c.contactName}` : 'Awaiting signature';
    if (!$('sig-name').value && c.contactName) $('sig-name').value = c.contactName;
    if (preview) {
      $('sign-form').classList.add('hidden');
      $('signed-banner').classList.remove('hidden');
      $('signed-banner').innerHTML = `<strong>Preview.</strong> This is exactly what ${escapeHtml(c.school || 'the school')} will see. The sign box is hidden in preview. <a href="${pdfHref}">Download PDF</a>`;
    }
  }
  $('loading').classList.add('hidden');
  $('doc').classList.remove('hidden');
}

async function load() {
  try {
    const r = await fetch(api + (preview ? '?preview=1' : ''), { cache: 'no-store' });
    if (!r.ok) throw new Error('nf');
    const { contract: c } = await r.json();
    render(c);
  } catch {
    $('loading').classList.add('hidden');
    $('notfound').classList.remove('hidden');
  }
}

$('sign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = $('sign-error');
  errBox.classList.add('hidden');
  const name = $('sig-name').value.trim();
  const title = $('sig-title').value.trim();
  const agree = $('sig-agree').checked;
  const fail = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
  if (name.length < 2) return fail('Please type your full name.');
  if (!agree) return fail('Please check the box to agree to the terms.');
  const btn = $('sign-btn');
  btn.disabled = true; btn.textContent = 'Signing…';
  try {
    const fingerprint = await sha256Hex(termsSnapshot(contract));
    const r = await fetch(`${api}/sign`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, title, agree: true, fingerprint })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    render(data.contract);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    fail(err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Sign contract';
  }
});

load();
