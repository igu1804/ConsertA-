import { createAuthClient } from '@neondatabase/auth';
const auth = createAuthClient(`${location.origin}/api/auth`);
const form = document.querySelector('form');
const status = document.querySelector('#status');
const submit = document.querySelector('#submit');
const verification = document.querySelector('#verification');
let mode = 'login';
const message = value => { status.textContent = value; };
const destination = () => ['/administrador', '/painel'].includes(new URLSearchParams(location.search).get('voltar'))
  ? new URLSearchParams(location.search).get('voltar')
  : '/administrador';
document.querySelector('#register').addEventListener('click', () => {
  mode = mode === 'login' ? 'register' : 'login';
  document.querySelector('#name-field').hidden = mode !== 'register';
  submit.textContent = mode === 'register' ? 'Criar minha conta' : 'Entrar no painel';
  document.querySelector('#password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  document.querySelector('#register').textContent = mode === 'register' ? 'Já tenho uma conta' : 'Primeiro acesso? Criar conta';
  message('');
});
async function finish() {
  const response = await fetch('/api/team/session', { cache: 'no-store' });
  const session = await response.json();
  if (session.authorized) location.assign(destination());
  else message('Sua conta precisa ter o e-mail verificado e estar autorizada pelo responsável da equipe.');
}
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; message('Aguarde…');
  const email = form.email.value.trim(); const password = form.password.value;
  try {
    if (mode === 'register') {
      const result = await auth.signUp.email({ email, password, name: form.fullname.value.trim() || 'Equipe ConsertAí' });
      if (result.error) throw result.error;
      mode = 'login';
      verification.hidden = false;
      const sent = await auth.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      if (sent.error) throw sent.error;
      message('Enviamos um código para seu e-mail. Digite-o abaixo para verificar sua conta.');
    } else {
      const result = await auth.signIn.email({ email, password });
      if (result.error) {
        if (result.error.code === 'EMAIL_NOT_VERIFIED') verification.hidden = false;
        throw result.error;
      }
      await finish();
    }
  } catch (error) { message(error.message || 'Não foi possível entrar. Confira os dados e tente novamente.'); }
  finally { submit.disabled = false; }
});
document.querySelector('#verify').addEventListener('click', async () => {
  try {
    const result = await auth.emailOtp.verifyEmail({ email: form.email.value.trim(), otp: document.querySelector('#otp').value.trim() });
    if (result.error) throw result.error;
    verification.hidden = true; message('E-mail verificado. Entre com sua senha.');
    submit.textContent = 'Entrar no painel'; document.querySelector('#name-field').hidden = true;
  } catch (error) { message(error.message || 'Código inválido.'); }
});
document.querySelector('#resend').addEventListener('click', async () => {
  try {
    const result = await auth.emailOtp.sendVerificationOtp({ email: form.email.value.trim(), type: 'email-verification' });
    if (result.error) throw result.error;
    verification.hidden = false; message('Confira o código no seu e-mail.');
  } catch (error) { message(error.message || 'Não foi possível enviar o código.'); }
});
document.querySelector('#logout').addEventListener('click', async () => {
  try { const result = await auth.signOut(); if (result.error) throw result.error; message('Você saiu da conta.'); }
  catch { message('Não foi possível sair. Tente novamente.'); }
});
fetch('/api/team/session', { cache: 'no-store' }).then(response => response.json()).then(session => {
  if (session.authorized && !new URLSearchParams(location.search).has('sair')) location.replace(destination());
  else if (!session.enabled) { message('O login da equipe ainda não foi configurado.'); submit.disabled = true; }
}).catch(() => message('Não foi possível verificar a conexão. Atualize a página.'));
