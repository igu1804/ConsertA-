const { api, escapeHtml: e, status, date, money } = window.MarketUI;
const output = document.querySelector('#status');
const labels = { pending: 'Aguardando', approved: 'Publicado', rejected: 'Ajustes solicitados', accepted: 'Aceito', declined: 'Recusado', completed: 'Concluído', open: 'Aberto', answered: 'Respondido' };
const empty = message => `<div class="empty"><p>${e(message)}</p></div>`;
const badge = (value, label = labels[value] || value) => `<span class="badge ${e(value)}">${e(label)}</span>`;

function renderServices(profiles) {
  const services = new Map();
  for (const profile of profiles) for (const service of profile.services || []) {
    const key = service.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    const item = services.get(key) || { name: service, total: 0, visible: 0 };
    item.total++;
    if (profile.status === 'approved' && profile.consent && profile.availability !== 'unavailable') item.visible++;
    services.set(key, item);
  }
  document.querySelector('#services').innerHTML = services.size ? `<table><thead><tr><th>Serviço</th><th>Perfis cadastrados</th><th>Visíveis na busca</th></tr></thead><tbody>${[...services.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(item => `<tr><td>${e(item.name)}</td><td>${item.total}</td><td>${item.visible}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Ainda não há serviços cadastrados por profissionais.</p>';
}

function renderProfiles(profiles) {
  const pending = profiles.filter(item => item.status === 'pending');
  document.querySelector('#pending').innerHTML = pending.length ? pending.map(item => `<article class="card request"><div class="row between"><h3>${e(item.name)}</h3>${badge('pending', 'Aguardando análise')}</div><p class="meta">${e(item.city)}, ${e(item.uf)} · Atualizado em ${date(item.updatedAt)}</p><p><strong>Serviços:</strong> ${(item.services || []).map(e).join(', ')}</p><p><strong>Experiência:</strong> ${e(item.experienceYears)} ano(s) · <strong>Preço inicial:</strong> ${money(item.priceFromCents)}</p><p>${e(item.bio || 'Sem descrição adicional.')}</p><p><strong>WhatsApp:</strong> ${e(item.whatsapp)} · <strong>Autorização:</strong> ${item.consent ? 'Registrada' : 'Ausente'}</p><p class="tiny">Aprovação libera a exibição pública; não certifica habilidade técnica.</p><div class="actions"><button class="button" data-kind="provider" data-action="approve" data-id="${e(item.userId)}" data-updated="${e(item.updatedAt)}">Aprovar exibição</button><button class="button alt" data-kind="provider" data-action="reject" data-id="${e(item.userId)}" data-updated="${e(item.updatedAt)}">Pedir ajustes</button></div></article>`).join('') : empty('Nenhum perfil aguardando análise.');
  const other = profiles.filter(item => item.status !== 'pending');
  document.querySelector('#all-profiles').innerHTML = other.length ? `<div class="card table-wrap"><table><thead><tr><th>Profissional</th><th>Serviços</th><th>Local</th><th>Situação</th><th>Contato</th></tr></thead><tbody>${other.map(item => `<tr><td>${e(item.name)}</td><td>${(item.services || []).map(e).join(', ')}</td><td>${e(item.city)}, ${e(item.uf)}</td><td>${badge(item.status)}</td><td>${e(item.whatsapp)}</td></tr>`).join('')}</tbody></table></div>` : '';
}

function renderTickets(tickets) {
  document.querySelector('#tickets').innerHTML = tickets.length ? tickets.map(item => `<article class="card request"><div class="row between"><h3>${e(item.subject)}</h3>${badge(item.status)}</div><p class="meta">${date(item.createdAt)} · ${e(item.userName || 'Pessoa cadastrada')} · ${e(item.userEmail)}</p><p>${e(item.message)}</p>${item.reply ? `<p><strong>Resposta:</strong> ${e(item.reply)}</p>` : ''}${item.status === 'open' ? `<form class="ticket-answer" data-id="${e(item.id)}" data-updated="${e(item.updatedAt)}"><label class="field"><span>Responder dúvida</span><textarea name="reply" required minlength="3" maxlength="1000"></textarea></label><button class="button" type="submit">Enviar resposta</button></form>` : ''}</article>`).join('') : empty('Nenhum ticket de dúvida ainda.');
}

