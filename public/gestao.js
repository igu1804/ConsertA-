const { api, escapeHtml: e, status, date, money } = window.MarketUI;
const profiles = document.querySelector('#pending');
const requests = document.querySelector('#requests');
const output = document.querySelector('#status');
async function load() {
  status(output, 'Atualizando…');
  try {
    const data = await api('/api/marketplace/team');
    const waiting = data.profiles.filter(item => item.status === 'pending');
    profiles.innerHTML = waiting.length ? waiting.map(item => `<article class="card request"><div class="row between"><h3>${e(item.name)}</h3><span class="badge pending">Aguardando análise</span></div><p class="meta">${e(item.city)}, ${e(item.uf)} · Atualizado em ${date(item.updatedAt)}</p><p><strong>Serviços:</strong> ${item.services.map(e).join(', ')}</p><p><strong>Experiência:</strong> ${e(item.experienceYears)} ano(s) · <strong>Preço inicial:</strong> ${money(item.priceFromCents)}</p><p>${e(item.bio || 'Sem descrição adicional.')}</p><p><strong>Contato:</strong> ${e(item.whatsapp)} · <strong>Autorização:</strong> ${item.consent ? 'Registrada' : 'Ausente'}</p><p class="tiny">A aprovação libera a exibição das informações públicas. Confira se o perfil é adequado; esta etapa não certifica habilitação técnica.</p><div class="actions"><button class="button" data-kind="provider" data-action="approve" data-id="${e(item.userId)}" data-updated="${e(item.updatedAt)}">Aprovar exibição</button><button class="button alt" data-kind="provider" data-action="reject" data-id="${e(item.userId)}" data-updated="${e(item.updatedAt)}">Pedir ajustes</button></div></article>`).join('') : '<div class="empty"><p>Nenhum perfil aguardando análise.</p></div>';
    requests.innerHTML = data.requests.length ? data.requests.map(item => `<article class="card request"><div class="row between"><h3>${e(item.service)}</h3><span class="badge ${item.status === 'pending' ? 'pending' : item.status === 'declined' ? 'rejected' : ''}">${e({ pending: 'Aguardando resposta', accepted: 'Aceito', declined: 'Recusado', completed: 'Concluído' }[item.status] || item.status)}</span></div><p class="meta">${date(item.createdAt)} · ${e(item.city)}, ${e(item.uf)}</p><p><strong>Cliente:</strong> ${e(item.customerName)} · ${e(item.customerContact)}</p><p><strong>Profissional:</strong> ${e(item.providerName)}</p><p>${e(item.description)}</p>${item.status === 'accepted' ? `<button class="button" data-kind="request" data-action="complete" data-id="${e(item.id)}">Confirmar conclusão</button>` : ''}</article>`).join('') : '<div class="empty"><p>Ainda não há pedidos.</p></div>';
    status(output, `${waiting.length} perfil${waiting.length === 1 ? '' : 'is'} pendente${waiting.length === 1 ? '' : 's'} · ${data.requests.length} pedido${data.requests.length === 1 ? '' : 's'}.`);
  } catch (error) { status(output, error.message, true); }
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-kind]'); if (!button) return;
  button.disabled = true;
  try {
    const path = button.dataset.kind === 'provider' ? `/api/marketplace/team/providers/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}` : `/api/marketplace/team/requests/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}`;
    await api(path, { method: 'POST', body: JSON.stringify(button.dataset.kind === 'provider' ? { expectedUpdatedAt: button.dataset.updated } : {}) });
    await load();
  } catch (error) { status(output, error.message, true); button.disabled = false; }
});
document.querySelector('#refresh').addEventListener('click', load);
load();
