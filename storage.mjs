import { readFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BUCKETS = new Set(['events', 'leads', 'interests']);
const INTEREST_ID = /^(?:qa_)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION = /^[a-zA-Z0-9_-]{8,100}$/;

// Executado automaticamente na inicialização; não contém dados do piloto.
export const STORAGE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS consertai_events (
    event_id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    session_id TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
  );
  CREATE UNIQUE INDEX IF NOT EXISTS consertai_page_view_session_unique
    ON consertai_events (session_id) WHERE event_type = 'page_view';
  CREATE INDEX IF NOT EXISTS consertai_events_type_date
    ON consertai_events (event_type, occurred_at);
  CREATE TABLE IF NOT EXISTS consertai_leads (
    lead_id TEXT PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
  );
  CREATE INDEX IF NOT EXISTS consertai_leads_date
    ON consertai_leads (occurred_at);
  CREATE TABLE IF NOT EXISTS consertai_interests (
    device_id TEXT PRIMARY KEY CHECK (device_id = lower(device_id)),
    is_test BOOLEAN NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
  );
  CREATE INDEX IF NOT EXISTS consertai_interests_real_date
    ON consertai_interests (occurred_at) WHERE is_test = FALSE;
`;

function bucketOf(value) {
  if (!BUCKETS.has(value)) throw new TypeError('Armazenamento desconhecido. Use events, leads ou interests.');
  return value;
}

function recordOf(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('O registro deve ser um objeto.');
  let record;
  try { record = JSON.parse(JSON.stringify(item)); } catch { throw new TypeError('O registro deve conter apenas dados JSON válidos.'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Registro inválido.');
  const at = new Date(record.at || Date.now());
  if (!Number.isFinite(at.getTime())) throw new TypeError('Data do registro inválida.');
  record.at = at.toISOString();
  return record;
}

function interestOf(item) {
  const record = recordOf(item);
  record.deviceId = typeof record.deviceId === 'string' ? record.deviceId.toLowerCase() : '';
  if (!INTEREST_ID.test(record.deviceId)) throw new TypeError('Identificador do navegador inválido.');
  return record;
}

function eventOf(item) {
  const record = recordOf(item);
  if (typeof record.type !== 'string' || !/^[a-z_]{1,60}$/.test(record.type)) throw new TypeError('Tipo de evento inválido.');
  if (record.type === 'page_view' && (typeof record.session !== 'string' || !SESSION.test(record.session))) throw new TypeError('Sessão de visita inválida.');
  return record;
}

function leadOf(item) {
  const record = recordOf(item);
  if (typeof record.id !== 'string' || !record.id || record.id.length > 100) throw new TypeError('Identificador de cadastro inválido.');
  return record;
}

async function readLines(file) {
  try {
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean).flatMap(line => {
      try { const value = JSON.parse(line); return value && typeof value === 'object' && !Array.isArray(value) ? [value] : []; } catch { return []; }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function localStorage(dataDir) {
  if (typeof dataDir !== 'string' || !dataDir) throw new TypeError('Informe dataDir para o armazenamento local.');
  const directory = path.resolve(dataDir);
  await mkdir(directory, { recursive: true });
  const files = Object.fromEntries([...BUCKETS].map(bucket => [bucket, path.join(directory, `${bucket}.ndjson`)]));
  const interests = new Set((await readLines(files.interests)).map(row => String(row.deviceId || '').toLowerCase()).filter(id => INTEREST_ID.test(id)));
  const visits = new Set((await readLines(files.events)).filter(row => row.type === 'page_view').map(row => row.session));
  const leads = new Set((await readLines(files.leads)).filter(row => typeof row.id === 'string').map(row => row.id));
  let count = [...interests].filter(id => !id.startsWith('qa_')).length;
  let queue = Promise.resolve();
  let closed = false;
  function open() { if (closed) throw new Error('O armazenamento já foi encerrado.'); }
  function enqueue(work) {
    open();
    const pending = queue.then(work);
    // Falhas são devolvidas ao chamador e não impedem a próxima tentativa.
    queue = pending.catch(() => {});
    return pending;
  }
  async function write(bucket, record) {
    await appendFile(files[bucket], JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
  }
  function registerInterest(item) {
    const record = interestOf(item);
    return enqueue(async () => {
      if (interests.has(record.deviceId)) return { inserted: false, count };
      await write('interests', record);
      interests.add(record.deviceId);
      if (!record.deviceId.startsWith('qa_')) count++;
      return { inserted: true, count };
    });
  }
  function registerPageView(item) {
    const record = eventOf({ ...item, type: 'page_view' });
    return enqueue(async () => {
      if (visits.has(record.session)) return { inserted: false };
      await write('events', record);
      visits.add(record.session);
      return { inserted: true };
    });
  }
  return {
    mode: 'local',
    async rows(bucket) { open(); bucketOf(bucket); await queue; return readLines(files[bucket]); },
    append(bucket, item) {
      bucketOf(bucket);
      if (bucket === 'interests') return registerInterest(item);
      if (bucket === 'events' && item?.type === 'page_view') return registerPageView(item);
      const record = bucket === 'events' ? eventOf(item) : leadOf(item);
      return enqueue(async () => {
        if (bucket === 'leads' && leads.has(record.id)) return { inserted: false };
        await write(bucket, record);
        if (bucket === 'leads') leads.add(record.id);
        return { inserted: true };
      });
    },
    registerInterest,
    registerPageView,
    async countInterests() { open(); await queue; return count; },
    async flush() { await queue; },
    async close() { closed = true; await queue; }
  };
}

export function databaseConnection(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('DATABASE_URL deve ser uma conexão PostgreSQL válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new TypeError('DATABASE_URL deve usar postgres:// ou postgresql://.');
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  // Bancos externos precisam de TLS com certificado válido. Não desativamos a verificação.
  if (!local) url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

function databaseFailure(error) {
  const safe = new Error('Não foi possível acessar o PostgreSQL. Confira DATABASE_URL e a disponibilidade do banco.');
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(error.code)) safe.code = error.code;
  return safe;
}

async function postgresStorage(databaseUrl) {
  const connectionString = databaseConnection(databaseUrl);
  let Pool;
  try {
    const pg = await import('pg');
    Pool = pg.Pool || pg.default?.Pool;
  } catch { throw new Error('Instale a dependência pg para usar DATABASE_URL: npm install pg@8.23.1'); }
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000, query_timeout: 20000, application_name: 'consertai' });
  pool.on('error', () => console.error('Uma conexão ociosa com PostgreSQL foi interrompida; a próxima operação tentará reconectar.'));
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Serializa a criação do esquema caso duas instâncias iniciem juntas.
    await client.query('SELECT pg_advisory_xact_lock(429173541)');
    await client.query(STORAGE_SCHEMA);
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (client) client.release();
    await pool.end().catch(() => {});
    throw databaseFailure(error);
  }
  client.release();
  let closed = false;
  const pending = new Set();
  function perform(work) {
    if (closed) return Promise.reject(new Error('O armazenamento já foi encerrado.'));
    const operation = Promise.resolve().then(work).catch(error => { throw databaseFailure(error); });
    pending.add(operation);
    operation.then(() => pending.delete(operation), () => pending.delete(operation));
    return operation;
  }
  async function countRealInterests() {
    const result = await pool.query('SELECT count(*)::text AS count FROM consertai_interests WHERE is_test = FALSE');
    const count = Number(result.rows[0].count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Contagem fora do intervalo suportado.');
    return count;
  }
  function registerInterest(item) {
    const record = interestOf(item);
    return perform(async () => {
      const result = await pool.query(
        'INSERT INTO consertai_interests (device_id, is_test, occurred_at, payload) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (device_id) DO NOTHING RETURNING device_id',
        [record.deviceId, record.deviceId.startsWith('qa_'), record.at, JSON.stringify(record)]
      );
      return { inserted: result.rowCount === 1, count: await countRealInterests() };
    });
  }
  function registerPageView(item) {
    const record = eventOf({ ...item, type: 'page_view' });
    return perform(async () => {
      const result = await pool.query(
        "INSERT INTO consertai_events (event_type, session_id, occurred_at, payload) VALUES ('page_view', $1, $2, $3::jsonb) ON CONFLICT (session_id) WHERE event_type = 'page_view' DO NOTHING RETURNING event_id",
        [record.session, record.at, JSON.stringify(record)]
      );
      return { inserted: result.rowCount === 1 };
    });
  }
  return {
    mode: 'postgres',
    rows(bucket) {
      bucketOf(bucket);
      const queries = {
        events: 'SELECT payload FROM consertai_events ORDER BY event_id',
        leads: 'SELECT payload FROM consertai_leads ORDER BY occurred_at, lead_id',
        interests: 'SELECT payload FROM consertai_interests ORDER BY occurred_at, device_id'
      };
      return perform(async () => (await pool.query(queries[bucket])).rows.map(row => row.payload));
    },
    append(bucket, item) {
      bucketOf(bucket);
      if (bucket === 'interests') return registerInterest(item);
      if (bucket === 'events' && item?.type === 'page_view') return registerPageView(item);
      const record = bucket === 'events' ? eventOf(item) : leadOf(item);
      return perform(async () => {
        const result = bucket === 'events'
          ? await pool.query('INSERT INTO consertai_events (event_type, session_id, occurred_at, payload) VALUES ($1, $2, $3, $4::jsonb) RETURNING event_id', [record.type, record.session || null, record.at, JSON.stringify(record)])
          : await pool.query('INSERT INTO consertai_leads (lead_id, occurred_at, payload) VALUES ($1, $2, $3::jsonb) ON CONFLICT (lead_id) DO NOTHING RETURNING lead_id', [record.id, record.at, JSON.stringify(record)]);
        return { inserted: result.rowCount === 1 };
      });
    },
    registerInterest,
    registerPageView,
    countInterests() { return perform(countRealInterests); },
    async flush() { await Promise.all([...pending]); },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled([...pending]);
      await pool.end();
    }
  };
}

/**
 * Sem DATABASE_URL: NDJSON existente, para um processo local.
 * Com DATABASE_URL: PostgreSQL compartilhado, sem migração automática de dados pessoais.
 * Falha de banco é devolvida ao chamador; nunca fazemos fallback silencioso para disco.
 */
export async function createStorage({ dataDir, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl !== undefined && typeof databaseUrl !== 'string') throw new TypeError('DATABASE_URL inválida.');
  return databaseUrl?.trim() ? postgresStorage(databaseUrl.trim()) : localStorage(dataDir);
}
