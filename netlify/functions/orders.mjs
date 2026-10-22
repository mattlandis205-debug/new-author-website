// School book orders — Stripe Checkout + Netlify Blobs.
// Each order page belongs to a contract (one school visit).
//
// Public:
//   GET  /api/orders/page/:slug                     page data (school, books, prices, open/closed)
//   POST /api/orders/page/:slug/checkout            create order + Stripe Checkout session -> {url}
//   GET  /api/orders/page/:slug/confirm?session_id= confirm payment after Stripe redirects back
// Admin (Authorization: Bearer <CONTRACTS_ADMIN_PASSWORD>):
//   GET  /api/orders/admin/:contractId              settings + orders
//   PUT  /api/orders/admin/:contractId/settings     save page settings
//   POST /api/orders/admin/:contractId/sync         ask Stripe about unfinished checkouts
//   GET  /api/orders/admin/:contractId/csv          spreadsheet download
//
// Env: STRIPE_SECRET_KEY (sk_live_... or sk_test_...). Card details never touch this site.

import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BOOKS, booksFor, orderTotal, slugify, MAX_QTY, CAMP_YES, CAMP_NO, POD_YES, POD_NO } from '../../js/orders-shared.js';

const store = () => getStore({ name: 'school-contracts', consistency: 'strong' });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (message, status = 400) => json({ error: message }, status);
const sha = s => createHash('sha256').update(String(s)).digest();
const newId = (n = 9) => randomBytes(n).toString('base64url');

function isAdmin(req) {
  const pw = process.env.CONTRACTS_ADMIN_PASSWORD;
  if (!pw) return null;
  const h = req.headers.get('authorization') || '';
  return timingSafeEqual(sha(h.startsWith('Bearer ') ? h.slice(7) : ''), sha(pw));
}

// ---------- Stripe (plain REST, no SDK) ----------
function formEncode(obj, prefix, out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out.join('&');
}
async function stripe(path, { method = 'GET', params } = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw Object.assign(new Error('Online payments are not set up yet.'), { status: 503 });
  const base = process.env.STRIPE_API_BASE || 'https://api.stripe.com';
  const r = await fetch(base + '/v1' + path, {
    method,
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/x-www-form-urlencoded' },
    body: params ? formEncode(params) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `Stripe error ${r.status}`), { status: 502 });
  return data;
}

// ---------- data helpers ----------
const SETTINGS = id => `ordersettings/${id}`;
const SLUG = slug => `slug/${slug}`;
const ORDER = (cid, oid) => `order/${cid}/${oid}`;

