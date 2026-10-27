import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMarketplaceStore } from '../marketplace-store.mjs';

test('perfil, pedido e avaliação exigem as etapas corretas', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'consertai-marketplace-'));
  const store = await createMarketplaceStore({ dataDir: dir, databaseUrl: '' });
  const providerId = randomUUID();
  const customerId = randomUUID();
  const otherId = randomUUID();
  const request = { id: randomUUID(), customerId, providerId, providerName: 'Maria', customerName: 'João', customerContact: '55999999999', service: 'Elétrica', city: 'Santa Maria', uf: 'RS', description: 'Instalar uma luminária', status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  try {
    const profile = await store.saveProfile(providerId, { name: 'Maria', city: 'Santa Maria', uf: 'RS', whatsapp: '55988888888', services: ['Elétrica', 'Hidráulica'], availability: 'available', consent: true });
    assert.equal((await store.publicProfiles({ service: 'Elétrica', city: 'Santa Maria', uf: 'RS' })).length, 0);
    assert.equal(await store.setProfileStatus(providerId, 'approved', 'versão-antiga'), null);
    assert.equal(await store.createRequest(request), null);
    assert.equal((await store.setProfileStatus(providerId, 'approved', profile.updatedAt)).status, 'approved');
    assert.equal((await store.publicProfiles({ service: 'Hidráulica', city: 'Santa Maria', uf: 'RS' })).length, 1);
    assert.equal((await store.publicProfiles({ service: 'Elétrica', city: 'Porto Alegre', uf: 'RS' })).length, 0);
    assert.equal((await store.createRequest(request)).id, request.id);
    assert.equal(await store.transitionRequest(request.id, 'pending', 'accepted', otherId, 'provider'), null);
    assert.equal(await store.addReview(request.id, customerId, 5), null);
    assert.equal((await store.transitionRequest(request.id, 'pending', 'accepted', providerId, 'provider')).status, 'accepted');
    assert.equal((await store.transitionRequest(request.id, 'accepted', 'completed', '', 'team')).status, 'completed');
    assert.equal(await store.addReview(request.id, otherId, 5), null);
    assert.equal((await store.addReview(request.id, customerId, 5)).stars, 5);
    assert.equal(await store.addReview(request.id, customerId, 1), null);
    await store.setAvailability(providerId, 'unavailable');
    assert.equal(await store.publicProfile(providerId), null);
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});

test('tickets são privados e administradores podem ser atribuídos', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'consertai-support-'));
  const store = await createMarketplaceStore({ dataDir: dir, databaseUrl: '' });
  const userId = randomUUID();
  const otherId = randomUUID();
  const now = new Date().toISOString();
  const ticket = { id: randomUUID(), userId, userName: 'Pessoa', userEmail: 'pessoa@example.com', subject: 'Dúvida sobre pedido', message: 'Como acompanhar meu pedido?', status: 'open', reply: '', createdAt: now, updatedAt: now };
  try {
    await store.createTicket(ticket);
    assert.equal((await store.ticketsFor(userId)).length, 1);
    assert.equal((await store.ticketsFor(otherId)).length, 0);
    assert.equal((await store.allTickets()).length, 1);
    assert.equal(await store.answerTicket(ticket.id, 'versão-antiga', 'Veja Minha conta', 'equipe'), null);
    const answered = await store.answerTicket(ticket.id, now, 'Veja Minha conta', 'equipe');
    assert.equal(answered.status, 'answered');
    assert.equal(await store.answerTicket(ticket.id, now, 'Outra resposta', 'equipe'), null);
    assert.equal(await store.adminRole(userId), null);
    assert.equal(await store.setAdminRole(userId, 'admin'), 'admin');
    assert.equal(await store.adminRole(userId), 'admin');
    assert.equal((await store.allAdminRoles())[userId], 'admin');
    assert.equal(await store.setAdminRole(userId, null), null);
    assert.equal(await store.adminRole(userId), null);
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});
