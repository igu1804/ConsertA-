(() => {
 'use strict';
 if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {}), { once: true });
 const $ = s => document.querySelector(s);
 const form = $('#lead-form'), status = $('#form-status');
 const state = { audience: 'cliente', started: false };
 let session;
 try { session = sessionStorage.getItem('consertai_session'); if (!session) { session = crypto.randomUUID(); sessionStorage.setItem('consertai_session', session); } } catch { session = 's_' + Date.now() + Math.random().toString(36).slice(2); }
 const device = matchMedia('(max-width: 620px)').matches ? 'mobile' : 'desktop';
 const params = new URLSearchParams(location.search);
 if (params.get('teste') === '1') session = 'qa_' + crypto.randomUUID();
 const source = (params.get('utm_source') || 'direto').replace(/[^a-zA-Z0-9_\-]/g,'').slice(0,50);
 const track = (type, id) => { const body = JSON.stringify({type,id,session,device,source,audience:state.audience}); try { if (navigator.sendBeacon) navigator.sendBeacon('/api/event',new Blob([body],{type:'application/json'})); else fetch('/api/event',{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{}); } catch {} };
 track('page_view');
 let deviceId;
 try { deviceId=localStorage.getItem('consertai_device_id'); if(!/^[a-f0-9-]{36}$/i.test(deviceId||'')){deviceId=crypto.randomUUID();localStorage.setItem('consertai_device_id',deviceId);} } catch {deviceId=crypto.randomUUID();}
 if(params.get('teste')==='1') deviceId='qa_'+crypto.randomUUID();
 let interestSent=false, interestPending=false;
 async function registerInterest(button){
  if(interestSent||interestPending)return;
  interestPending=true;
  try{const response=await fetch('/api/interest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId,button,source,audience:state.audience}),keepalive:true});const result=await response.json();if(response.ok&&result.ok)interestSent=true;}catch{}finally{interestPending=false;}
 }
 document.addEventListener('click',event=>{const control=event.target instanceof Element?event.target.closest('a,button,summary'):null;if(!control||!event.isTrusted||control.id==='install-app')return;registerInterest(control.dataset.cta||control.dataset.role||control.id||control.tagName.toLowerCase()+'_geral');},{capture:true});
 function setAudience(audience) {
  state.audience = audience === 'profissional' ? 'profissional' : 'cliente';
  form.elements.audience.value = state.audience;
  const pro = state.audience === 'profissional';
  document.querySelectorAll('[data-role]').forEach(b => { const active = b.dataset.role === state.audience; b.classList.toggle('active',active); b.setAttribute('aria-pressed', String(active)); });
  $('#form-heading').textContent = pro ? 'Seu próximo contato começa aqui.' : 'Sua casa pode ficar mais leve.';
  $('#form-subtitle').textContent = pro ? 'Conte sua especialidade para participar do piloto.' : 'Conte sua necessidade para a equipe.';
  $('#service-label').textContent = pro ? 'Qual é a sua especialidade?' : 'Qual serviço você precisa?';
  $('#description-label').innerHTML = pro ? 'Conte sua experiência <em>(opcional)</em>' : 'Quer contar mais? <em>(opcional)</em>';
  form.elements.description.placeholder = pro ? 'Ex.: trabalho com montagem de móveis há 3 anos.' : 'Ex.: preciso ajustar duas portas do armário.';
  $('#submit-label').textContent = pro ? 'Quero ser profissional parceiro' : 'Quero participar do piloto';
  status.textContent = ''; status.className = 'form-status';
  $('#whatsapp-followup').hidden = true;
  updateRequestField();
 }
 function updateRequestField(){
  const custom=form.elements.service.value==='Outro serviço — quero descrever';
  const pro=state.audience==='profissional';
  form.elements.description.required=custom;
  $('#description-label').innerHTML=custom?(pro?'Descreva o serviço que você oferece':'Descreva o que você precisa'):(pro?'Conte sua experiência <em>(opcional)</em>':'O que você precisa? <em>(opcional)</em>');
  form.elements.description.placeholder=custom?(pro?'Conte sua especialidade e como você pode ajudar.':'Explique o serviço ou a ajuda que você está procurando.'):(pro?'Ex.: trabalho com limpeza residencial há 3 anos.':'Ex.: preciso de uma diarista uma vez por semana.');
 }
 form.elements.service.addEventListener('change',updateRequestField);
 document.querySelectorAll('[data-cta]').forEach(link => link.addEventListener('click',() => {
  if(link.dataset.audience) setAudience(link.dataset.audience);
  if(link.dataset.service) { setAudience('cliente'); form.elements.service.value = link.dataset.service; updateRequestField(); }
  track('cta_click',link.dataset.cta);
  $('#nav').classList.remove('open'); $('.menu-toggle').setAttribute('aria-expanded','false');
 }));
 document.querySelectorAll('[data-role]').forEach(b=>b.addEventListener('click',()=>setAudience(b.dataset.role)));
 if(params.get('perfil') === 'profissional') setAudience('profissional');
 const campaignService=params.get('servico');
 if(campaignService && [...form.elements.service.options].some(o=>o.value===campaignService)) form.elements.service.value=campaignService;
 updateRequestField();
 form.addEventListener('focusin',() => { if(!state.started) { track('form_start',state.audience); state.started=true; } });
 $('.menu-toggle').addEventListener('click',function() { const open = $('#nav').classList.toggle('open'); this.setAttribute('aria-expanded',String(open)); this.setAttribute('aria-label',open?'Fechar menu':'Abrir menu'); });
 document.querySelectorAll('#nav a').forEach(a=>a.addEventListener('click',()=>{ $('#nav').classList.remove('open'); $('.menu-toggle').setAttribute('aria-expanded','false'); }));
 const installButton=$('#install-app'), installDialog=$('#install-dialog'), installMessage=$('#install-message');
 let installPrompt;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
 window.addEventListener('appinstalled',()=>{installButton.textContent='App instalado';installButton.disabled=true;});
 installButton.addEventListener('click',async()=>{
  if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone){installMessage.textContent='O ConsertAí já está instalado neste aparelho.';installDialog.showModal();return;}
  if(installPrompt){installPrompt.prompt();const result=await installPrompt.userChoice;installPrompt=null;if(result.outcome==='accepted')return;}
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  installMessage.textContent=isIOS?'No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Se estiver em outro navegador, abra este endereço no Safari primeiro.':'No celular, abra este endereço no Chrome, toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”. Se a opção não aparecer, atualize a página e tente novamente.';
  installDialog.showModal();
 });
 $('.close-install-dialog').addEventListener('click',()=>installDialog.close());
 const dialog = $('#privacy-dialog');
 document.querySelectorAll('[data-open-privacy]').forEach(b=>b.addEventListener('click',()=>dialog.showModal()));
 $('.close-dialog').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 const contact = form.elements.contact;
 function validContact() {const s=contact.value.trim();const n=s.replace(/\D/g,'');const valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)||(!/[a-zA-Z]/.test(s)&&/^(?:55)?\d{10,11}$/.test(n));contact.setCustomValidity(valid?'':'Informe um e-mail válido ou um WhatsApp com DDD.');return valid;}
 contact.addEventListener('input',()=>contact.setCustomValidity(''));
 contact.addEventListener('blur',()=>{if(contact.value)validContact();});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(!validContact()||!form.reportValidity()){form.reportValidity();return;}
  const button=form.querySelector('[type=submit]'); button.disabled=true;
  status.className='form-status';status.textContent='Registrando seu interesse…';
  track('cta_click',state.audience==='profissional'?'enviar_profissional':'enviar_cliente');
  const data=Object.fromEntries(new FormData(form));data.consent=form.elements.consent.checked;data.session=session;data.source=source;data.device=device;
  try {const response=await fetch('/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Não foi possível registrar agora. Tente novamente.');
   const name=data.name.trim().split(' ')[0];form.reset();setAudience(state.audience);state.started=false;
   status.className='form-status success';status.textContent=`${name}, seu interesse foi registrado! Para conversar com a equipe agora, abra a mensagem abaixo e confirme o envio no WhatsApp. Protocolo: ${result.id.slice(0,8)}.`;
   const message=`Olá, equipe ConsertAí! ${data.audience==='profissional'?'Quero participar do piloto como profissional.':'Quero participar do piloto e preciso de um serviço.'}\nNome: ${data.name}\nCidade: ${data.city}\n${data.audience==='profissional'?'Especialidade':'Serviço'}: ${data.service}${data.description?'\nDetalhes: '+data.description:''}\nProtocolo: ${result.id.slice(0,8)}`;
   const followup=$('#whatsapp-followup');followup.href='https://wa.me/5555996637074?text='+encodeURIComponent(message);followup.hidden=false;
  } catch(error){status.className='form-status error';status.textContent=location.protocol==='file:'?'Para enviar seu interesse, abra o site pelo servidor ou pelo endereço publicado.':error.message==='Failed to fetch'?'Não foi possível conectar. Confira sua internet e tente novamente.':error.message;}
  finally{button.disabled=false;}
 });
 $('#whatsapp-followup').addEventListener('click',()=>track('cta_click','whatsapp_cadastro'));
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{ $('.mobile-cta').classList.toggle('hidden',entries.some(e=>e.isIntersecting));},{threshold:0});observer.observe($('#piloto'));observer.observe($('footer'));}
})();
