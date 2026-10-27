const { api, escapeHtml: e, status, date, money } = window.MarketUI;
const output = document.querySelector('#status');
const labels = { pending: 'Aguardando', approved: 'Publicado', rejected: 'Ajustes solicitados', accepted: 'Aceito', declined: 'Recusado', completed: 'Concluído', open: 'Aberto', answered: 'Respondido' };
const empty = message => `<div class="empty"><p>${e(message)}</p></div>`;
const badge = (value, label = labels[value] || value) => `<span class="badge ${e(value)}">${e(label)}</span>`;
const number = value => Number(value || 0).toLocaleString('pt-BR');
const metricDate = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');

function renderServices(profiles, leadServices) {
  const services = new Map();
  for (const group of leadServices || []) {
    const key = normalize(group.service);
    services.set(key, { name: group.service, leads: group.total, interestedClients: group.cliente, interestedProviders: group.profissional, profiles: 0, visible: 0 });
  }
  for (const profile of profiles) for (const service of profile.services || []) {
    const key = normalize(service);
    const item = services.get(key) || { name: service, leads: 0, interestedClients: 0, interestedProviders: 0, profiles: 0, visible: 0 };
    item.profiles++;
    if (profile.status === 'approved' && profile.consent && profile.availability !== 'unavailable') item.visible++;
    services.set(key, item);
  }
  document.querySelector('#services').innerHTML = services.size ? `<table><thead><tr><th>Serviço</th><th>Interesses da landing</th><th>Clientes</th><th>Profissionais interessados</th><th>Perfis cadastrados</th><th>Visíveis na busca</th></tr></thead><tbody>${[...services.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(item => `<tr><td>${e(item.name)}</td><td>${number(item.leads)}</td><td>${number(item.interestedClients)}</td><td>${number(item.interestedProviders)}</td><td>${number(item.profiles)}</td><td>${number(item.visible)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Ainda não há interesses por serviço nem perfis profissionais cadastrados.</p>';
}

function renderDailyChart(days) {
  const host = document.querySelector('#daily-chart'); host.replaceChildren();
  days = days.slice(-14);
  if (!days.length) { host.innerHTML = empty('Ainda não há visitas ou cadastros registrados.'); return; }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 620 225'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Visitas e cadastros por dia');
  const max = Math.max(1, ...days.map(day => Math.max(day.visits, day.leads))), left = 34, right = 610, top = 12, bottom = 183, slot = (right - left) / days.length;
  for (let tick = 0; tick <= 4; tick++) {
    const y = bottom - (bottom - top) * tick / 4, line = document.createElementNS(ns, 'line');
    for (const [key, value] of Object.entries({ x1: left, y1: y, x2: right, y2: y, stroke: '#edf0eb' })) line.setAttribute(key, value);
    svg.append(line);
    const text = document.createElementNS(ns, 'text'); text.setAttribute('x', '0'); text.setAttribute('y', y + 4); text.textContent = number(Math.round(max * tick / 4)); svg.append(text);
  }
  days.forEach((day, index) => {
    const x = left + index * slot + slot * .15, width = Math.min(18, slot * .3);
    for (const [key, color, offset] of [['visits', '#104456', 0], ['leads', '#c98a3c', width + 3]]) {
      const height = day[key] / max * (bottom - top), rect = document.createElementNS(ns, 'rect');
      for (const [attr, value] of Object.entries({ x: x + offset, y: bottom - height, width, height, fill: color, rx: 3 })) rect.setAttribute(attr, value);
      const title = document.createElementNS(ns, 'title'); title.textContent = `${day.date}: ${number(day[key])} ${key === 'visits' ? 'visitas' : 'cadastros'}`; rect.append(title); svg.append(rect);
    }
    if (days.length <= 7 || index % 2 === 0) { const text = document.createElementNS(ns, 'text'); text.setAttribute('x', x); text.setAttribute('y', '207'); text.textContent = day.date.slice(5).split('-').reverse().join('/'); svg.append(text); }
  });
  host.append(svg);
}

function renderMeters(target, entries, total) {
  const container = document.querySelector(target); container.replaceChildren();
  if (!entries.length) { container.innerHTML = empty('Sem dados nesta categoria.'); return; }
  for (const [label, value, base = total] of entries) {
    const row = document.createElement('div'); row.className = 'metric-bar';
    const heading = document.createElement('div'); heading.className = 'row between';
    const name = document.createElement('span'); name.textContent = label;
    const count = document.createElement('strong'); count.textContent = number(value); heading.append(name, count);
    const track = document.createElement('div'); track.className = 'metric-track'; const fill = document.createElement('span'); fill.style.width = `${base ? Math.min(100, value / base * 100) : 0}%`; track.append(fill);
    row.append(heading, track); container.append(row);
  }
}

