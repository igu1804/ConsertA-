(function () {
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.assign('/entrar?voltar=' + encodeURIComponent(location.pathname + location.search));
    throw new Error('Entre na sua conta para continuar.');
  }
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir agora.');
  return data;
}
function status(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('error', error);
  element.classList.toggle('success', Boolean(message) && !error);
}
const money = cents => cents == null ? 'Sob orçamento' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = value => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const phoneLink = phone => `https://wa.me/55${String(phone || '').replace(/\D/g, '')}`;
window.MarketUI = { escapeHtml, api, status, money, date, phoneLink };
if (!['/administrador', '/gestao'].includes(location.pathname)) {
  fetch('/api/team/session', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(session => {
      const nav = document.querySelector('.site-header .header-inner nav');
      if (!session?.authorized || !nav || nav.querySelector('a[href="/administrador"]')) return;
      const link = document.createElement('a');
      link.href = '/administrador';
      link.textContent = 'Painel administrador';
      nav.append(link);
    })
    .catch(() => {});
}
})();