async function settingsFor(s, cid) {
  return (await s.get(SETTINGS(cid), { type: 'json' })) || { enabled: false, open: true, slug: '', prices: {}, hidden: [], message: '' };
}
async function bySlug(s, slug) {
  const ref = await s.get(SLUG(slug), { type: 'json' });
  if (!ref) return null;
  const contract = await s.get(`contract/${ref.contractId}`, { type: 'json' });
  if (!contract) return null;
  const settings = await settingsFor(s, ref.contractId);
  if (!settings.enabled || settings.slug !== slug) return null;
  return { contract, settings };
}
async function listOrders(s, cid) {
  const { blobs } = await s.list({ prefix: `order/${cid}/` });
  const all = (await Promise.all(blobs.map(b => s.get(b.key, { type: 'json' })))).filter(Boolean);
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
async function markFromSession(s, order, session) {
  if (session.payment_status === 'paid' && order.status !== 'paid') {
    order.status = 'paid';
    order.paidAt = new Date().toISOString();
    order.paymentIntent = session.payment_intent || '';
    order.amountPaid = (session.amount_total ?? Math.round(order.total * 100)) / 100;
    await s.setJSON(ORDER(order.contractId, order.id), order);
  } else if (session.status === 'expired' && order.status === 'pending') {
    order.status = 'abandoned';
    await s.setJSON(ORDER(order.contractId, order.id), order);
  }
  return order;
}

const csvCell = v => {
  const t = String(v ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export default async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/orders\/?/, '').split('/').filter(Boolean);
  const method = req.method;
  const s = store();

  try {
    // ================= Public =================
    if (parts[0] === 'page') {
      const slug = parts[1];
      if (!slug || !/^[a-z0-9-]{1,40}$/.test(slug)) return err('Not found', 404);
      const found = await bySlug(s, slug);
      if (!found) return err('This order page is not active.', 404);
      const { contract, settings } = found;
      const action = parts[2];

      if (!action && method === 'GET') {
        return json({
          school: contract.school, visitDate: contract.visitDate, open: settings.open !== false,
          message: settings.message || '', books: booksFor(settings), paymentsReady: !!process.env.STRIPE_SECRET_KEY
        });
      }

      if (action === 'checkout' && method === 'POST') {
        if (settings.open === false) return err('Orders for this visit are closed. Reach out to Matt directly!', 409);
        const b = await req.json().catch(() => ({}));
        const parentName = String(b.parentName || '').trim().slice(0, 120);
        const email = String(b.email || '').trim().slice(0, 200);
        const childName = String(b.childName || '').trim().slice(0, 200);
        if (parentName.length < 2) return err('Please enter your full name.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Please enter a valid email address.');
        if (!childName) return err("Please enter your child's first name.");
        const offered = booksFor(settings);
        const items = [];
        for (const book of offered) {
          const q = Math.floor(Number(b.qty?.[book.id]) || 0);
          if (q < 0 || q > MAX_QTY) return err(`Please choose between 0 and ${MAX_QTY} copies.`);
          if (q > 0) items.push({ id: book.id, title: book.title, format: book.format, qty: q, price: book.price });
        }
        if (!items.length) return err('Pick at least one book.');
        const total = orderTotal(items);
        const now = new Date().toISOString();
        const order = {
          id: newId(), contractId: contract.id, slug, school: contract.school, createdAt: now, status: 'pending',
          parentName, email, childName,
          camp: b.camp === 'yes' ? CAMP_YES : CAMP_NO,
          podcast: b.podcast === 'yes' ? POD_YES : POD_NO,
          items, total
        };
        const origin = url.origin;
        const session = await stripe('/checkout/sessions', {
          method: 'POST',
          params: {
            mode: 'payment',
            customer_email: email,
            client_reference_id: order.id,
            success_url: `${origin}/order/${slug}?paid={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/order/${slug}?canceled=1`,
            line_items: Object.fromEntries(items.map((it, i) => [i, {
              quantity: it.qty,
              price_data: {
                currency: 'usd', unit_amount: Math.round(it.price * 100),
                product_data: { name: `${it.title} (${it.format}) - signed` }
              }
            }])),
            metadata: { order_id: order.id, school: (contract.school || '').slice(0, 100), child: childName.slice(0, 100) },
            payment_intent_data: { description: `Signed books - ${contract.school || ''} - ${childName}`.slice(0, 300), metadata: { order_id: order.id } }
          }
        });
        order.stripeSessionId = session.id;
        await s.setJSON(ORDER(contract.id, order.id), order);
        return json({ url: session.url });
      }

      if (action === 'confirm' && method === 'GET') {
        const sid = url.searchParams.get('session_id') || '';
        if (!/^cs_[A-Za-z0-9_]+$/.test(sid)) return err('Not found', 404);
        const session = await stripe('/checkout/sessions/' + encodeURIComponent(sid));
        const oid = session.client_reference_id || session.metadata?.order_id;
        const order = oid && await s.get(ORDER(contract.id, oid), { type: 'json' });
        if (!order) return err('Order not found', 404);
        await markFromSession(s, order, session);
        return json({ status: order.status, childName: order.childName, items: order.items, total: order.total, email: order.email });
      }
      return err('Not found', 404);
    }

    // ================= Admin =================
    if (parts[0] === 'admin') {
      const admin = isAdmin(req);
      if (admin === null) return err('Admin password not set up.', 500);
      if (!admin) return err('Wrong password.', 401);
      const cid = parts[1];
      const contract = cid && await s.get(`contract/${cid}`, { type: 'json' });
      if (!contract) return err('Not found', 404);
      const action = parts[2];

      if (!action && method === 'GET') {
        return json({ settings: await settingsFor(s, cid), orders: await listOrders(s, cid), paymentsReady: !!process.env.STRIPE_SECRET_KEY, catalog: BOOKS });
      }

      if (action === 'settings' && method === 'PUT') {
        const b = await req.json().catch(() => ({}));
        const prev = await settingsFor(s, cid);
        const slug = slugify(b.slug || contract.school);
        if (!slug) return err('Pick a web address for the order page.');
        const owner = await s.get(SLUG(slug), { type: 'json' });
        if (owner && owner.contractId !== cid) return err(`The address /order/${slug} is already used by another school. Try adding the year, like ${slug}-${new Date().getFullYear()}.`, 409);
        const prices = {};
        for (const book of BOOKS) {
          const v = b.prices?.[book.id];
          if (v !== undefined && v !== '' && v !== null && Number.isFinite(Number(v)) && Number(v) >= 0) prices[book.id] = Math.round(Number(v) * 100) / 100;
        }
        const next = {
          enabled: !!b.enabled, open: b.open !== false, slug, prices,
          hidden: (Array.isArray(b.hidden) ? b.hidden : []).filter(id => BOOKS.some(x => x.id === id)),
          message: String(b.message || '').slice(0, 1000)
        };
        if (prev.slug && prev.slug !== slug) {
          const old = await s.get(SLUG(prev.slug), { type: 'json' });
          if (old?.contractId === cid) await s.delete(SLUG(prev.slug));
        }
        await s.setJSON(SLUG(slug), { contractId: cid });
        await s.setJSON(SETTINGS(cid), next);
        return json(next);
      }

      if (action === 'sync' && method === 'POST') {
        const orders = await listOrders(s, cid);
        let updated = 0;
        for (const o of orders.filter(o => o.status === 'pending' && o.stripeSessionId)) {
          try {
            const session = await stripe('/checkout/sessions/' + encodeURIComponent(o.stripeSessionId));
            const before = o.status;
            await markFromSession(s, o, session);
            if (o.status !== before) updated++;
          } catch { /* keep going */ }
        }
        return json({ updated, orders: await listOrders(s, cid) });
      }

      if (action === 'csv' && method === 'GET') {
        const orders = (await listOrders(s, cid)).filter(o => o.status === 'paid').reverse();
        const header = ['Timestamp', 'Email Address', 'Parent FULL name', "Child's first name", ...BOOKS.map(b => `${b.short} (${b.format})`), 'Total', 'Writing camp info?', 'Podcast?', 'Stripe payment'];
        const rows = orders.map(o => [
          new Date(o.paidAt || o.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' }),
          o.email, o.parentName, o.childName,
          ...BOOKS.map(b => o.items.find(i => i.id === b.id)?.qty || ''),
          (o.amountPaid ?? o.total).toFixed(2), o.camp, o.podcast, o.paymentIntent || o.stripeSessionId
        ]);
        const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
        const name = `${(contract.school || 'School').replace(/[^A-Za-z0-9]+/g, '_')}_Book_Orders.csv`;
        return new Response('﻿' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
      }
    }

    return err('Not found', 404);
  } catch (e) {
    console.error(e);
    return err(e.status ? e.message : 'Something went wrong: ' + (e?.message || e), e.status || 500);
  }
};

export const config = { path: ['/api/orders', '/api/orders/*'] };
