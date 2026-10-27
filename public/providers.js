const { api, escapeHtml: e, status, money } = window.MarketUI;
const filters = document.querySelector('#filters');
const results = document.querySelector('#providers');
const empty = document.querySelector('#empty');
const count = document.querySelector('#result-count');
const dialog = document.querySelector('#request-dialog');
const requestForm = document.querySelector('#request-form');
let providers = [];
const input = name => filters.elements.namedItem(name);
const requestInput = name => requestForm.elements.namedItem(name);
const query = new URLSearchParams(location.search);
if (query.get('servico')) input('servico').value = query.get('servico');
if (query.get('cidade')) input('cidade').value = query.get('cidade');
if (query.get('uf')) input('uf').value = query.get('uf');

function card(provider) {
  const rating = provider.rating.count ? `★ ${provider.rating.average.toLocaleString('pt-BR')} · ${provider.rating.count} avaliação${provider.rating.count === 1 ? '' : 'ões'}` : 'Ainda sem avaliações';
  const available = provider.availability === 'limited' ? 'Agenda limitada' : 'Disponível para pedidos';
  const initials = provider.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return `<article class="card provider-card"><div class="provider-name"><span class="avatar" aria-hidden="true">${e(initials)}</span><div><h2>${e(provider.name)}</h2><p class="meta">${e(provider.city)}, ${e(provider.uf)}</p></div></div><p><span class="badge ${provider.availability === 'limited' ? 'limited' : ''}">${available}</span></p><div class="service-tags">${provider.services.map(service => `<span>${e(service)}</span>`).join('')}</div><p>${e(provider.bio || 'Perfil profissional cadastrado para o piloto.')}</p><p class="meta">${provider.experienceYears ? `${provider.experienceYears} ano${provider.experienceYears === 1 ? '' : 's'} de experiência · ` : ''}${provider.priceFromCents == null ? 'Preço sob orçamento' : `A partir de ${money(provider.priceFromCents)}`}</p><p class="rating">${rating}</p><div class="actions"><button class="button" type="button" data-provider="${e(provider.userId)}">Pedir contato</button></div></article>`;
}
async function search() {
  status(count, 'Buscando profissionais…');
  const params = new URLSearchParams({ servico: input('servico').value.trim(), cidade: input('cidade').value.trim(), uf: input('uf').value.trim().toUpperCase() });
  try {
    const data = await api('/api/marketplace/providers?' + params);
    providers = data.providers;
    results.innerHTML = providers.map(card).join('');
    empty.hidden = providers.length > 0;
    status(count, `${providers.length} profissional${providers.length === 1 ? '' : 'is'} encontrado${providers.length === 1 ? '' : 's'} para ${data.city}, ${data.uf}.`);
    history.replaceState(null, '', '/profissionais?' + params);
  } catch (error) { results.replaceChildren(); empty.hidden = true; status(count, error.message, true); }
}
filters.addEventListener('submit', event => { event.preventDefault(); search(); });
results.addEventListener('click', event => {
  const button = event.target.closest('[data-provider]');
  if (!button) return;
  const provider = providers.find(item => item.userId === button.dataset.provider);
  if (!provider) return;
  requestForm.reset();
  requestInput('providerId').value = provider.userId;
  requestInput('service').replaceChildren(...provider.services.map(service => new Option(service, service)));
  const selected = provider.services.find(service => service.toLocaleLowerCase('pt-BR') === input('servico').value.trim().toLocaleLowerCase('pt-BR'));
  if (selected) requestInput('service').value = selected;
  document.querySelector('#request-title').textContent = `Pedir contato a ${provider.name}`;
  status(document.querySelector('#request-status'), '');
  dialog.showModal();
});
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = requestForm.querySelector('button[type="submit"]'); button.disabled = true;
  const body = { providerId: requestInput('providerId').value, service: requestInput('service').value, customerName: requestInput('customerName').value.trim(), customerContact: requestInput('customerContact').value.trim(), description: requestInput('description').value.trim(), consent: requestInput('consent').checked };
  try {
    await api('/api/marketplace/requests', { method: 'POST', body: JSON.stringify(body) });
    status(document.querySelector('#request-status'), 'Pedido enviado. Acompanhe a resposta em Minha conta.');
    requestForm.querySelectorAll('input:not([type="hidden"]),textarea').forEach(field => { if (field.type === 'checkbox') field.checked = false; else field.value = ''; });
  } catch (error) { status(document.querySelector('#request-status'), error.message, true); }
  finally { button.disabled = false; }
});
search();
