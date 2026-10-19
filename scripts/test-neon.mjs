import '../env.mjs';
import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

assert(process.env.DATABASE_URL && process.env.NEON_AUTH_BASE_URL, 'Configure o Neon antes do teste.');
const run = randomUUID();
const session = `qa_${run}`;
const email = `qa_${run}@example.com`;
const password = randomBytes(24).toString('base64url');
const interestId = randomUUID();
const base = 'http://127.0.0.1:4191';
const connection = new URL(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
connection.searchParams.set('sslmode', 'verify-full');
const db = new pg.Client({ connectionString: connection.toString(), connectionTimeoutMillis: 15000 });
let app, userId, leadId, passed = 0;
const jar = new Map();
function pass(label, condition) { assert(condition, label); passed++; console.log(`PASS ${label}`); }
async function start(adminEmails = email) {
  app = spawn(process.execPath, [...process.execArgv.filter(arg => arg !== '--input-type=module'), 'server.mjs'], { env: { ...process.env, PORT: '4191', HOST: '127.0.0.1', ADMIN_EMAILS: adminEmails }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  app.stdout.on('data', chunk => { logs += chunk; });
  app.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; i < 60; i++) {
    if (app.exitCode !== null) throw new Error(`O servidor encerrou antes do teste (${app.exitCode}).`);
    try { const r = await fetch(base + '/health', { signal: AbortSignal.timeout(2000) }); if (r.ok) { pass('servidor iniciou com PostgreSQL', logs.includes('Armazenamento: postgres')); return; } } catch {}
    await delay(500);
  }
  console.log('Diagnóstico de inicialização:', logs);
  throw new Error('O servidor de teste não iniciou.');
}
async function stop() { if (app && app.exitCode === null) { const child = app; child.kill(); await new Promise(resolve => child.once('exit', resolve)); } }
async function request(route, body, { cookies = false, admin = false, headers = {} } = {}) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET', redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}),
      ...(cookies ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
      ...(admin ? { Authorization: `Basic ${Buffer.from(`${process.env.ADMIN_USER}:${process.env.ADMIN_PASSWORD}`).toString('base64')}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
try {
  await db.connect();
  await start();
  pass('métricas recusam acesso anônimo', (await request('/api/metrics')).status === 401);
  const initial = (await request('/api/interest-count')).data.count;
  const body = { deviceId: interestId, button: 'hero_cliente', source: 'qa_verificacao' };
  const results = await Promise.all(Array.from({ length: 12 }, () => request('/api/interest', body)));
  pass('12 cliques do mesmo navegador gravam apenas 1 interesse', results.filter(result => result.data?.alreadyCounted === false).length === 1 && (await request('/api/interest-count')).data.count === initial + 1);
  const ctx = { session, device: 'desktop', source: 'qa', audience: 'cliente' };
  const lead = await request('/api/lead', { ...ctx, consent: true, website: '', name: 'Teste automatizado', contact: email, city: 'Cidade de teste', service: 'Diarista e limpeza', description: 'Verificação automatizada. Não contatar.' });
  leadId = lead.data?.id;
  pass('cadastro é salvo no PostgreSQL', lead.status === 201 && (await db.query('SELECT 1 FROM consertai_leads WHERE lead_id=$1', [leadId])).rowCount === 1);
  await stop(); await start();
  pass('contador persiste após reiniciar', (await request('/api/interest-count')).data.count === initial + 1);
  pass('deduplicação persiste após reiniciar', (await request('/api/interest', body)).data.alreadyCounted === true);
  const signup = await request('/api/auth/sign-up/email', { name: 'QA ConsertAí', email, password });
  if (signup.status !== 200) console.log('Resposta de cadastro:', signup.status, signup.data?.code, signup.data?.message);
  userId = signup.data?.user?.id;
  if (!userId) userId = (await db.query('SELECT id FROM neon_auth."user" WHERE email=$1', [email])).rows[0]?.id;
  pass('Neon Auth cria conta de teste', Boolean(userId));
  // Apenas a conta sintética é verificada; o envio de e-mail real é um teste manual separado.
  await db.query('UPDATE neon_auth."user" SET "emailVerified"=true WHERE id=$1 AND email=$2', [userId, email]);
  const login = await request('/api/auth/sign-in/email', { email, password });
  pass('Neon Auth autentica e devolve cookies', login.status === 200 && jar.size > 0);
  const restored = await request('/api/auth/get-session', undefined, { cookies: true });
  pass('sessão é restaurada por novo pedido HTTP', restored.data?.user?.id === userId);
  pass('conta verificada da lista acessa o painel', (await request('/api/metrics', undefined, { cookies: true })).status === 200);
  await stop(); await start(process.env.ADMIN_EMAILS);
  pass('conta autenticada fora da lista é recusada', (await request('/api/metrics', undefined, { cookies: true })).status === 401);
  pass('senha incorreta é recusada', (await request('/api/auth/sign-in/email', { email, password: 'senha-incorreta-para-teste' })).status === 401);
  const signout = await request('/api/auth/sign-out', {}, { cookies: true });
  pass('Neon Auth encerra a sessão', signout.status === 200);
  pass('métricas recusam sessão encerrada', (await request('/api/metrics', undefined, { cookies: true })).status === 401);
  pass('acesso alternativo da equipe funciona', (await request('/api/metrics', undefined, { admin: true })).status === 200);
  pass('origem externa é recusada', (await request('/api/interest', body, { headers: { Origin: 'https://externo.example' } })).status === 403);
  console.log(`NEON E2E OK: ${passed} verificações passaram.`);
} finally {
  await stop();
  await db.query('DELETE FROM consertai_interests WHERE device_id=$1', [interestId]).catch(() => {});
  if (leadId) await db.query('DELETE FROM consertai_leads WHERE lead_id=$1', [leadId]).catch(() => {});
  await db.query('DELETE FROM consertai_events WHERE session_id=$1', [session]).catch(() => {});
  if (userId) {
    await db.query('DELETE FROM neon_auth.session WHERE "userId"=$1', [userId]).catch(() => {});
    await db.query('DELETE FROM neon_auth.account WHERE "userId"=$1', [userId]).catch(() => {});
    await db.query('DELETE FROM neon_auth."user" WHERE id=$1 AND email=$2', [userId, email]).catch(() => {});
  }
  await db.end().catch(() => {});
  console.log('Limpeza dos registros sintéticos concluída.');
}
