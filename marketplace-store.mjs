import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { databaseConnection } from './storage.mjs';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS consertai_provider_profiles (
    user_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    updated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
  );
  CREATE INDEX IF NOT EXISTS consertai_provider_profiles_status ON consertai_provider_profiles (status, updated_at);
  CREATE TABLE IF NOT EXISTS consertai_service_requests (
    request_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'completed')),
    updated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
  );
  CREATE INDEX IF NOT EXISTS consertai_service_requests_customer ON consertai_service_requests (customer_id, updated_at);
  CREATE INDEX IF NOT EXISTS consertai_service_requests_provider ON consertai_service_requests (provider_id, updated_at);
  CREATE TABLE IF NOT EXISTS consertai_provider_reviews (
    request_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    occurred_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS consertai_provider_reviews_provider ON consertai_provider_reviews (provider_id);
  CREATE TABLE IF NOT EXISTS consertai_support_tickets (
    ticket_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'answered')),
    updated_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
  );
  CREATE INDEX IF NOT EXISTS consertai_support_tickets_user ON consertai_support_tickets (user_id, updated_at);
  CREATE TABLE IF NOT EXISTS consertai_admin_roles (
    user_id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role = 'admin'),
    updated_at TIMESTAMPTZ NOT NULL
  );
`;

const copy = value => value == null ? null : structuredClone(value);
const normal = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const visible = profile => profile?.status === 'approved' && profile.consent === true && profile.availability !== 'unavailable';
const matches = (profile, { service = '', city = '', uf = '' } = {}) => visible(profile) && (!service || profile.services.some(item => normal(item) === normal(service))) && (!city || normal(profile.city) === normal(city)) && (!uf || profile.uf === uf);

async function localStore(dataDir) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'marketplace.json');
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { profiles: {}, requests: {}, reviews: {}, tickets: {}, adminRoles: {} }; }
  state.tickets ||= {};
  state.adminRoles ||= {};
  let queue = Promise.resolve();
  function mutate(action) {
    const pending = queue.then(async () => {
      const previous = structuredClone(state);
      try {
        const result = action();
        const temp = `${file}.${randomUUID()}.tmp`;
        await writeFile(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
        await rename(temp, file);
        return copy(result);
      } catch (error) { state = previous; throw error; }
    });
    queue = pending.catch(() => {});
    return pending;
  }
  async function read(action) { await queue; return copy(action()); }
  return {
    mode: 'local',
    profileByUser: id => read(() => state.profiles[id] || null),
    saveProfile: (id, profile) => mutate(() => (state.profiles[id] = { ...profile, userId: id, status: 'pending', updatedAt: new Date().toISOString() })),
    setProfileStatus: (id, status, expectedUpdatedAt) => mutate(() => {
      const profile = state.profiles[id];
      if (!profile || profile.status !== 'pending' || profile.updatedAt !== expectedUpdatedAt) return null;
      return (state.profiles[id] = { ...profile, status, updatedAt: new Date().toISOString() });
    }),
    setAvailability: (id, availability) => mutate(() => {
      const profile = state.profiles[id];
      if (!profile) return null;
      return (state.profiles[id] = { ...profile, availability, updatedAt: new Date().toISOString() });
    }),
    allProfiles: () => read(() => Object.values(state.profiles).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    publicProfiles: filter => read(() => Object.values(state.profiles).filter(profile => matches(profile, filter)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
    publicProfile: id => read(() => visible(state.profiles[id]) ? state.profiles[id] : null),
    createRequest: record => mutate(() => {
      if (!matches(state.profiles[record.providerId], { service: record.service, city: record.city, uf: record.uf })) return null;
      state.requests[record.id] = record;
      return record;
    }),
    requestsFor: id => read(() => Object.values(state.requests).filter(item => item.customerId === id || item.providerId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    allRequests: () => read(() => Object.values(state.requests).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    transitionRequest: (id, from, to, actorId, role) => mutate(() => {
      const request = state.requests[id];
      if (!request || request.status !== from || (role !== 'team' && request[role === 'provider' ? 'providerId' : 'customerId'] !== actorId)) return null;
      return (state.requests[id] = { ...request, status: to, updatedAt: new Date().toISOString() });
    }),
    addReview: (requestId, customerId, stars) => mutate(() => {
      const request = state.requests[requestId];
      if (!request || request.status !== 'completed' || request.customerId !== customerId || state.reviews[requestId]) return null;
      return (state.reviews[requestId] = { requestId, customerId, providerId: request.providerId, stars, at: new Date().toISOString() });
    }),
    reviewsFor: ids => read(() => Object.values(state.reviews).filter(item => ids.includes(item.providerId))),
    ticketsFor: id => read(() => Object.values(state.tickets).filter(item => item.userId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    allTickets: () => read(() => Object.values(state.tickets).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    createTicket: ticket => mutate(() => (state.tickets[ticket.id] = ticket)),
    answerTicket: (id, expectedUpdatedAt, reply, answeredBy) => mutate(() => {
      const ticket = state.tickets[id];
      if (!ticket || ticket.status !== 'open' || ticket.updatedAt !== expectedUpdatedAt) return null;
      return (state.tickets[id] = { ...ticket, status: 'answered', reply, answeredBy, updatedAt: new Date().toISOString() });
    }),
    adminRole: id => read(() => state.adminRoles[id] || null),
    allAdminRoles: () => read(() => state.adminRoles),
    setAdminRole: (id, role) => mutate(() => {
      if (role === 'admin') state.adminRoles[id] = 'admin';
      else delete state.adminRoles[id];
      return role;
    }),
    listAccounts: () => read(() => []),
    async close() { await queue; }
  };
}

function safeDatabaseError(error) {
  const safe = new Error('Não foi possível acessar os dados do marketplace agora.');
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,20}$/.test(error.code)) safe.code = error.code;
  return safe;
}

async function postgresStore(databaseUrl) {
  const pg = await import('pg');
  const Pool = pg.Pool || pg.default?.Pool;
  const pool = new Pool({ connectionString: databaseConnection(databaseUrl), max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000, query_timeout: 20000, application_name: 'consertai_marketplace' });
  pool.on('error', () => console.error('Conexão ociosa do marketplace interrompida; a próxima consulta tentará reconectar.'));
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(429173542)');
    await client.query(SCHEMA);
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (client) client.release();
    await pool.end().catch(() => {});
    throw safeDatabaseError(error);
  }
  client.release();
  const query = async (sql, params = []) => { try { return await pool.query(sql, params); } catch (error) { throw safeDatabaseError(error); } };
  const profiles = async () => (await query('SELECT payload FROM consertai_provider_profiles ORDER BY updated_at DESC')).rows.map(row => row.payload);
  return {
    mode: 'postgres',
    async profileByUser(id) { return (await query('SELECT payload FROM consertai_provider_profiles WHERE user_id=$1', [id])).rows[0]?.payload || null; },
    async saveProfile(id, profile) {
      const record = { ...profile, userId: id, status: 'pending', updatedAt: new Date().toISOString() };
      await query(`INSERT INTO consertai_provider_profiles (user_id, status, updated_at, payload) VALUES ($1, 'pending', $2, $3::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET status='pending', updated_at=EXCLUDED.updated_at, payload=EXCLUDED.payload`, [id, record.updatedAt, JSON.stringify(record)]);
      return record;
    },
    async setProfileStatus(id, status, expectedUpdatedAt) {
      const updatedAt = new Date().toISOString();
      const result = await query(`UPDATE consertai_provider_profiles SET status=$2, updated_at=now(),
        payload=jsonb_set(jsonb_set(payload, '{status}', to_jsonb($2::text)), '{updatedAt}', to_jsonb($3::text))
        WHERE user_id=$1 AND status='pending' AND payload->>'updatedAt'=$4 RETURNING payload`, [id, status, updatedAt, expectedUpdatedAt]);
      return result.rows[0]?.payload || null;
    },
    async setAvailability(id, availability) {
      const updatedAt = new Date().toISOString();
      const result = await query(`UPDATE consertai_provider_profiles SET updated_at=now(),
        payload=jsonb_set(jsonb_set(payload, '{availability}', to_jsonb($2::text)), '{updatedAt}', to_jsonb($3::text))
        WHERE user_id=$1 RETURNING payload`, [id, availability, updatedAt]);
      return result.rows[0]?.payload || null;
    },
    allProfiles: profiles,
    async publicProfiles(filter) { return (await profiles()).filter(profile => matches(profile, filter)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); },
    async publicProfile(id) { const profile = await this.profileByUser(id); return visible(profile) ? profile : null; },
    async createRequest(record) {
      const result = await query(`INSERT INTO consertai_service_requests (request_id, customer_id, provider_id, status, updated_at, payload)
        SELECT $1, $2, $3, 'pending', $4, $5::jsonb FROM consertai_provider_profiles
        WHERE user_id=$3 AND status='approved' AND payload->>'consent'='true' AND payload->>'availability'<>'unavailable'
        AND lower(payload->>'city')=lower($6) AND payload->>'uf'=$8 AND EXISTS
        (SELECT 1 FROM jsonb_array_elements_text(payload->'services') AS s(value) WHERE lower(s.value)=lower($7))
        RETURNING payload`, [record.id, record.customerId, record.providerId, record.updatedAt, JSON.stringify(record), record.city, record.service, record.uf]);
      return result.rows[0]?.payload || null;
    },
    async requestsFor(id) { return (await query('SELECT payload FROM consertai_service_requests WHERE customer_id=$1 OR provider_id=$1 ORDER BY updated_at DESC LIMIT 200', [id])).rows.map(row => row.payload); },
    async allRequests() { return (await query('SELECT payload FROM consertai_service_requests ORDER BY updated_at DESC')).rows.map(row => row.payload); },
    async transitionRequest(id, from, to, actorId, role) {
      const actor = role === 'provider' ? 'AND provider_id=$4' : role === 'customer' ? 'AND customer_id=$4' : '';
      const updatedAt = new Date().toISOString();
      const timestampParameter = role === 'team' ? 4 : 5;
      const parameters = role === 'team' ? [id, from, to, updatedAt] : [id, from, to, actorId, updatedAt];
      const result = await query(`UPDATE consertai_service_requests SET status=$3, updated_at=now(),
        payload=jsonb_set(jsonb_set(payload, '{status}', to_jsonb($3::text)), '{updatedAt}', to_jsonb($${timestampParameter}::text))
        WHERE request_id=$1 AND status=$2 ${actor} RETURNING payload`, parameters);
      return result.rows[0]?.payload || null;
    },
    async addReview(requestId, customerId, stars) {
      const result = await query(`INSERT INTO consertai_provider_reviews (request_id, provider_id, customer_id, stars, occurred_at)
        SELECT request_id, provider_id, customer_id, $3, now() FROM consertai_service_requests
        WHERE request_id=$1 AND customer_id=$2 AND status='completed'
        ON CONFLICT (request_id) DO NOTHING RETURNING request_id, provider_id, customer_id, stars, occurred_at`, [requestId, customerId, stars]);
      const row = result.rows[0];
      return row ? { requestId: row.request_id, providerId: row.provider_id, customerId: row.customer_id, stars: row.stars, at: row.occurred_at.toISOString() } : null;
    },
    async reviewsFor(ids) {
      if (!ids.length) return [];
      return (await query('SELECT request_id, provider_id, customer_id, stars, occurred_at FROM consertai_provider_reviews WHERE provider_id=ANY($1::text[])', [ids])).rows.map(row => ({ requestId: row.request_id, providerId: row.provider_id, customerId: row.customer_id, stars: row.stars, at: row.occurred_at.toISOString() }));
    },
    async ticketsFor(id) { return (await query('SELECT payload FROM consertai_support_tickets WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100', [id])).rows.map(row => row.payload); },
    async allTickets() { return (await query('SELECT payload FROM consertai_support_tickets ORDER BY updated_at DESC')).rows.map(row => row.payload); },
    async createTicket(ticket) {
      await query('INSERT INTO consertai_support_tickets (ticket_id, user_id, status, updated_at, payload) VALUES ($1, $2, $3, $4, $5::jsonb)', [ticket.id, ticket.userId, ticket.status, ticket.updatedAt, JSON.stringify(ticket)]);
      return ticket;
    },
    async answerTicket(id, expectedUpdatedAt, reply, answeredBy) {
      const updatedAt = new Date().toISOString();
      const result = await query(`UPDATE consertai_support_tickets SET status='answered', updated_at=now(),
        payload=payload || $3::jsonb WHERE ticket_id=$1 AND status='open' AND payload->>'updatedAt'=$2 RETURNING payload`, [id, expectedUpdatedAt, JSON.stringify({ status: 'answered', reply, answeredBy, updatedAt })]);
      return result.rows[0]?.payload || null;
    },
    async adminRole(id) { return (await query('SELECT role FROM consertai_admin_roles WHERE user_id=$1', [id])).rows[0]?.role || null; },
    async allAdminRoles() { return Object.fromEntries((await query('SELECT user_id, role FROM consertai_admin_roles')).rows.map(row => [row.user_id, row.role])); },
    async setAdminRole(id, role) {
      if (role === 'admin') {
        const result = await query(`INSERT INTO consertai_admin_roles (user_id, role, updated_at)
          SELECT id, 'admin', now() FROM neon_auth."user" WHERE id=$1
          ON CONFLICT (user_id) DO UPDATE SET role='admin', updated_at=now() RETURNING role`, [id]);
        return result.rows[0]?.role || null;
      }
      await query('DELETE FROM consertai_admin_roles WHERE user_id=$1', [id]);
      return null;
    },
    async listAccounts() {
      const result = await query(`SELECT id, name, email, "emailVerified" AS verified, "createdAt" AS created_at
        FROM neon_auth."user" ORDER BY "createdAt" DESC`);
      return result.rows.map(row => ({ id: row.id, name: row.name || '', email: row.email, verified: row.verified === true, createdAt: row.created_at?.toISOString?.() || row.created_at }));
    },
    close: () => pool.end()
  };
}

export async function createMarketplaceStore({ dataDir, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl?.trim()) return postgresStore(databaseUrl.trim());
  if (!dataDir) throw new TypeError('Informe dataDir para o marketplace local.');
  return localStore(path.resolve(dataDir));
}
