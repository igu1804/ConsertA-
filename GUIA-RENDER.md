# ConsertAí — publicar no Render sem contratar plano pago

**Atualizado em 19/10/2026.** O caminho é **GitHub (igu1804/ConsertA-) → Render Free → banco Neon Free**. O servidor foi testado localmente; a conexão com um banco Neon real e a publicação ainda dependem da configuração abaixo. Nenhum deploy foi feito por este guia.

## 1. Repositório do projeto

O repositório do projeto é [igu1804/ConsertA-](https://github.com/igu1804/ConsertA-). Os arquivos de implantação ficam diretamente na raiz, junto de `package.json`, `server.mjs`, `storage.mjs` e `render.yaml`; a pasta `public` contém a página.

O botão **Deploy to Render** no README abre a configuração da hospedagem a partir desse repositório. Você também pode seguir a configuração manual abaixo. O envio do código não cria nem importa o banco automaticamente.

Mantenha senhas, a conexão real do banco, `.env`, `node_modules` e a pasta `data` fora do GitHub.

## 2. Criar o banco gratuito no Neon

1. Entre em [console.neon.tech](https://console.neon.tech/) e crie a conta.
2. Mantenha o plano **Free**. Crie um projeto chamado `consertai`; escolha **AWS — US East, N. Virginia**, para ficar próximo da região Virginia do Render.
3. Abra **Connect**. Copie a **connection string** completa, começando com `postgresql://`, preservando os parâmetros de segurança. Ela será usada em `DATABASE_URL` no próximo passo. **Cole diretamente no campo do Render; não a publique no GitHub nem a envie no chat.** [Integração oficial Neon + Render](https://neon.com/docs/guides/render).

O Neon Free tem cotas e não exige cartão segundo a [página de planos](https://neon.com/pricing). Acompanhe o consumo e mantenha o plano Free. Usamos banco externo porque o disco do Render Free perde alterações ao reiniciar e o **Postgres gratuito do próprio Render expira em 30 dias**. [Limites oficiais do Render Free](https://render.com/docs/free).

## 3. Criar o serviço no Render

Abra [dashboard.render.com](https://dashboard.render.com/) e entre com GitHub. Ao autorizar a integração, escolha **Only select repositories** e permita somente `ConsertA-`.

Clique em **New → Web Service → Git Provider**, conecte o repositório `igu1804/ConsertA-` e preencha:

| Campo | Valor |
| --- | --- |
| Name | `consertai` — se indisponível, use uma variação com a marca |
| Region | **Virginia, USA** |
| Runtime / Language | **Node** |
| Branch | `main` |
| Root Directory | Deixe **vazio** |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Instance Type | **Free** |
| Health Check Path, em Advanced | `/health` |

Escolha **Web Service**, pois cadastro e métricas precisam do servidor Node. Os campos seguem o fluxo de [Web Services](https://render.com/docs/web-services) e o [guia de publicação Node](https://render.com/docs/deploy-node-express-app). O endereço exato será informado pelo Render; o nome escolhido não garante uma URL específica.

## 4. Informar as variáveis

Em **Environment Variables**, adicione:

| Chave | Valor |
| --- | --- |
| `DATABASE_URL` | A connection string completa copiada do Neon |
| `ADMIN_USER` | `equipe` |
| `ADMIN_PASSWORD` | Senha criada por você, com **pelo menos 16 caracteres** |

Guarde a senha e a conexão em local privado. **Não configure `PORT`: o Render fornece automaticamente.** Confirme novamente **Free** antes de clicar em **Create Web Service**. Se aparecer uma contratação paga, não a selecione para este piloto.

## 5. Publicar e conferir

Acompanhe **Deploys / Logs** até o estado **Live**. Copie a URL **HTTPS exibida pelo Render** e use-a como base:

| Caminho acrescentado à URL | Conferência |
| --- | --- |
| `/health` | Deve responder com HTTP **200** |
| `/consertai` | Página pública, formulário e contador carregam |
| `/painel` | Pede login: usuário `equipe` e a senha que você criou |

Faça um cadastro de teste identificado e confira no painel. Em um navegador ainda não registrado, apenas visitar não aumenta “Interesses únicos”; o primeiro clique em uma ação deve somar **1**, sem cadastro. Repita cliques e recarregue: não deve somar novamente. Aguarde até 30 segundos para a atualização visual. É uma aproximação por navegador: outro navegador, modo anônimo ou dados apagados podem contar novamente.

Depois de confirmar a publicação, substitua o link temporário nos materiais e gere um novo QR code com a URL real.

## 6. O que muda após publicar

O computador local poderá ser desligado sem interromper o serviço hospedado. Entretanto, **Render Free hiberna após 15 minutos sem tráfego**; o primeiro acesso seguinte pode levar cerca de um minuto. Não há garantia de funcionamento contínuo 24 horas, e as cotas devem ser respeitadas. [Condições do plano Free](https://render.com/docs/free).

Com `DATABASE_URL` configurada corretamente, os novos registros ficam no Neon e sobrevivem aos reinícios do Render, dentro das regras e cotas do banco. **Os cadastros e contadores locais atuais não são importados automaticamente.** Uma migração separada poderá ser preparada; não considere os dados antigos já transferidos.

O modo local continua disponível em `http://127.0.0.1:4173/consertai`. Se o deploy falhar, confira os campos, a estrutura na raiz e os logs; não compartilhe credenciais ao pedir ajuda.
