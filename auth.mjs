import { createAuthServer, handleAuthProxyRequest, serializeSetCookie } from '@neondatabase/auth/server';

export const authEnabled = Boolean(process.env.NEON_AUTH_BASE_URL);
const baseUrl = process.env.NEON_AUTH_BASE_URL;
const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
const team = new Set((process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
if (authEnabled && (!cookieSecret || cookieSecret.length < 32)) throw new Error('Configure NEON_AUTH_COOKIE_SECRET com pelo menos 32 caracteres.');
if (authEnabled && new URL(baseUrl).protocol !== 'https:') throw new Error('NEON_AUTH_BASE_URL precisa usar HTTPS.');
const log = { warn() {}, error() {} };
function originOf(req) { return `${process.env.RENDER === 'true' ? 'https' : 'http'}://${req.headers.host}`; }
function setCookie(res, name, value, options) {
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : [previous]), serializeSetCookie({ name, value, ...options })]);
}
export async function teamSession(req, res) {
  if (!authEnabled || !String(req.headers.cookie || '').includes('neon-auth')) return null;
  const auth = createAuthServer({ baseUrl, cookieSecret, sessionDataTtl: 60, sameSite: 'lax', log, context: () => ({
    getCookies: () => req.headers.cookie || '',
    setCookie: (name, value, options) => setCookie(res, name, value, options),
    getHeader: name => req.headers[name.toLowerCase()] || null,
    getOrigin: () => originOf(req),
    getFramework: () => 'node-http'
  }) });
  const { data, error } = await auth.getSession();
  if (error) throw Object.assign(new Error('Não foi possível verificar o login. Tente novamente.'), { status: 503 });
  const user = data?.user;
  return user?.emailVerified === true && team.has(String(user.email).toLowerCase()) ? user : null;
}
const routes = new Map([
  ['get-session', 'GET'], ['sign-in/email', 'POST'], ['sign-up/email', 'POST'], ['sign-out', 'POST'],
  ['email-otp/send-verification-otp', 'POST'], ['email-otp/verify-email', 'POST']
]);
export async function proxyAuth(req, res, path, body) {
  if (!authEnabled) return false;
  if (routes.get(path) !== req.method) return false;
  const headers = new Headers({ origin: originOf(req), 'x-neon-auth-proxy': 'node-http' });
  if (req.headers.cookie) headers.set('cookie', req.headers.cookie);
  if (body) headers.set('content-type', 'application/json');
  const request = new Request(`${originOf(req)}/api/auth/${path}`, { method: req.method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const response = await handleAuthProxyRequest({ request, path, baseUrl, cookieSecret, sessionDataTtl: 60, sameSite: 'lax', log });
  res.statusCode = response.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
  return true;
}
