import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseInline, sectionLines, contractTitle, introLine, fillPlaceholders,
  filledItems, invoiceTotal, money, fmtDateTime, fmtDate
} from '../../js/contracts-shared.js';

const RED = rgb(0.863, 0.149, 0.149);       // #dc2626 (site accent)
const INK = rgb(0.059, 0.09, 0.165);        // #0f172a
const BODY = rgb(0.2, 0.255, 0.333);        // #334155
const MUTED = rgb(0.392, 0.455, 0.545);     // #64748b
const RULE = rgb(0.886, 0.91, 0.941);       // #e2e8f0
const SOFT = rgb(0.973, 0.98, 0.988);       // #f8fafc

const PAGE_W = 612, PAGE_H = 792, M = 54, CONTENT_W = PAGE_W - M * 2;

async function loadAsset(name) {
  // Works on Netlify (included_files) and locally.
  const candidates = [
    path.join(process.cwd(), 'netlify/contracts-lib/assets', name),
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', name),
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../contracts-lib/assets', name)
  ];
  for (const p of candidates) {
    try { return await readFile(p); } catch { /* try next */ }
  }
  return null;
}

export async function buildContractPdf(c, settings = {}) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${c.school || 'School'} - Author Visit Contract`);
  doc.setAuthor(settings.authorName || 'Matthew Landis');
  doc.setCreator('matthewlandis contract system');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

  const bannerBytes = await loadAsset('banner.jpg');
  const coversBytes = await loadAsset('covers.jpg');
  const banner = bannerBytes ? await doc.embedJpg(bannerBytes) : null;
  const covers = coversBytes ? await doc.embedJpg(coversBytes) : null;

  // Helvetica only knows WinAnsi characters; swap anything else for a safe stand-in.
  const safeCache = new Map();
  const safe = (str) => [...String(str ?? '')].map(ch => {
    if (safeCache.has(ch)) return safeCache.get(ch);
    let out = ch;
    try { font.encodeText(ch); } catch {
      out = ({ '→': '->', '✓': 'v', '•': '-', '‑': '-', ' ': ' ' })[ch] ?? '';
    }
    safeCache.set(ch, out);
    return out;
  }).join('');

  let page, y;
  const pages = [];
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - M;
  };
  const ensure = (h) => { if (y - h < M + 30) { newPage(); } };

  const fontFor = (seg, base) => {
    const b = seg.bold || base.bold, i = base.italic;
    return b && i ? boldItalic : b ? bold : i ? italic : font;
  };

  const addLink = (x, yy, w, h, url) => {
    const annot = doc.context.obj({
      Type: 'Annot', Subtype: 'Link', Rect: [x, yy - 2, x + w, yy + h], Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) }
    });
    const ref = doc.context.register(annot);
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (annots) annots.push(ref); else page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));
  };

  // Rich paragraph with word wrapping. Returns height used.
  function para(text, { x = M, width = CONTENT_W, size = 10.5, lead = 1.45, color = BODY, italic: it = false, bold: bd = false, bullet = false, after = 6 } = {}) {
    const segs = parseInline(text);
    const words = [];
    for (const seg of segs) {
      const parts = safe(seg.text).split(/(\s+)/);
      for (const p of parts) if (p.length) words.push({ ...seg, text: p });
    }
    const indent = bullet ? 14 : 0;
    const maxW = width - indent;
    const lh = size * lead;
    let linesOut = [[]], lineW = 0;
    for (const w of words) {
      const f = fontFor(w, { bold: bd, italic: it });
      const ww = f.widthOfTextAtSize(w.text, size);
      const isSpace = /^\s+$/.test(w.text);
      if (!isSpace && lineW + ww > maxW && linesOut[linesOut.length - 1].length) {
        linesOut.push([]); lineW = 0;
      }
      if (isSpace && lineW === 0) continue;
      linesOut[linesOut.length - 1].push({ ...w, f, ww }); lineW += ww;
    }
    linesOut.forEach((ln, idx) => {
      ensure(lh);
      if (bullet && idx === 0) {
        page.drawCircle({ x: x + 4, y: y - size * 0.68, size: 1.9, color: RED });
      }
      let cx = x + indent;
      for (const w of ln) {
        page.drawText(w.text, { x: cx, y: y - size, size, font: w.f, color: w.href ? RED : color });
        if (w.href && !/^\s+$/.test(w.text)) {
          page.drawLine({ start: { x: cx, y: y - size - 1.5 }, end: { x: cx + w.ww, y: y - size - 1.5 }, thickness: 0.5, color: RED });
          addLink(cx, y - size, w.ww, size, w.href);
        }
        cx += w.ww;
      }
      y -= lh;
    });
    y -= after;
  }

  function heading(text, { size = 13, color = INK, before = 10, after = 6 } = {}) {
    ensure(size + before + 30);
    y -= before;
    page.drawText(safe(text), { x: M, y: y - size, size, font: bold, color });
    y -= size + 4;
    page.drawRectangle({ x: M, y: y - 1, width: 32, height: 2.2, color: RED });
    y -= after + 4;
  }

  function sub(text) {
    ensure(40);
    y -= 2;
    page.drawText(safe(text), { x: M, y: y - 10.5, size: 10.5, font: bold, color: INK });
    y -= 17;
  }

  function rule(gap = 10) {
    ensure(gap * 2);
    y -= gap;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.75, color: RULE });
    y -= gap;
  }

  const bullets = (field) => sectionLines(c, field).forEach(l => para(l, { bullet: true, after: 3 }));

  // ---------------- Page 1: contract ----------------
  newPage();
  if (banner) {
    const bh = CONTENT_W / (banner.width / banner.height);
    page.drawImage(banner, { x: M, y: y - bh, width: CONTENT_W, height: bh });
    y -= bh + 18;
  }
  page.drawText(safe(contractTitle(c)), { x: M, y: y - 20, size: 20, font: bold, color: INK });
  y -= 26;
  page.drawText('Matthew Landis  |  Author Visits & Writing Workshops', { x: M, y: y - 9, size: 9, font, color: MUTED });
  y -= 22;
  para(introLine(c), { italic: true, size: 11, color: INK, after: 4 });

  rule(8);
  heading("Author's Responsibility", { before: 0 });
  sub('Before the visit, Matt will:');
  bullets('authorBefore');
  sub('The day of the visit, Matt will:');
  bullets('authorDay');

  rule(8);
  heading("School's Responsibility", { before: 0 });
  sub('Before the visit, the school will:');
  bullets('schoolBefore');
  sub('The day of the visit, the school will:');
  bullets('schoolDay');

  const extra = sectionLines(c, 'additional');
  if (extra.length) {
    rule(8);
    heading('Additional Details', { before: 0 });
    extra.forEach(l => para(l, { bullet: true, after: 3 }));
  }

  rule(8);
  heading('Contingency', { before: 0 });
  if (c.contingencyIntro) para(fillPlaceholders(c.contingencyIntro, c), { after: 4 });
  bullets('contingency');

  // ---- Signatures ----
  ensure(150);
  rule(10);
  heading('Signatures', { before: 0 });
  const colW = (CONTENT_W - 24) / 2;
  const sigTop = y;
  const sigBlock = (x, label, name, detailLines, signed) => {
    let yy = sigTop;
    page.drawText(safe(label), { x, y: yy - 8, size: 8, font: bold, color: MUTED });
    yy -= 22;
    if (signed) {
      page.drawText(safe(name), { x, y: yy - 16, size: 16, font: boldItalic, color: INK });
    }
    yy -= 22;
    page.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 0.75, color: INK });
    yy -= 12;
    for (const d of detailLines) {
      page.drawText(safe(d), { x, y: yy - 8, size: 8.5, font, color: BODY });
      yy -= 12;
    }
    return yy;
  };
  const a = c.authorSignature;
  const s = c.signature;
  const y1 = sigBlock(M, 'AUTHOR', a?.name || settings.authorName || 'Matthew Landis',
    a ? [`${a.name}, Author`, `Signed electronically ${fmtDateTime(a.signedAt)}`] : ['Matthew Landis, Author', 'Date: ____________'], !!a);
  const y2 = sigBlock(M + colW + 24, 'SCHOOL REPRESENTATIVE', s?.name || '',
    s ? [`${s.name}${s.title ? ', ' + s.title : ''}`, `${c.school || ''}`, `Signed electronically ${fmtDateTime(s.signedAt)}`]
      : [`Name / Title: ${c.contactName || ''}`, 'Date: ____________'], !!s);
  y = Math.min(y1, y2) - 6;

  if (s) {
    ensure(50);
    page.drawRectangle({ x: M, y: y - 40, width: CONTENT_W, height: 40, color: SOFT, borderColor: RULE, borderWidth: 0.75 });
    const rec = [
      `Electronic signature record: ${s.name} agreed to these terms by checking "I agree" and typing their name on ${fmtDateTime(s.signedAt)}.`,
      `IP ${s.ip || 'n/a'}  |  Contract ID ${c.id}  |  Terms fingerprint ${String(s.fingerprint || '').slice(0, 16)}`
    ];
    page.drawText(safe(rec[0]), { x: M + 8, y: y - 15, size: 7.5, font, color: MUTED, maxWidth: CONTENT_W - 16 });
    page.drawText(safe(rec[1]), { x: M + 8, y: y - 28, size: 7.5, font, color: MUTED });
    y -= 50;
  }

  // ---------------- Invoice page ----------------
  newPage();
  page.drawText('Invoice', { x: M, y: y - 22, size: 22, font: bold, color: INK });
  page.drawRectangle({ x: M, y: y - 30, width: 32, height: 2.2, color: RED });
  y -= 48;

  const from = [settings.authorName || 'Matthew Landis', ...String(settings.address || '').split(/\r?\n/), settings.phone, settings.email].filter(Boolean);
  const billTo = [c.contactName, c.school, ...String(c.schoolAddress || '').split(/\r?\n/)].filter(Boolean);
  const meta = [
    ['Invoice #', c.invoiceNumber || ''],
    ['Submitted', fmtDate(c.sentAt || c.createdAt)],
    ['Project', 'Author Visit'],
    ['Due', c.invoiceDue || 'Upon day of visit'],
    ['Payable to', settings.authorName || 'Matthew Landis']
  ];
  const colX = [M, M + 190, M + 360];
  const top = y;
  const block = (x, title, rows) => {
    let yy = top;
    page.drawText(safe(title), { x, y: yy - 8, size: 8, font: bold, color: MUTED });
    yy -= 20;
    for (const r of rows) { page.drawText(safe(r), { x, y: yy - 10, size: 10, font, color: INK }); yy -= 14; }
    return yy;
  };
  const b1 = block(colX[0], 'FROM', from);
  const b2 = block(colX[1], 'BILL TO', billTo);
  let yy = top;
  page.drawText('DETAILS', { x: colX[2], y: yy - 8, size: 8, font: bold, color: MUTED });
  yy -= 20;
  for (const [k, v] of meta) {
    page.drawText(safe(k), { x: colX[2], y: yy - 10, size: 9, font, color: MUTED });
    page.drawText(safe(v), { x: colX[2] + 62, y: yy - 10, size: 10, font: bold, color: INK });
    yy -= 14;
  }
  y = Math.min(b1, b2, yy) - 18;

  // table
  const cols = [{ t: 'Description', x: M, w: 300 }, { t: 'Qty', x: M + 310, w: 40, r: true }, { t: 'Unit price', x: M + 355, w: 70, r: true }, { t: 'Total', x: M + 430, w: CONTENT_W - 430, r: true }];
  page.drawRectangle({ x: M, y: y - 22, width: CONTENT_W, height: 22, color: INK });
  for (const col of cols) {
    const w = bold.widthOfTextAtSize(col.t, 9);
    page.drawText(col.t, { x: col.r ? col.x + col.w - w - 6 : col.x + 8, y: y - 15, size: 9, font: bold, color: rgb(1, 1, 1) });
  }
  y -= 22;
  for (const it of filledItems(c)) {
    const q = Number(it.qty ?? 1), u = Number(it.unit ?? 0);
    const cells = [safe(it.description), String(q), money(u), money(q * u)];
    // wrap description
    const words = cells[0].split(' ');
    const descLines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(t, 10) > cols[0].w - 12 && cur) { descLines.push(cur); cur = w; } else cur = t;
    }
    if (cur) descLines.push(cur);
    const rowH = Math.max(1, descLines.length) * 13 + 12;
    ensure(rowH);
    descLines.forEach((l, i) => page.drawText(l, { x: M + 8, y: y - 16 - i * 13, size: 10, font, color: INK }));
    cells.slice(1).forEach((txt, i) => {
      const col = cols[i + 1]; const w = font.widthOfTextAtSize(txt, 10);
      page.drawText(txt, { x: col.x + col.w - w - 6, y: y - 16, size: 10, font, color: INK });
    });
    y -= rowH;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: RULE });
  }
  y -= 8;
  const totalTxt = money(invoiceTotal(c.invoiceItems));
  const tw = bold.widthOfTextAtSize(totalTxt, 14);
  page.drawText('Total', { x: M + 355, y: y - 14, size: 11, font: bold, color: MUTED });
  page.drawText(totalTxt, { x: PAGE_W - M - tw - 6, y: y - 14, size: 14, font: bold, color: RED });
  y -= 34;

  const notes = sectionLines(c, 'invoiceNotes');
  const visitNote = [c.visitDate, c.visitTime].filter(Boolean).join(', ');
  if (visitNote || notes.length) {
    sub('Notes');
    if (visitNote) para(visitNote, { bullet: true, after: 3 });
    notes.forEach(l => para(l, { bullet: true, after: 3 }));
  }

  if (covers) {
    const cw = CONTENT_W, ch = cw / (covers.width / covers.height);
    if (y - ch > M + 20) {
      page.drawImage(covers, { x: M, y: M + 24, width: cw, height: ch });
    }
  }

  // footers
  pages.forEach((p, i) => {
    const t = safe(`${c.school || ''} - Author Visit Contract  |  Page ${i + 1} of ${pages.length}`);
    p.drawText(t, { x: M, y: 28, size: 7.5, font, color: MUTED });
    const st = s ? 'SIGNED' : 'AWAITING SIGNATURE';
    const w = bold.widthOfTextAtSize(st, 7.5);
    p.drawText(st, { x: PAGE_W - M - w, y: 28, size: 7.5, font: bold, color: s ? rgb(0.086, 0.502, 0.239) : RED });
  });

  return await doc.save();
}
