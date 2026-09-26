// Small helpers used by every part of the server.
export const DAY = 86400e3;

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const fail = (status, msg) => { throw new HttpError(status, msg); };
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
export async function body(request, max = 450000) {
  const text = await request.text();
  if (text.length > max) fail(413, 'That is too big to send.');
  try { return JSON.parse(text || '{}'); } catch (e) { fail(400, 'The server could not read that request.'); }
}
export const enc = (s) => new TextEncoder().encode(s);
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function sha256(text) { return hex(await crypto.subtle.digest('SHA-256', enc(text))); }
export function randomId(n) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = '';
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}
export function needUser(ctx) {
  if (!ctx.user) fail(401, 'Log in first. It only takes a username and a password.');
  return ctx.user;
}
export const isAdmin = (env, user) => !!user && (env.ADMIN_USERNAME || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean).includes(user.name.toLowerCase());
export const startOfDay = (t = Date.now()) => t - (t % DAY);
// A database rule (like "coins can't go below 0") stopped a change.
export const isConstraint = (e) => /constraint|CHECK|UNIQUE/i.test(String(e && (e.message || e)));

// Signed tickets: the server hands one out, then checks it when the WebSocket connects.
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function hmacKey(env) {
  return crypto.subtle.importKey('raw', enc((env.SALT || 'blockyard') + '|rooms'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signTicket(env, payload) {
  const data = b64url(enc(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc(data)));
  return data + '.' + b64url(sig);
}
export async function readTicket(env, ticket) {
  const [data, sig] = String(ticket || '').split('.');
  if (!data || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64url(sig), enc(data));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(data)));
    return p.x > Date.now() ? p : null;
  } catch (e) { return null; }
}
