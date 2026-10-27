const { api, escapeHtml: e, status, money, date, phoneLink } = window.MarketUI;
const form = document.querySelector('#profile-form');
const formStatus = document.querySelector('#form-status');
const inbox = document.querySelector('#inbox');
const field = name => form.elements.namedItem(name);
let userId = '';
const labels = { pending: 'Aguardando análise', approved: 'Publicado', rejected: 'Precisa de ajustes' };

function fill(profile) {
  const badge = document.querySelector('#profile-status');
  badge.textContent = profile ? labels[profile.status] || profile.status : 'Novo perfil';
  badge.className = `badge ${profile?.status || 'pending'}`;
  if (!profile) return;
  for (const name of ['name', 'city', 'uf', 'whatsapp', 'bio', 'availability', 'experienceYears']) field(name).value = profile[name] ?? '';
  field('priceFrom').value = profile.priceFromCents == null ? '' : (profile.priceFromCents / 100).toFixed(2);
  const standard = new Set([...document.querySelectorAll('#service-options input')].map(input => input.value));
  document.querySelectorAll('#service-options input').forEach(input => { input.checked = profile.services.includes(input.value); });
  field('otherServices').value = profile.services.filter(service => !standard.has(service)).join(', ');
  field('consent').checked = profile.consent === true;
  document.querySelector('#quick-availability').value = profile.availability;
}
function renderInbox(requests) {
  const mine = requests.filter(item => item.providerId === userId);
  if (!mine.length) { inbox.innerHTML = '<div class="empty"><h2>Nenhum pedido recebido ainda.</h2><p>Quando alguém solicitar contato, você poderá aceitar ou recusar aqui.</p></div>'; return; }
  inbox.innerHTML = mine.map(item => `<article class="card request"><div class="row between"><h3>${e(item.service)}</h3><span class="badge ${item.status === 'pending' ? 'pending' : ''}">${e({ pending: 'Aguardando sua resposta', accepted: 'Aceito', declined: 'Recusado', completed: 'Concluído' }[item.status] || item.status)}</span></div><p class="meta">${e(item.customerName)} · ${e(item.city)}, ${e(item.uf)} · ${date(item.createdAt)}</p><p>${e(item.description)}</p>${item.customerContact ? `<p><a class="link" href="${phoneLink(item.customerContact)}" target="_blank" rel="noopener noreferrer">Conversar com ${e(item.customerName)} no WhatsApp</a></p>` : '<p class="muted">O contato aparece depois do aceite.</p>'}${item.status === 'pending' ? `<div class="actions"><button class="button" type="button" data-action="accept" data-id="${e(item.id)}">Aceitar pedido</button><button class="button alt" type="button" data-action="decline" data-id="${e(item.id)}">Recusar</button></div>` : ''}</article>`).join('');
}
async function load() {
  try {
    const [session, profile, requests] = await Promise.all([api('/api/member/session'), api('/api/marketplace/my-profile'), api('/api/marketplace/my-requests')]);
    userId = session.user?.id || '';
    fill(profile.profile); renderInbox(requests.requests);
  } catch (error) { status(formStatus, error.message, true); }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  const standard = [...document.querySelectorAll('#service-options input:checked')].map(input => input.value);
  const extra = field('otherServices').value.split(',').map(value => value.trim()).filter(Boolean);
  const price = field('priceFrom').value.trim();
  const body = { name: field('name').value.trim(), city: field('city').value.trim(), uf: field('uf').value.trim(), whatsapp: field('whatsapp').value.trim(), services: [...standard, ...extra], experienceYears: Number(field('experienceYears').value), priceFromCents: price ? Math.round(Number(price) * 100) : null, availability: field('availability').value, bio: field('bio').value.trim(), consent: field('consent').checked };
  try {
    const result = await api('/api/marketplace/my-profile', { method: 'POST', body: JSON.stringify(body) });
    fill(result.profile);
    status(formStatus, 'Perfil enviado para análise. A equipe precisa aprovar antes de aparecer nas buscas.');
  } catch (error) { status(formStatus, error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector('#save-availability').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    const result = await api('/api/marketplace/my-profile/availability', { method: 'POST', body: JSON.stringify({ availability: document.querySelector('#quick-availability').value }) });
    field('availability').value = result.profile.availability;
    status(document.querySelector('#availability-status'), 'Disponibilidade atualizada.');
  } catch (error) { status(document.querySelector('#availability-status'), error.message, true); }
  finally { button.disabled = false; }
});
inbox.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  button.disabled = true;
  try {
    await api(`/api/marketplace/requests/${encodeURIComponent(button.dataset.id)}/${button.dataset.action}`, { method: 'POST', body: '{}' });
    const data = await api('/api/marketplace/my-requests'); renderInbox(data.requests);
  } catch (error) { alert(error.message); button.disabled = false; }
});
load();