function renderAccounts(accounts, role, profiles, requests) {
  const providerIds = new Set(profiles.map(item => item.userId));
  const customerIds = new Set(requests.map(item => item.customerId));
  document.querySelector('#accounts').innerHTML = accounts.length ? `<table><thead><tr><th>Conta</th><th>Atividade</th><th>Cadastro</th><th>Função da equipe</th><th></th></tr></thead><tbody>${accounts.map(item => {
    const activities = [providerIds.has(item.id) ? 'Profissional' : '', customerIds.has(item.id) ? 'Cliente' : ''].filter(Boolean).join(' e ') || 'Sem atividade no piloto';
    const roleName = item.role === 'chief' ? 'Administrador chefe' : item.role === 'admin' ? 'Administrador' : '—';
    const action = role === 'chief' && !item.roleSource ? `<button class="button alt" data-kind="account" data-action="grant-admin" data-id="${e(item.id)}">Tornar admin</button>` : role === 'chief' && item.roleSource === 'assigned' ? `<button class="button alt" data-kind="account" data-action="revoke-admin" data-id="${e(item.id)}">Remover admin</button>` : '';
    return `<tr><td><strong>${e(item.name || 'Sem nome')}</strong><br>${e(item.email)}${item.verified ? '' : '<br><small>E-mail ainda não verificado</small>'}</td><td>${e(activities)}</td><td>${date(item.createdAt)}</td><td>${e(roleName)}</td><td>${action}</td></tr>`;
  }).join('')}</tbody></table>` : '<p class="muted">Nenhuma conta encontrada no banco de autenticação.</p>';
}

function renderRequests(requests) {
  document.querySelector('#requests').innerHTML = requests.length ? requests.map(item => `<article class="card request"><div class="row between"><h3>${e(item.service)}</h3>${badge(item.status, { pending: 'Aguardando resposta', accepted: 'Aceito', declined: 'Recusado', completed: 'Concluído' }[item.status] || item.status)}</div><p class="meta">${date(item.createdAt)} · ${e(item.city)}, ${e(item.uf)}</p><p><strong>Cliente:</strong> ${e(item.customerName)} · ${e(item.customerContact)}</p><p><strong>Profissional:</strong> ${e(item.providerName)}</p><p>${e(item.description)}</p>${item.status === 'accepted' ? `<button class="button" data-kind="request" data-action="complete" data-id="${e(item.id)}">Confirmar conclusão</button>` : ''}</article>`).join('') : empty('Ainda não há pedidos de serviço.');
}

async function load() {
  status(output, 'Atualizando painel…');
  try {
    const data = await api('/api/marketplace/team/overview');
    document.querySelector('#admin-role').textContent = data.role === 'chief' ? 'Administrador chefe · acesso global' : 'Administrador';
    document.querySelector('#count-accounts').textContent = data.accounts.length.toLocaleString('pt-BR');
    document.querySelector('#count-providers').textContent = data.profiles.length.toLocaleString('pt-BR');
    document.querySelector('#count-requests').textContent = data.requests.length.toLocaleString('pt-BR');
    document.querySelector('#count-tickets').textContent = data.tickets.filter(item => item.status === 'open').length.toLocaleString('pt-BR');
    renderServices(data.profiles); renderProfiles(data.profiles); renderTickets(data.tickets); renderAccounts(data.accounts, data.role, data.profiles, data.requests); renderRequests(data.requests);
    status(output, 'Dados atualizados.');
  } catch (error) { status(output, error.message, true); }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-kind]'); if (!button) return;
  button.disabled = true;
  try {
    let path, body = {};
    if (button.dataset.kind === 'provider') { path = `/api/marketplace/team/providers/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}`; body.expectedUpdatedAt = button.dataset.updated; }
    else if (button.dataset.kind === 'request') path = `/api/marketplace/team/requests/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}`;
    else path = `/api/marketplace/team/accounts/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}`;
    await api(path, { method: 'POST', body: JSON.stringify(body) });
    await load();
  } catch (error) { status(output, error.message, true); button.disabled = false; }
});
document.querySelector('#tickets').addEventListener('submit', async event => {
  const form = event.target.closest('.ticket-answer'); if (!form) return;
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  try {
    await api(`/api/marketplace/team/tickets/${encodeURIComponent(form.dataset.id)}/answer`, { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: form.dataset.updated, reply: form.elements.namedItem('reply').value.trim() }) });
    await load();
  } catch (error) { status(output, error.message, true); button.disabled = false; }
});
document.querySelector('#refresh').addEventListener('click', load);
load();