const buttonLabels = { hero_cliente: 'Topo · preciso de um profissional', hero_profissional: 'Topo · sou profissional', nav_piloto: 'Menu · participar do piloto', vip_plano: 'Menu · conhecer o ConsertAí VIP', servico_eletrica: 'Serviço · elétrica', servico_hidraulica: 'Serviço · hidráulica', servico_montagem: 'Serviço · montagem', servico_reparos: 'Serviço · pequenos reparos', servico_limpeza: 'Serviço · diarista e limpeza', servico_baba: 'Serviço · babá', servico_outros: 'Serviço · outro serviço', piloto_cliente: 'Piloto · perfil cliente', piloto_profissional: 'Piloto · perfil profissional', enviar_cliente: 'Formulário · enviar cliente', enviar_profissional: 'Formulário · enviar profissional', footer_piloto: 'Rodapé · participar do piloto', whatsapp_contato: 'WhatsApp · contato direto', whatsapp_cadastro: 'WhatsApp · após cadastro' };

function renderAnalytics(data) {
  for (const [id, value] of Object.entries({ 'metric-interests': data.interestCount, 'metric-visits': data.visits, 'metric-visitors': data.visitors, 'metric-clicks': data.clicks, 'metric-leads': data.leads })) document.querySelector(`#${id}`).textContent = number(value);
  document.querySelector('#metric-conversion').textContent = `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(data.conversion)}%`;
  document.querySelector('#metrics-updated').textContent = `Métricas atualizadas em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(data.updatedAt))}.`;
  renderDailyChart(data.daily);
  renderMeters('#audience-bars', [['Celular', data.byDevice.mobile, data.visits], ['Computador', data.byDevice.desktop, data.visits], ['Clientes interessados', data.byAudience.cliente, data.leads], ['Profissionais interessados', data.byAudience.profissional, data.leads]], 0);
  document.querySelector('#button-metrics').innerHTML = data.buttons.length ? `<table><thead><tr><th>Botão</th><th>Cliques</th></tr></thead><tbody>${data.buttons.map(item => `<tr><td>${e(buttonLabels[item.id] || item.id)}</td><td>${number(item.clicks)}</td></tr>`).join('')}</tbody></table><p class="tiny">Cliques repetidos contam; clicar em enviar não garante que o cadastro foi concluído.</p>` : empty('Nenhum clique registrado.');
  document.querySelector('#traffic-sources').innerHTML = data.sources.length ? `<table><thead><tr><th>Origem</th><th>Sessões</th></tr></thead><tbody>${data.sources.map(item => `<tr><td>${e(item.source)}</td><td>${number(item.visits)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aguardando visitas com origem identificada.</p>';
  document.querySelector('#form-starts').textContent = `${number(data.formStarts)} início(s) de preenchimento de formulário.`;
  document.querySelector('#recent-leads').innerHTML = data.lastLeads.length ? `<table><thead><tr><th>Nome</th><th>Contato</th><th>Cidade</th><th>Serviço</th><th>Perfil</th><th>Data</th></tr></thead><tbody>${data.lastLeads.map(item => `<tr><td>${e(item.name)}</td><td>${e(item.contact)}</td><td>${e(item.city)}</td><td>${e(item.service)}</td><td>${e(item.audience)}</td><td>${metricDate(item.at)}</td></tr>`).join('')}</tbody></table>` : empty('Nenhum cadastro de interesse salvo ainda.');
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
    const [data, metrics] = await Promise.all([api('/api/marketplace/team/overview'), api('/api/metrics')]);
    document.querySelector('#admin-role').textContent = data.role === 'chief' ? 'Administrador chefe · acesso global' : 'Administrador';
    document.querySelector('#count-accounts').textContent = data.accounts.length.toLocaleString('pt-BR');
    document.querySelector('#count-providers').textContent = data.profiles.length.toLocaleString('pt-BR');
    document.querySelector('#count-requests').textContent = data.requests.length.toLocaleString('pt-BR');
    document.querySelector('#count-tickets').textContent = data.tickets.filter(item => item.status === 'open').length.toLocaleString('pt-BR');
    renderAnalytics(metrics); renderServices(data.profiles, metrics.leadsByService); renderProfiles(data.profiles); renderTickets(data.tickets); renderAccounts(data.accounts, data.role, data.profiles, data.requests); renderRequests(data.requests);
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
