// School contract API — one Netlify Function, data in Netlify Blobs.
//
// Admin routes (need header  Authorization: Bearer <CONTRACTS_ADMIN_PASSWORD>):
//   GET    /api/contracts                 list
//   POST   /api/contracts                 create
//   GET    /api/contracts/:id             read
//   PUT    /api/contracts/:id             update (not allowed once signed)
//   DELETE /api/contracts/:id             delete
//   POST   /api/contracts/:id/send        mark as sent (Matt's e-signature is applied)
//   POST   /api/contracts/:id/duplicate   copy (e.g. to change a signed contract)
//   GET    /api/contracts/settings        Matt's invoice info
//   PUT    /api/contracts/settings
// Read-only status feed:
//   GET    /api/contracts/status?key=<CONTRACTS_STATUS_KEY>
// Public routes (the long random id is the key to the contract):
//   GET    /api/contracts/public/:id          view (marks "viewed" unless ?preview=1)
//   POST   /api/contracts/public/:id/sign     sign  {name, title, agree:true}
//   GET    /api/contracts/public/:id/pdf      PDF download (?inline=1 to open in browser)

import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildContractPdf } from '../contracts-lib/pdf.mjs';
import { termsSnapshot, invoiceTotal } from '../../js/contracts-shared.js';

const store = () => getStore({ name: 'school-contracts', consistency: 'strong' });
const KEY = id => `contract/${id}`;
const SETTINGS_KEY = 'settings';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const err = (message, status = 400) => json({ error: message }, status);

const sha = s => createHash('sha256').update(String(s)).digest();
function isAdmin(req) {
  const pw = process.env.CONTRACTS_ADMIN_PASSWORD;
  if (!pw) return null; // not configured
  const h = req.headers.get('authorization') || '';
  const given = h.startsWith('Bearer ') ? h.slice(7) : '';
  return timingSafeEqual(sha(given), sha(pw));
}

const newId = () => randomBytes(16).toString('base64url'); // 128-bit, unguessable

const EDITABLE = [
  'school', 'schoolAddress', 'contactName', 'contactEmail', 'visitType', 'visitDate', 'visitTime', 'grades',
  'authorBefore', 'authorDay', 'schoolBefore', 'schoolDay', 'contingencyIntro', 'contingency', 'additional',
  'invoiceNumber', 'invoiceItems', 'invoiceNotes', 'invoiceDue', 'privateNotes'
];

function clean(input) {
  const out = {};
  for (const k of EDITABLE) {
    if (!(k in input)) continue;
    if (k === 'invoiceItems') {
      out[k] = (Array.isArray(input[k]) ? input[k] : []).slice(0, 20).map(it => ({
        description: String(it.description ?? '').slice(0, 300),
        qty: Number(it.qty) || 0,
        unit: Number(it.unit) || 0
      }));
    } else if (k === 'visitType') {
      out[k] = input[k] === 'virtual' ? 'virtual' : 'in-person';
    } else {
      out[k] = String(input[k] ?? '').slice(0, 8000);
    }
  }
  return out;
}

// What the school is allowed to see (no private notes).
function publicView(c) {
  const { privateNotes, ...rest } = c;
  return rest;
}

async function getSettings(s) {
  return (await s.get(SETTINGS_KEY, { type: 'json' })) || { authorName: 'Matthew Landis', address: '', phone: '', email: '' };
}

function clientIp(req, context) {
  return context?.ip || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '';
}

