// Shared by the browser pages (admin + signing page) and the Netlify Function (PDF).
// Keep this file free of browser-only or Node-only APIs.

// ---------- Inline formatting ----------
// Supports **bold** and [link text](https://url) inside a line.
export function parseInline(text) {
  const out = [];
  const src = String(text ?? '');
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[1] !== undefined) {
      // allow links inside bold
      for (const seg of parseInline(m[1])) out.push({ ...seg, bold: true });
    } else {
      out.push({ text: m[2], href: m[3] });
    }
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out.filter(s => s.text.length);
}

export function lines(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*[-•*]\s+/, '').trim())
    .filter(Boolean);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function inlineToHtml(text) {
  return parseInline(text).map(seg => {
    let h = escapeHtml(seg.text);
    if (seg.href) h = `<a href="${escapeHtml(seg.href)}" target="_blank" rel="noopener">${h}</a>`;
    if (seg.bold) h = `<strong>${h}</strong>`;
    return h;
  }).join('');
}

// ---------- Money / totals (fee is plain text on the contract; nothing is charged) ----------
export function money(n) {
  const v = Number(n);
  if (!isFinite(v)) return '';
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function invoiceTotal(items) {
  return (items || []).reduce((sum, it) => {
    const q = Number(it.qty ?? 1), u = Number(it.unit ?? 0);
    return sum + (isFinite(q) && isFinite(u) ? q * u : 0);
  }, 0);
}

// ---------- Dates ----------
export function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  });
}
export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: '2-digit' });
}

// ---------- Contract text ----------
export function contractTitle(c) {
  return c.visitType === 'virtual' ? '(VIRTUAL) AUTHOR VISIT CONTRACT' : 'AUTHOR VISIT CONTRACT';
}

export function introLine(c) {
  const when = [c.visitDate, c.visitTime ? `(${c.visitTime})` : ''].filter(Boolean).join(' ');
  return `This contract outlines the mutual responsibilities for an Author Visit by Matthew Landis to **${c.school || '[School]'}**, on **${when || '[Date]'}**`;
}

// The terms the school agrees to. Hashed at signing so the PDF can show a fingerprint.
// Lines of a section with {grades}/{half_fee} filled in (placeholders stay live until signing).
export function sectionLines(c, field) {
  return lines(fillPlaceholders(c[field], c));
}
export function filledItems(c) {
  return (c.invoiceItems || []).map(it => ({ ...it, description: fillPlaceholders(it.description, c) }));
}

// The terms the school agrees to. Hashed at signing so the PDF can show a fingerprint.
export function termsSnapshot(c) {
  const f = k => sectionLines(c, k);
  return JSON.stringify({
    title: contractTitle(c), intro: introLine(c),
    school: c.school, schoolAddress: c.schoolAddress, contactName: c.contactName,
    authorBefore: f('authorBefore'), authorDay: f('authorDay'),
    schoolBefore: f('schoolBefore'), schoolDay: f('schoolDay'),
    contingencyIntro: fillPlaceholders(c.contingencyIntro, c), contingency: f('contingency'),
    additional: f('additional'),
    invoice: { number: c.invoiceNumber, items: filledItems(c), notes: f('invoiceNotes'), due: c.invoiceDue, total: invoiceTotal(c.invoiceItems) }
  });
}

// ---------- Templates (from Matt's Gayman ES + Maple Ave contracts) ----------
const PROMO = 'https://youtu.be/PX1aB1RFTwY';
const FLYER = 'https://drive.google.com/file/d/1rlnyp8UA-MLRIsWj3B9J-Jn5vrUuLLfI/view?usp=sharing';
const CONTINGENCY_INTRO = 'Matt has NEVER canceled a visit on his end, but mishaps do occur (weather, personal or family illness, sudden tornado), so:';
const CONTINGENCY = [
  '**If the visit does not occur because Matt has to cancel for a reason listed above**, the school will not be charged. Matt will arrange with the school another date within (1) year, though ASAP is preferred on both ends.',
  '**If the visit is cancelled by the school for any reason other than weather**, the school will pay 1/2 of his fee ({half_fee}).'
].join('\n');

