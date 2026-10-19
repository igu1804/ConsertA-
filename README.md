# ConsertAí

Landing page do piloto acadêmico ConsertAí: aproxima quem precisa de serviços residenciais de profissionais locais. Inclui formulário para clientes e profissionais, WhatsApp da equipe, métricas e contador de interesses com limite por identificador persistente do navegador.

## Publicar no Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Figu1804%2FConsertA-)

O botão usa o `render.yaml` deste repositório para preparar um **Web Service no plano Free**. Revise a configuração na sua conta e preencha:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL copiada do projeto Neon Free |
| `ADMIN_USER` | `equipe` — já definido na configuração |
| `ADMIN_PASSWORD` | Uma senha sua com pelo menos 16 caracteres |
| `NEON_AUTH_BASE_URL` | URL de autenticação da branch, obtida com `neon deploy` |
| `NEON_AUTH_COOKIE_SECRET` | Segredo aleatório com pelo menos 32 caracteres |
| `ADMIN_EMAILS` | E-mails da equipe autorizados a acessar o painel |

O Render fornece `PORT` automaticamente. Após o estado **Live**, use o endereço HTTPS informado pelo Render: `/consertai` abre a página, `/equipe` abre o login com Neon Auth, `/painel` contém as métricas privadas e `/health` verifica o servidor. No primeiro acesso, crie sua conta e verifique seu e-mail. Apenas os e-mails em `ADMIN_EMAILS` recebem acesso ao painel.

O [guia completo](GUIA-RENDER.md) também explica a publicação manual.

## Armazenamento e limites

- O serviço Render Free pode hibernar sem tráfego; o próximo acesso pode demorar. Respeite as cotas do plano gratuito.
- Com `DATABASE_URL`, o contador, os cadastros e as métricas ficam no PostgreSQL externo. No Render, a inicialização exige esse banco para evitar perda de dados em disco efêmero.
- O contador soma o primeiro clique por identificador do navegador. Outro navegador, modo privado ou limpeza dos dados podem contar novamente; não é identificação de uma máquina física ou pessoa única.
- O envio deste código não importa os dados anteriormente coletados no computador da equipe.
- Senhas, conexão real do banco e registros dos participantes devem permanecer fora do repositório. `.env.example` contém apenas campos vazios para referência.

## Executar localmente

Requer Node.js 24. Execute `npm ci`, `npm run build` e `npm start`. As variáveis de `.env.local` são carregadas automaticamente. Sem `DATABASE_URL`, os dados ficam em `data/`, fora da página pública e ignorados pelo Git. A página abre em `http://127.0.0.1:4173/consertai`. Veja [a integração Neon e o acesso da equipe](NEON.md).

## Verificação

`npm run build` valida o código e gera os recursos do login. `npm run test:neon` verifica o banco e a autenticação reais usando contas sintéticas, incluindo cadastro, contagem concorrente, reinício e sessão. Esse teste precisa de `.env.local` configurado e limpa seus próprios registros ao terminar. A entrega de códigos a uma caixa de e-mail real é uma conferência manual separada.
