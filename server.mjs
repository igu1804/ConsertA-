import './env.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { createStorage } from './storage.mjs';
import { createMarketplaceStore } from './marketplace-store.mjs';
import { createMarketplaceApi } from './marketplace-api.mjs';
import { authEnabled, memberSession, configuredRole, proxyAuth } from './auth.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
if (DATA === PUBLIC || DATA.startsWith(PUBLIC + path.sep)) throw new Error('DATA_DIR deve ficar fora de public.');
const PORT = Number(process.env.PORT || 4173);
const IS_RENDER = process.env.RENDER === 'true';
const HOST = process.env.HOST || (IS_RENDER ? '0.0.0.0' : '127.0.0.1');
const ADMIN_USER = process.env.ADMIN_USER || 'equipe';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT inválida.');
if (IS_RENDER && !process.env.DATABASE_URL?.trim()) throw new Error('Configure DATABASE_URL no Render para preservar o contador e os cadastros.');
if (IS_RENDER && ADMIN_PASSWORD.length < 16) throw new Error('Configure ADMIN_PASSWORD com pelo menos 16 caracteres no Render.');
const storage = await createStorage({ dataDir: DATA });
if (IS_RENDER && storage.mode !== 'postgres') throw new Error('O Render precisa usar o armazenamento PostgreSQL configurado.');
const marketplace = await createMarketplaceStore({ dataDir: DATA });
if (IS_RENDER && marketplace.mode !== 'postgres') throw new Error('O marketplace precisa usar o PostgreSQL configurado no Render.');
const INTEREST_ID = /^(?:qa_)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CTA = new Set(['hero_cliente', 'hero_profissional', 'nav_piloto', 'servico_eletrica', 'servico_hidraulica', 'servico_montagem', 'servico_reparos', 'servico_limpeza', 'servico_baba', 'piloto_cliente', 'piloto_profissional', 'enviar_cliente', 'enviar_profissional', 'footer_piloto', 'whatsapp_contato', 'whatsapp_cadastro']);
const SESSION = /^[a-zA-Z0-9_-]{8,100}$/;
const rate = new Map();
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function fail(status, message) { return Object.assign(new Error(message), { status }); }
function text(value, max, required = false) {
  if (typeof value !== 'string') { if (required) throw fail(400, 'Preencha os campos obrigatórios.'); return ''; }
  const out = value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (out.length > max || (required && !out)) throw fail(400, 'Confira o tamanho dos campos preenchidos.');
  return out;
}
function sessionOf(value) { if (typeof value !== 'string' || !SESSION.test(value)) throw fail(400, 'Sessão inválida. Atualize a página e tente novamente.'); return value; }
function context(body) {
  return { session: sessionOf(body.session), device: body.device === 'mobile' ? 'mobile' : 'desktop', source: /^[a-zA-Z0-9_-]{1,60}$/.test(body.source || '') ? body.source.toLowerCase() : 'direto', ...(body.audience === 'cliente' || body.audience === 'profissional' ? { audience: body.audience } : {}) };
}
function localOnly(req) {
  const localAddress = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const localHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.host || '');
  const proxy = Object.keys(req.headers).some(name => /forwarded|^x-real-ip$|^cf-connecting-ip$|^true-client-ip$|^via$|^cf-ray$/i.test(name));
  return localAddress && localHost && !proxy;
}
async function adminAccess(req, res) {
  const user = await memberSession(req, res);
  if (!user) return null;
  const role = configuredRole(user.email) || await marketplace.adminRole(user.id);
  return role ? { user, role } : null;
}
async function allowAdmin(req, res) {
  if (authEnabled && await adminAccess(req, res)) return true;
  if (!authEnabled && !IS_RENDER && localOnly(req)) return true;
  if (authEnabled && !req.headers.authorization) {
    if (['/painel', '/painel.html', '/gestao', '/administrador'].includes(new URL(req.url, 'http://localhost').pathname)) { res.writeHead(303, { Location: '/equipe', 'Cache-Control': 'no-store' }); res.end(); }
    else json(res, 401, { ok: false, error: 'Entre com uma conta autorizada da equipe.' });
    return false;
  }
  if (!ADMIN_PASSWORD) { json(res, 403, { ok: false, error: 'Área disponível apenas no computador local.' }); return false; }
  const header = req.headers.authorization || '';
  const supplied = /^Basic /i.test(header) ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const digest = value => createHash('sha256').update(value, 'utf8').digest();
  if (timingSafeEqual(digest(supplied), digest(`${ADMIN_USER}:${ADMIN_PASSWORD}`))) return true;
  limit(req, 'admin');
  res.setHeader('WWW-Authenticate', 'Basic realm="ConsertAi - equipe", charset="UTF-8"');
  json(res, 401, { ok: false, error: 'Entre com o usuário e a senha da equipe.' });
  return false;
}
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!req.headers.origin) return true;
  try { const origin = new URL(req.headers.origin); return ['http:', 'https:'].includes(origin.protocol) && origin.host.toLowerCase() === (req.headers.host || '').toLowerCase(); }
  catch { return false; }
}
function limit(req, kind) {
  const now = Date.now();
  // Endereços são usados apenas neste limitador temporário e nunca gravados.
  const cloudflareClient = String(req.headers['cf-connecting-ip'] || '').trim();
  const forwarded = IS_RENDER ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const client = isIP(cloudflareClient) ? cloudflareClient : isIP(forwarded) ? forwarded : req.socket.remoteAddress;
  const key = `${client}:${kind}`;
  const windowMs = kind === 'lead' || kind === 'marketplace' ? 600000 : 60000;
  const max = kind === 'lead' ? 12 : kind === 'marketplace' ? 30 : kind === 'interest' ? 60 : kind === 'admin' ? 30 : 240;
  let state = rate.get(key);
  if (!state || now - state.start >= windowMs) { state = { start: now, count: 0 }; rate.set(key, state); }
  if (++state.count > max) throw fail(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
  if (rate.size > 5000) for (const [k, v] of rate) if (now - v.start > 600000) rate.delete(k);
}
async function bodyOf(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw fail(415, 'Envie os dados em JSON.');
  if (Number(req.headers['content-length'] || 0) > 12288) throw fail(413, 'Formulário muito grande.');
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 12288) throw fail(413, 'Formulário muito grande.'); chunks.push(chunk); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail(400, 'JSON inválido.'); }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw fail(400, 'Dados inválidos.');
  return body;
}
const marketplaceApi = createMarketplaceApi({ store: marketplace, allowAdmin, bodyOf, fail, json, limit, sameOrigin, text });
async function event(req, res) {
  const body = await bodyOf(req); const ctx = context(body);
  if (!['page_view', 'cta_click', 'form_start'].includes(body.type)) throw fail(400, 'Evento desconhecido.');
  let id = '';
  if (body.type === 'cta_click') { if (!CTA.has(body.id)) throw fail(400, 'Botão desconhecido.'); id = body.id; }
  if (body.type === 'form_start') { id = ['cliente', 'profissional'].includes(body.id) ? body.id : ctx.audience || ''; if (!id) throw fail(400, 'Informe o perfil do formulário.'); }
  const record = { at: new Date().toISOString(), type: body.type, ...(id ? { id } : {}), ...ctx };
  if (body.type === 'page_view') {
    const { inserted } = await storage.registerPageView(record);
    return json(res, 200, { ok: true, duplicate: !inserted });
  }
  await storage.append('events', record);
  json(res, 200, { ok: true });
}
async function interest(req, res) {
  const body = await bodyOf(req);
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.toLowerCase() : '';
  if (!INTEREST_ID.test(deviceId)) throw fail(400, 'Identificador do navegador inválido. Atualize a página e tente de novo.');
  const button = text(body.button, 60, true);
  if (body.audience !== undefined && !['cliente', 'profissional'].includes(body.audience)) throw fail(400, 'Perfil inválido.');
  const source = /^[a-zA-Z0-9_-]{1,60}$/.test(body.source || '') ? body.source.toLowerCase() : 'direto';
  const { inserted, count } = await storage.registerInterest({ at: new Date().toISOString(), deviceId, button, source, ...(body.audience ? { audience: body.audience } : {}) });
  json(res, 200, { ok: true, count, alreadyCounted: !inserted });
}
async function lead(req, res) {
  const body = await bodyOf(req);
  if (text(body.website, 500)) return json(res, 200, { ok: true, id: randomUUID() });
  const ctx = context(body);
  if (!['cliente', 'profissional'].includes(body.audience)) throw fail(400, 'Escolha seu perfil.');
  if (body.consent !== true) throw fail(400, 'É necessário aceitar o contato sobre o piloto.');
  const name = text(body.name, 100, true);
  if (name.length < 2) throw fail(400, 'Informe seu nome.');
  let contact = text(body.contact, 160, true);
  const phone = contact.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (email.test(contact)) contact = contact.toLowerCase();
  else if (/^[0-9\s()+.-]+$/.test(contact) && /^\d{10,11}$/.test(phone)) contact = phone;
  else throw fail(400, 'Informe um e-mail válido ou WhatsApp com DDD.');
  const city = text(body.city, 100, true);
  const service = text(body.service, 100, true);
  const description = text(body.description, 1000);
  if (service === 'Outro serviço — quero descrever' && !description) throw fail(400, 'Descreva o serviço que você procura ou oferece.');
  const id = randomUUID(); const at = new Date().toISOString();
  await storage.append('leads', { id, at, name, contact, city, service, audience: body.audience, description, consent: true, consentVersion: 'piloto-v1', ...ctx });
  try { await storage.append('events', { at, type: 'lead_success', id, ...ctx, audience: body.audience }); }
  catch { console.error('Cadastro salvo; não foi possível registrar seu evento estatístico.'); }
  json(res, 201, { ok: true, id });
}
function dayOf(at) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at)); }
async function metrics() {
  await storage.flush();
  const [allEvents, allLeads, interestCount] = await Promise.all([storage.rows('events'), storage.rows('leads'), storage.countInterests()]);
  const events = allEvents.filter(e => !String(e.session).startsWith('qa_'));
  const leads = allLeads.filter(e => !String(e.session).startsWith('qa_'));
  const views = events.filter(e => e.type === 'page_view');
  const clicks = events.filter(e => e.type === 'cta_click');
  const sessions = new Set(views.map(e => e.session));
  const converted = new Set(leads.filter(e => sessions.has(e.session)).map(e => e.session));
  const daily = new Map();
  for (const e of [...views, ...leads.map(l => ({ ...l, type: 'lead' }))]) {
    const date = dayOf(e.at); if (!daily.has(date)) daily.set(date, { date, visits: 0, leads: 0 });
    daily.get(date)[e.type === 'page_view' ? 'visits' : 'leads']++;
  }
  const byDevice = { mobile: 0, desktop: 0 }; views.forEach(e => byDevice[e.device === 'mobile' ? 'mobile' : 'desktop']++);
  const byAudience = { cliente: 0, profissional: 0 }; leads.forEach(l => byAudience[l.audience]++);
  return { updatedAt: new Date().toISOString(), interestCount, visits: views.length, visitors: sessions.size, clicks: clicks.length, formStarts: events.filter(e => e.type === 'form_start').length, leads: leads.length, conversion: sessions.size ? converted.size / sessions.size * 100 : 0, buttons: [...CTA].map(id => ({ id, clicks: clicks.filter(e => e.id === id).length })).sort((a, b) => b.clicks - a.clicks), byDevice, byAudience, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), sources: Object.entries(views.reduce((all, e) => { all[e.source || 'direto'] = (all[e.source || 'direto'] || 0) + 1; return all; }, {})).map(([source, visits]) => ({ source, visits })), lastLeads: leads.slice(-20).reverse().map(({ id, at, name, contact, city, service, audience }) => ({ id, at, name, contact, city, service, audience })) };
}
function csvCell(value) { let s = String(value ?? ''); if (/^[\s]*[=+@\-\t\r\n]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    const url = new URL(req.url, 'http://localhost'); const pathname = url.pathname;
    const privateRoute = ['/painel', '/painel.html', '/gestao', '/administrador', '/api/metrics', '/api/leads/export.csv'].includes(pathname);
    if (privateRoute && !await allowAdmin(req, res)) return;
    if (pathname.startsWith('/api/auth/')) {
      if (!sameOrigin(req)) throw fail(403, 'Origem não autorizada.');
      limit(req, 'admin');
      const body = req.method === 'POST' ? await bodyOf(req) : undefined;
      if (await proxyAuth(req, res, pathname.slice('/api/auth/'.length), body)) return;
      throw fail(404, 'Autenticação indisponível.');
    }
    if (await marketplaceApi(req, res, url)) return;
    if (req.method === 'POST' && ['/api/event', '/api/lead', '/api/interest'].includes(pathname)) {
      if (!sameOrigin(req)) throw fail(403, 'Origem não autorizada.');
      limit(req, pathname === '/api/lead' ? 'lead' : pathname === '/api/interest' ? 'interest' : 'event');
      return await (pathname === '/api/event' ? event(req, res) : pathname === '/api/interest' ? interest(req, res) : lead(req, res));
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, POST'); throw fail(405, 'Método não permitido.'); }
    if (pathname === '/health') return json(res, 200, { ok: true });
    if (pathname === '/api/interest-count') return json(res, 200, { count: await storage.countInterests() });
    if (pathname === '/api/team/session') { const access = await adminAccess(req, res); return json(res, 200, { enabled: authEnabled, authorized: Boolean(access), role: access?.role || null }); }
    if (pathname === '/api/metrics') return json(res, 200, await metrics());
    if (pathname === '/api/leads/export.csv') {
      await storage.flush(); const leads = (await storage.rows('leads')).filter(l => !String(l.session).startsWith('qa_'));
      const fields = ['id', 'at', 'name', 'contact', 'city', 'service', 'audience', 'description', 'consent', 'consentVersion'];
      const content = '\ufeff' + [fields.map(csvCell).join(';'), ...leads.map(l => fields.map(f => csvCell(l[f])).join(';'))].join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="consertai-cadastros.csv"', 'Cache-Control': 'no-store' }); return res.end(req.method === 'HEAD' ? undefined : content);
    }
    const memberPage = ['/profissionais', '/meu-perfil', '/minha-conta'].includes(pathname);
    if (memberPage && !(authEnabled && await memberSession(req, res))) {
      res.writeHead(303, { Location: '/entrar?voltar=' + encodeURIComponent(pathname + url.search), 'Cache-Control': 'no-store' });
      return res.end();
    }
    let relative;
    if (['/', '/consertai', '/consertai/', '/index.html'].includes(pathname)) relative = 'index.html';
    else if (['/painel', '/painel.html'].includes(pathname)) relative = 'painel.html';
    else if (pathname === '/equipe') relative = 'equipe.html';
    else if (['/gestao', '/administrador'].includes(pathname)) relative = 'gestao.html';
    else if (pathname === '/entrar') relative = 'entrar.html';
    else if (pathname === '/profissionais') relative = 'profissionais.html';
    else if (pathname === '/meu-perfil') relative = 'meu-perfil.html';
    else if (pathname === '/minha-conta') relative = 'minha-conta.html';
    else if (['/app.js', '/styles.css', '/marketplace.css', '/marketplace-ui.js', '/providers.js', '/profile.js', '/account.js', '/gestao.js'].includes(pathname)) relative = pathname.slice(1);
    else if (pathname.startsWith('/assets/')) { try { relative = decodeURIComponent(pathname).slice(1); } catch { throw fail(400, 'Endereço inválido.'); } }
    else throw fail(404, 'Página não encontrada.');
    if (relative.includes('\\') || relative.split('/').some(part => part === '..' || part.startsWith('.'))) throw fail(404, 'Arquivo não encontrado.');
    const file = path.resolve(PUBLIC, relative);
    if (!file.startsWith(PUBLIC + path.sep) || !MIME[path.extname(file).toLowerCase()]) throw fail(404, 'Arquivo não encontrado.');
    let content; try { content = await readFile(file); } catch (error) { if (['ENOENT', 'EISDIR'].includes(error.code)) throw fail(404, 'Arquivo não encontrado.'); throw error; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()], 'Cache-Control': ['painel.html', 'gestao.html'].includes(relative) || memberPage ? 'no-store' : 'no-cache', 'Content-Length': content.length });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (!error.status) console.error('Erro interno:', error.message);
    if (error.status === 429) res.setHeader('Retry-After', '60');
    if (!res.headersSent) json(res, error.status || 500, { ok: false, error: error.status ? error.message : 'Não foi possível salvar agora. Tente novamente.' });
    else res.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(PORT, HOST, () => console.log(`ConsertAí iniciado na porta ${PORT}. Armazenamento: ${storage.mode}.`));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => { await Promise.allSettled([storage.close(), marketplace.close()]); clearTimeout(deadline); process.exit(0); });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