export default async (req, context) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/contracts\/?/, '').split('/').filter(Boolean);
  const method = req.method;
  const s = store();

  try {
    // ---------------- Read-only status feed (for checking from Claude) ----------------
    // GET /api/contracts/status?key=<CONTRACTS_STATUS_KEY>  -> school, status, dates only. No terms, fees or notes.
    if (parts[0] === 'status' && method === 'GET') {
      const want = process.env.CONTRACTS_STATUS_KEY;
      if (!want) return err('Status feed not set up. Add CONTRACTS_STATUS_KEY in Netlify environment variables.', 500);
      if (!timingSafeEqual(sha(url.searchParams.get('key') || ''), sha(want))) return err('Not found', 404);
      const { blobs } = await s.list({ prefix: 'contract/' });
      const all = (await Promise.all(blobs.map(b => s.get(b.key, { type: 'json' })))).filter(Boolean);
      all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return json({
        checkedAt: new Date().toISOString(),
        contracts: all.map(c => ({
          school: c.school || '', contact: c.contactName || '', visitDate: c.visitDate || '',
          status: c.status, sentAt: c.sentAt || null, viewedAt: c.viewedAt || null, signedAt: c.signedAt || null,
          signedBy: c.signature ? [c.signature.name, c.signature.title].filter(Boolean).join(', ') : null
        }))
      });
    }

    // ---------------- Public ----------------
    if (parts[0] === 'public') {
      const id = parts[1];
      if (!id || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) return err('Not found', 404);
      const c = await s.get(KEY(id), { type: 'json' });
      const action = parts[2];
      const isPreview = url.searchParams.has('preview');
      // Drafts are only visible as a preview (Matt checking his work) and can't be signed.
      if (!c || (c.status === 'draft' && !(isPreview && action !== 'sign'))) return err('This contract link is not active.', 404);

      if (!action && method === 'GET') {
        if (!isPreview && c.status === 'sent') {
          c.status = 'viewed';
          c.viewedAt = new Date().toISOString();
          await s.setJSON(KEY(id), c);
        }
        return json({ contract: publicView(c), settings: await getSettings(s) });
      }

      if (action === 'sign' && method === 'POST') {
        if (c.signature) return err('This contract has already been signed.', 409);
        const body = await req.json().catch(() => ({}));
        const name = String(body.name || '').trim();
        const title = String(body.title || '').trim();
        if (name.length < 2 || name.length > 120) return err('Please type your full name.');
        if (title.length > 120) return err('Title is too long.');
        if (body.agree !== true) return err('Please check the box to agree to the terms.');
        if (body.fingerprint && body.fingerprint !== createHash('sha256').update(termsSnapshot(c)).digest('hex')) {
          return err('This contract was just updated. Please reload the page and review it again before signing.', 409);
        }
        const now = new Date().toISOString();
        c.signature = {
          name, title, agreed: true, signedAt: now,
          ip: clientIp(req, context),
          userAgent: (req.headers.get('user-agent') || '').slice(0, 300),
          fingerprint: createHash('sha256').update(termsSnapshot(c)).digest('hex')
        };
        c.status = 'signed';
        c.signedAt = now;
        c.viewedAt = c.viewedAt || now;
        await s.setJSON(KEY(id), c);
        return json({ contract: publicView(c) });
      }

      if (action === 'pdf' && method === 'GET') {
        const pdf = await buildContractPdf(c, await getSettings(s));
        const fname = `${(c.school || 'School').replace(/[^A-Za-z0-9]+/g, '_')}_Author_Visit_Contract${c.signature ? '_SIGNED' : ''}.pdf`;
        return new Response(pdf, {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `${url.searchParams.has('inline') ? 'inline' : 'attachment'}; filename="${fname}"`,
            'cache-control': 'no-store'
          }
        });
      }
      return err('Not found', 404);
    }

    // ---------------- Admin ----------------
    const admin = isAdmin(req);
    if (admin === null) return err('Admin password not set up yet. Add CONTRACTS_ADMIN_PASSWORD in Netlify > Site configuration > Environment variables, then redeploy.', 500);
    if (!admin) return err('Wrong password.', 401);

    if (parts[0] === 'settings') {
      if (method === 'GET') return json(await getSettings(s));
      if (method === 'PUT') {
        const b = await req.json().catch(() => ({}));
        const next = {
          authorName: String(b.authorName || 'Matthew Landis').slice(0, 120),
          address: String(b.address || '').slice(0, 500),
          phone: String(b.phone || '').slice(0, 60),
          email: String(b.email || '').slice(0, 200)
        };
        await s.setJSON(SETTINGS_KEY, next);
        return json(next);
      }
    }

    if (parts.length === 0) {
      if (method === 'GET') {
        const { blobs } = await s.list({ prefix: 'contract/' });
        const all = (await Promise.all(blobs.map(b => s.get(b.key, { type: 'json' })))).filter(Boolean);
        all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        return json(all.map(c => ({
          id: c.id, school: c.school, contactName: c.contactName, visitDate: c.visitDate, visitType: c.visitType,
          status: c.status, updatedAt: c.updatedAt, sentAt: c.sentAt, viewedAt: c.viewedAt, signedAt: c.signedAt,
          total: invoiceTotal(c.invoiceItems)
        })));
      }
      if (method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const now = new Date().toISOString();
        const c = { ...clean(b), id: newId(), status: 'draft', createdAt: now, updatedAt: now };
        await s.setJSON(KEY(c.id), c);
        return json(c, 201);
      }
    }

    const id = parts[0];
    const c = await s.get(KEY(id), { type: 'json' });
    if (!c) return err('Not found', 404);
    const action = parts[1];

    if (!action) {
      if (method === 'GET') return json(c);
      if (method === 'PUT') {
        if (c.signature) return err('This contract is signed and locked. Duplicate it to make changes.', 409);
        const b = await req.json().catch(() => ({}));
        Object.assign(c, clean(b), { updatedAt: new Date().toISOString() });
        await s.setJSON(KEY(id), c);
        return json(c);
      }
      if (method === 'DELETE') {
        await s.delete(KEY(id));
        return json({ ok: true });
      }
    }

    if (action === 'send' && method === 'POST') {
      if (c.signature) return json(c);
      const now = new Date().toISOString();
      const settings = await getSettings(s);
      if (c.status === 'draft') { c.status = 'sent'; c.sentAt = now; }
      c.authorSignature = c.authorSignature || { name: settings.authorName || 'Matthew Landis', signedAt: now };
      c.updatedAt = now;
      await s.setJSON(KEY(id), c);
      return json(c);
    }

    if (action === 'duplicate' && method === 'POST') {
      const now = new Date().toISOString();
      const copy = { ...clean(c), id: newId(), status: 'draft', createdAt: now, updatedAt: now };
      await s.setJSON(KEY(copy.id), copy);
      return json(copy, 201);
    }

    return err('Not found', 404);
  } catch (e) {
    console.error(e);
    return err('Something went wrong on the server: ' + (e?.message || e), 500);
  }
};

export const config = { path: ['/api/contracts', '/api/contracts/*'] };
