import { createAuthClient } from '@neondatabase/auth';

const auth = createAuthClient(`${location.origin}/api/auth`);
const form = document.querySelector('#account-form');
const message = document.querySelector('#status');
const submit = document.querySelector('#submit');
const verification = document.querySelector('#verification');
const params = new URLSearchParams(location.search);
const requested = params.get('voltar') || (params.get('perfil') === 'profissional' ? '/meu-perfil' : '/profissionais');
const target = /^\/(profissionais|meu-perfil|minha-conta)(\?[^#]*)?$/.test(requested) ? requested : '/profissionais';
let mode = 'login';
const say = value => { message.textContent = value; };
function setMode(next) {
  mode = next;
  document.querySelector('#name-field').hidden = next !== 'register';
  form.elements.namedItem('name').required = next === 'register';
  form.elements.namedItem('password').autocomplete = next === 'register' ? 'new-password' : 'current-password';
  submit.textContent = next === 'register' ? 'Criar minha conta' : 'Entrar';
  document.querySelector('#toggle').textContent = next === 'register' ? 'Já tenho conta' : 'Criar conta';
  say('');
}
async function finish() {
  const response = await fetch('/api/member/session', { cache: 'no-store' });
  const session = await response.json();
  if (session.authenticated) location.assign(target);
  else say('Verifique seu e-mail para continuar. Se já verificou, entre com sua senha.');
}
document.querySelector('#toggle').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; say('Aguarde…');
  const email = form.elements.namedItem('email').value.trim();
  const password = form.elements.namedItem('password').value;
  try {
    if (mode === 'register') {
      const name = form.elements.namedItem('name').value.trim();
      const result = await auth.signUp.email({ email, password, name });
      if (result.error) throw result.error;
      const sent = await auth.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      if (sent.error) throw sent.error;
      setMode('login'); verification.hidden = false;
      say('Enviamos um código de verificação para seu e-mail.');
    } else {
      const result = await auth.signIn.email({ email, password });
      if (result.error) { if (result.error.code === 'EMAIL_NOT_VERIFIED') verification.hidden = false; throw result.error; }
      await finish();
    }
  } catch (error) { say(error.message || 'Não foi possível entrar. Tente novamente.'); }
  finally { submit.disabled = false; }
});
document.querySelector('#verify').addEventListener('click', async () => {
  try {
    const result = await auth.emailOtp.verifyEmail({ email: form.elements.namedItem('email').value.trim(), otp: document.querySelector('#otp').value.trim() });
    if (result.error) throw result.error;
    verification.hidden = true; setMode('login'); say('E-mail verificado. Agora entre com sua senha.');
  } catch (error) { say(error.message || 'Código inválido.'); }
});
document.querySelector('#resend').addEventListener('click', async () => {
  try {
    const result = await auth.emailOtp.sendVerificationOtp({ email: form.elements.namedItem('email').value.trim(), type: 'email-verification' });
    if (result.error) throw result.error;
    verification.hidden = false; say('Confira o código no seu e-mail.');
  } catch (error) { say(error.message || 'Não foi possível enviar o código.'); }
});
fetch('/api/member/session', { cache: 'no-store' }).then(response => response.json()).then(session => {
  if (session.authenticated) location.replace(target);
  else if (!session.enabled) { say('O login ainda não está configurado.'); submit.disabled = true; }
}).catch(() => say('Não foi possível verificar a conexão. Atualize a página.'));
