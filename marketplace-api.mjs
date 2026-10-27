import { randomUUID } from 'node:crypto';
import { authEnabled, memberSession, chiefSession, configuredRole } from './auth.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const availabilityValues = new Set(['available', 'limited', 'unavailable']);
const normalize = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ratingOf = reviews => ({ count: reviews.length, average: reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.stars, 0) / reviews.length * 10) / 10 : null });

export function createMarketplaceApi({ store, allowAdmin, bodyOf, fail, json, limit, sameOrigin, text }) {
  async function member(req, res) {
    if (!authEnabled) throw fail(503, 'O login ainda não está configurado.');
    const user = await memberSession(req, res);
    if (!user) throw fail(401, 'Entre e verifique seu e-mail para continuar.');
    return user;
  }
  function write(req) {
    if (!sameOrigin(req)) throw fail(403, 'Origem não autorizada.');
    limit(req, 'marketplace');
  }
  function profileInput(body) {
    if (body.consent !== true) throw fail(400, 'Autorize a publicação do perfil e o compartilhamento do contato após aceitar um pedido.');
    const name = text(body.name, 100, true);
    const city = text(body.city, 100, true);
    const uf = text(body.uf, 2, true).toUpperCase();
    if (name.length < 2 || city.length < 2 || !/^[A-Z]{2}$/.test(uf)) throw fail(400, 'Confira o nome e a cidade/UF.');
    const rawPhone = text(body.whatsapp, 30, true).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (!/^\d{10,11}$/.test(rawPhone)) throw fail(400, 'Informe um WhatsApp válido com DDD.');
    if (!Array.isArray(body.services) || body.services.length < 1 || body.services.length > 8) throw fail(400, 'Selecione de 1 a 8 serviços.');
    const services = body.services.map(value => text(value, 70, true));
    if (services.some(value => value.length < 2) || new Set(services.map(normalize)).size !== services.length) throw fail(400, 'Revise os serviços informados.');
    const availability = text(body.availability, 20, true);
    if (!availabilityValues.has(availability)) throw fail(400, 'Disponibilidade inválida.');
    const experienceYears = Number(body.experienceYears ?? 0);
    if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 60) throw fail(400, 'Informe os anos de experiência corretamente.');
    const priceFromCents = body.priceFromCents === '' || body.priceFromCents == null ? null : Number(body.priceFromCents);
    if (priceFromCents !== null && (!Number.isInteger(priceFromCents) || priceFromCents < 0 || priceFromCents > 10000000)) throw fail(400, 'Valor inicial inválido.');
    return { name, city, uf, whatsapp: rawPhone, services, bio: text(body.bio, 600), availability, experienceYears, priceFromCents, consent: true, consentVersion: 'perfil-publico-v1' };
  }
  async function publicProfile(profile) {
    const reviews = await store.reviewsFor([profile.userId]);
    const { whatsapp, consent, consentVersion, ...safe } = profile;
    return { ...safe, rating: ratingOf(reviews) };
  }
  async function publicProfiles(profiles) {
    const reviews = await store.reviewsFor(profiles.map(profile => profile.userId));
    return profiles.map(profile => {
      const { whatsapp, consent, consentVersion, ...safe } = profile;
      return { ...safe, rating: ratingOf(reviews.filter(item => item.providerId === profile.userId)) };
    });
  }
  async function requestView(request, userId, reviews, admin = false) {
    const { customerContact, ...safe } = request;
    const accepted = ['accepted', 'completed'].includes(request.status);
    const view = { ...safe, reviewed: reviews.some(item => item.requestId === request.id) };
    if (admin || (accepted && request.providerId === userId)) view.customerContact = customerContact;
    if (admin || (accepted && request.customerId === userId)) {
      const profile = await store.profileByUser(request.providerId);
      view.providerContact = profile?.whatsapp || null;
    }
    return view;
  }
  return async function handleMarketplace(req, res, url) {
    const route = url.pathname;
    if (route === '/api/member/session') {
      if (req.method !== 'GET') throw fail(405, 'Método não permitido.');
      const user = authEnabled ? await memberSession(req, res) : null;
      json(res, 200, { enabled: authEnabled, authenticated: Boolean(user), user: user ? { id: user.id, name: user.name || '', email: user.email } : null });
      return true;
    }
    if (!route.startsWith('/api/marketplace/')) return false;
    const part = route.slice('/api/marketplace/'.length).split('/');
    const post = req.method === 'POST';
    if (post) write(req);
    else if (req.method !== 'GET') throw fail(405, 'Método não permitido.');

    if (part[0] === 'team') {
      if (!await allowAdmin(req, res)) return true;
      if (part.length === 1 && !post) {
        const [profiles, requests] = await Promise.all([store.allProfiles(), store.allRequests()]);
        json(res, 200, { profiles, requests }); return true;
      }
      if (part[1] === 'overview' && part.length === 2 && !post) {
        const [profiles, requests, tickets, accounts, assignedRoles, currentUser] = await Promise.all([
          store.allProfiles(), store.allRequests(), store.allTickets(), store.listAccounts(), store.allAdminRoles(), authEnabled ? memberSession(req, res) : null
        ]);
        const role = currentUser && configuredRole(currentUser.email) === 'chief' ? 'chief' : 'admin';
        const users = accounts.map(account => ({ ...account, role: configuredRole(account.email) || assignedRoles[account.id] || null, roleSource: configuredRole(account.email) ? 'configured' : assignedRoles[account.id] ? 'assigned' : null }));
        json(res, 200, { role, profiles, requests, tickets, accounts: users }); return true;
      }
      if (part[1] === 'tickets' && part.length === 4 && post && uuid.test(part[2]) && part[3] === 'answer') {
        const body = await bodyOf(req);
        const reply = text(body.reply, 1000, true);
        if (reply.length < 3) throw fail(400, 'Escreva uma resposta para o ticket.');
        const admin = authEnabled ? await memberSession(req, res) : null;
        const changed = await store.answerTicket(part[2], text(body.expectedUpdatedAt, 40, true), reply, admin?.email || 'equipe');
        if (!changed) throw fail(409, 'O ticket foi alterado ou já respondido. Atualize a página.');
        json(res, 200, { ok: true, ticket: changed }); return true;
      }
      if (part[1] === 'accounts' && part.length === 4 && post && uuid.test(part[2]) && ['grant-admin', 'revoke-admin'].includes(part[3])) {
        const chief = await chiefSession(req, res);
        if (!chief) throw fail(403, 'Somente o administrador chefe pode alterar administradores.');
        const target = (await store.listAccounts()).find(account => account.id === part[2]);
        if (!target) throw fail(404, 'Conta não encontrada.');
        if (part[3] === 'grant-admin' && !target.verified) throw fail(409, 'Verifique o e-mail desta conta antes de conceder acesso administrativo.');
        if (configuredRole(target.email)) throw fail(409, 'Esta conta tem função definida na configuração do serviço.');
        const role = await store.setAdminRole(target.id, part[3] === 'grant-admin' ? 'admin' : null);
        json(res, 200, { ok: true, userId: target.id, role }); return true;
      }
      if (part[1] === 'providers' && part.length === 4 && post && uuid.test(part[2]) && ['approve', 'reject'].includes(part[3])) {
        const body = await bodyOf(req);
        const current = await store.profileByUser(part[2]);
        if (!current || current.status !== 'pending') throw fail(409, 'Perfil não está pendente de análise.');
        if (body.expectedUpdatedAt !== current.updatedAt) throw fail(409, 'O perfil foi alterado. Atualize a página antes de decidir.');
        if (part[3] === 'approve' && current.consent !== true) throw fail(409, 'O profissional precisa autorizar a publicação.');
        const changed = await store.setProfileStatus(part[2], part[3] === 'approve' ? 'approved' : 'rejected', current.updatedAt);
        if (!changed) throw fail(409, 'O perfil foi alterado. Atualize a página.');
        json(res, 200, { ok: true, profile: changed }); return true;
      }
      if (part[1] === 'requests' && part.length === 4 && post && uuid.test(part[2]) && part[3] === 'complete') {
        const changed = await store.transitionRequest(part[2], 'accepted', 'completed', '', 'team');
        if (!changed) throw fail(409, 'O pedido precisa estar aceito antes de confirmar a conclusão.');
        json(res, 200, { ok: true, request: changed }); return true;
      }
      throw fail(404, 'Recurso não encontrado.');
    }

    const user = await member(req, res);
    if (part[0] === 'providers' && part.length === 1 && !post) {
      const service = text(url.searchParams.get('servico') || '', 70);
      const city = text(url.searchParams.get('cidade') || 'Santa Maria', 100);
      const uf = text(url.searchParams.get('uf') || 'RS', 2).toUpperCase();
      if (!/^[A-Z]{2}$/.test(uf)) throw fail(400, 'UF inválida.');
      const profiles = await store.publicProfiles({ service, city, uf });
      json(res, 200, { city, uf, service, providers: await publicProfiles(profiles.slice(0, 100)) }); return true;
    }
    if (part[0] === 'providers' && part.length === 2 && !post && uuid.test(part[1])) {
      const profile = await store.publicProfile(part[1]);
      if (!profile) throw fail(404, 'Profissional não disponível neste momento.');
      json(res, 200, { provider: await publicProfile(profile) }); return true;
    }
    if (part[0] === 'my-profile' && part.length === 1) {
      if (!post) { json(res, 200, { profile: await store.profileByUser(user.id) }); return true; }
      const profile = await store.saveProfile(user.id, profileInput(await bodyOf(req)));
      json(res, 200, { ok: true, profile }); return true;
    }
    if (part[0] === 'my-profile' && part[1] === 'availability' && part.length === 2 && post) {
      const body = await bodyOf(req);
      const availability = text(body.availability, 20, true);
      if (!availabilityValues.has(availability)) throw fail(400, 'Disponibilidade inválida.');
      const profile = await store.setAvailability(user.id, availability);
      if (!profile) throw fail(404, 'Crie seu perfil profissional primeiro.');
      json(res, 200, { ok: true, profile }); return true;
    }
    if (part[0] === 'my-requests' && part.length === 1 && !post) {
      const requests = await store.requestsFor(user.id);
      const reviews = await store.reviewsFor([...new Set(requests.map(item => item.providerId))]);
      json(res, 200, { requests: await Promise.all(requests.map(item => requestView(item, user.id, reviews))) }); return true;
    }
    if (part[0] === 'my-tickets' && part.length === 1 && !post) {
      json(res, 200, { tickets: await store.ticketsFor(user.id) }); return true;
    }
    if (part[0] === 'tickets' && part.length === 1 && post) {
      const body = await bodyOf(req);
      const subject = text(body.subject, 120, true);
      const message = text(body.message, 1500, true);
      if (subject.length < 3 || message.length < 10) throw fail(400, 'Descreva sua dúvida com mais detalhes.');
      const now = new Date().toISOString();
      const ticket = { id: randomUUID(), userId: user.id, userName: user.name || '', userEmail: user.email, subject, message, status: 'open', reply: '', createdAt: now, updatedAt: now };
      await store.createTicket(ticket);
      json(res, 201, { ok: true, ticket }); return true;
    }
    if (part[0] === 'requests' && part.length === 1 && post) {
      const body = await bodyOf(req);
      if (body.consent !== true) throw fail(400, 'Autorize o compartilhamento do contato se o profissional aceitar.');
      const providerId = text(body.providerId, 100, true);
      if (!uuid.test(providerId) || providerId === user.id) throw fail(400, 'Selecione outro profissional.');
      const profile = await store.publicProfile(providerId);
      if (!profile) throw fail(404, 'Profissional não disponível neste momento.');
      const requestedService = text(body.service, 70, true);
      const service = profile.services.find(item => normalize(item) === normalize(requestedService));
      if (!service) throw fail(400, 'Escolha um serviço oferecido pelo profissional.');
      const customerName = text(body.customerName, 100, true);
      const customerContact = text(body.customerContact, 30, true).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
      if (customerName.length < 2 || !/^\d{10,11}$/.test(customerContact)) throw fail(400, 'Informe nome e WhatsApp com DDD.');
      const now = new Date().toISOString();
      const request = { id: randomUUID(), customerId: user.id, providerId, providerName: profile.name, customerName, customerContact, service, city: profile.city, uf: profile.uf, description: text(body.description, 1000, true), status: 'pending', createdAt: now, updatedAt: now, consent: true, consentVersion: 'pedido-contato-v1' };
      const created = await store.createRequest(request);
      if (!created) throw fail(409, 'A disponibilidade mudou. Atualize a busca.');
      json(res, 201, { ok: true, request: await requestView(created, user.id, []) }); return true;
    }
    if (part[0] === 'requests' && part.length === 3 && post && uuid.test(part[1]) && ['accept', 'decline'].includes(part[2])) {
      const changed = await store.transitionRequest(part[1], 'pending', part[2] === 'accept' ? 'accepted' : 'declined', user.id, 'provider');
      if (!changed) throw fail(409, 'Pedido indisponível ou já respondido.');
      json(res, 200, { ok: true, request: await requestView(changed, user.id, []) }); return true;
    }
    if (part[0] === 'requests' && part.length === 3 && post && uuid.test(part[1]) && part[2] === 'review') {
      const body = await bodyOf(req);
      const stars = Number(body.stars);
      if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw fail(400, 'Escolha de 1 a 5 estrelas.');
      const review = await store.addReview(part[1], user.id, stars);
      if (!review) throw fail(409, 'A avaliação só pode ser feita uma vez, após a equipe confirmar o atendimento.');
      json(res, 201, { ok: true, review: { stars: review.stars, at: review.at } }); return true;
    }
    throw fail(404, 'Recurso não encontrado.');
  };
}
