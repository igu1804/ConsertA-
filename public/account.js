const { api, escapeHtml: e, status, date, phoneLink } = window.MarketUI;
const list = document.querySelector('#my-requests');
const accountStatus = document.querySelector('#account-status');
const ticketForm = document.querySelector('#ticket-form');
let userId = '';
function render(requests) {
  const mine = requests.filter(item => item.customerId === userId);
  if (!mine.length) { list.innerHTML = '<div class="empty"><h2>Você ainda não enviou pedidos.</h2><p>Encontre um profissional por serviço e conte o que precisa.</p><a class="button" href="/profissionais">Encontrar profissionais</a></div>'; return; }
  const statusLabel = { pending: 'Aguardando resposta', accepted: 'Aceito', declined: 'Recusado', completed: 'Concluído' };
  list.innerHTML = mine.map(item => `<article class="card request"><div class="row between"><h3>${e(item.service)} com ${e(item.providerName)}</h3><span class="badge ${item.status === 'pending' ? 'pending' : item.status === 'declined' ? 'rejected' : ''}">${e(statusLabel[item.status] || item.status)}</span></div><p class="meta">${e(item.city)}, ${e(item.uf)} · ${date(item.createdAt)}</p><p>${e(item.description)}</p>${item.providerContact ? `<p><a class="link" href="${phoneLink(item.providerContact)}" target="_blank" rel="noopener noreferrer">Conversar com ${e(item.providerName)} no WhatsApp</a></p>` : '<p class="muted">O contato aparece quando o profissional aceitar.</p>'}${item.status === 'completed' && !item.reviewed ? `<form class="review-form" data-id="${e(item.id)}"><label class="field"><span>Como foi o atendimento?</span><select name="stars" required><option value="">Escolha sua nota</option><option value="5">5 estrelas</option><option value="4">4 estrelas</option><option value="3">3 estrelas</option><option value="2">2 estrelas</option><option value="1">1 estrela</option></select></label><button class="button" type="submit">Enviar avaliação</button></form>` : item.reviewed ? '<p class="rating">Sua avaliação foi registrada. Obrigado!</p>' : ''}</article>`).join('');
}
function renderTickets(tickets) {
  const target = document.querySelector('#my-tickets');
  target.innerHTML = tickets.length ? tickets.map(item => `<article class="card request"><div class="row between"><h3>${e(item.subject)}</h3><span class="badge ${item.status === 'open' ? 'pending' : ''}">${item.status === 'answered' ? 'Respondido' : 'Aguardando resposta'}</span></div><p class="meta">Enviado em ${date(item.createdAt)}</p><p>${e(item.message)}</p>${item.reply ? `<p><strong>Resposta da equipe:</strong> ${e(item.reply)}</p>` : ''}</article>`).join('') : '<p class="muted">Você ainda não enviou dúvidas.</p>';
}
async function load() {
  try {
    const [session, data, tickets] = await Promise.all([api('/api/member/session'), api('/api/marketplace/my-requests'), api('/api/marketplace/my-tickets')]);
    userId = session.user?.id || '';
    document.querySelector('#welcome').textContent = session.user?.name ? `Olá, ${session.user.name}.` : 'Acompanhe seus pedidos.';
    render(data.requests); renderTickets(tickets.tickets);
  } catch (error) { status(accountStatus, error.message, true); }
}
list.addEventListener('submit', async event => {
  const form = event.target.closest('.review-form'); if (!form) return;
  event.preventDefault(); const button = form.querySelector('button'); button.disabled = true;
  try {
    await api(`/api/marketplace/requests/${encodeURIComponent(form.dataset.id)}/review`, { method: 'POST', body: JSON.stringify({ stars: Number(form.elements.namedItem('stars').value) }) });
    status(accountStatus, 'Avaliação registrada.');
    const data = await api('/api/marketplace/my-requests'); render(data.requests);
  } catch (error) { status(accountStatus, error.message, true); button.disabled = false; }
});
ticketForm.addEventListener('submit', async event => {
  event.preventDefault(); const button = ticketForm.querySelector('button[type="submit"]'); button.disabled = true;
  const ticketStatus = document.querySelector('#ticket-status');
  try {
    await api('/api/marketplace/tickets', { method: 'POST', body: JSON.stringify({ subject: ticketForm.elements.namedItem('subject').value.trim(), message: ticketForm.elements.namedItem('message').value.trim() }) });
    ticketForm.reset();
    status(ticketStatus, 'Dúvida enviada. A resposta aparecerá aqui.');
    const data = await api('/api/marketplace/my-tickets'); renderTickets(data.tickets);
  } catch (error) { status(ticketStatus, error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector('#logout').addEventListener('click', async event => {
  event.currentTarget.disabled = true;
  try {
    const response = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Não foi possível sair.');
    location.assign('/entrar?sair=1');
  } catch (error) { status(accountStatus, error.message, true); event.currentTarget.disabled = false; }
});
load();