export const TEMPLATES = {
  'in-person': {
    label: 'In-person visit (assembly + scavenger hunt)',
    visitType: 'in-person',
    authorBefore: [
      `Email the school a link to a brief promotional video of the upcoming visit ([sample](${PROMO})).`,
      `Email the school flyers of the upcoming visit and book order forms ([sample](${FLYER})).`
    ].join('\n'),
    authorDay: [
      'Run **(1) 45-50 min** highly engaging, informative, probably hilarious, and definitely entertaining large-group presentation created for target grade level **({grades})**. He will talk about his writing journey, how he makes history come alive in his classroom and writing, the nature of failure, and the themes of his past, present, and new books.',
      'Run **(1) 45-50 min** large-group scavenger hunt (materials provided) with applicable grades, TBD by the school rep.',
      'Sign books ordered by students.',
      'High-five, dab, and fist bump no less than 500 kids.'
    ].join('\n'),
    schoolBefore: [
      `Show students the brief promotional video of the upcoming visit in some form, such as in class, emailing the link home, during an assembly, etc ([sample](${PROMO})).`,
      `Share the visit flyers/order forms in a manner they see fit, such as emailing home, printing, posting in library or school, etc ([sample](${FLYER})).`,
      'Provide Matt with a detailed itinerary of the visit, preferably (1) week ahead of the visit.'
    ].join('\n'),
    schoolDay: [
      'Provide a projector and large screen for a visual presentation.',
      'Provide a microphone and sound for the presentation appropriate to space size.',
      'Provide adequate teacher presence during presentation to monitor student behavior.',
      'Pay Matt’s visit fee (upon day’s completion).'
    ].join('\n'),
    contingencyIntro: CONTINGENCY_INTRO,
    contingency: CONTINGENCY,
    invoiceItems: [{ description: '½ Day Visit with grades {grades}, assembly/hunt', qty: 1, unit: 900 }],
    invoiceDue: 'Upon day of visit'
  },
  'virtual': {
    label: 'Virtual visit / book club',
    visitType: 'virtual',
    authorBefore: 'Confirm tech set up with school and run a check for virtual platform.',
    authorDay: [
      'Run **(1) 1-hour** highly engaging, informative, probably hilarious, and definitely entertaining virtual presentation created for target grade level **({grades})**. He will talk about his writing journey, how he makes history come alive in his classroom and writing, the nature of failure, and the themes of his past, present, and new books. Plenty of Q&A too!',
      'Target any book club-related issues as per request by teacher!'
    ].join('\n'),
    schoolBefore: [
      'Work out with Matt the tech platform.',
      'Communicate preferred outline of the session.'
    ].join('\n'),
    schoolDay: [
      'Be on the call 10 min ahead of time to do a last-minute check (screen share, etc).',
      'Help Matt run Q&A/comment section during call for better engagement!'
    ].join('\n'),
    contingencyIntro: CONTINGENCY_INTRO,
    contingency: CONTINGENCY,
    invoiceItems: [{ description: '1 hour virtual visit', qty: 1, unit: 300 }],
    invoiceDue: 'Upon day of visit'
  }
};

// Fill {grades} / {half_fee} placeholders.
export function fillPlaceholders(text, c) {
  const half = invoiceTotal(c.invoiceItems) / 2;
  return String(text ?? '')
    .replaceAll('{grades}', c.grades || 'TBD')
    .replaceAll('{half_fee}', half ? money(half).replace(/\.00$/, '') : '$___');
}

export const SECTION_FIELDS = ['authorBefore', 'authorDay', 'schoolBefore', 'schoolDay', 'contingencyIntro', 'contingency', 'additional', 'invoiceNotes', 'invoiceDue'];

export const STATUS_LABEL = { draft: 'Draft', sent: 'Sent', viewed: 'Viewed', signed: 'Signed' };
