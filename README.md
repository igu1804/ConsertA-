# ConsertAí

Site do piloto acadêmico ConsertAí em Santa Maria, RS. Inclui cadastro de interesse, contas de clientes e profissionais, perfis aprovados para exibição, busca por serviço, pedidos, avaliações após conclusão, métricas e contador de interesses.

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

O Render fornece `PORT` automaticamente. Após o estado **Live**, use o endereço HTTPS informado pelo Render: `/consertai` abre a página, `/entrar` cria uma conta ou faz login, `/profissionais` mostra a busca após login (inclusive a opção Outros), `/meu-perfil` recebe o perfil profissional, `/minha-conta` acompanha pedidos e tickets de dúvida, `/equipe` abre o login da equipe, `/painel` contém as métricas privadas, `/administrador` mostra serviços, pedidos, tickets, prestadores e contas, e `/health` verifica o servidor. No primeiro acesso, crie sua conta e verifique seu e-mail.

O e-mail verificado `igor.camerino99@outlook.com` tem função de **administrador chefe**. Essa conta pode acessar todas as áreas administrativas e atribuir ou remover a função de administrador de outras contas verificadas ou cadastradas. E-mails em `ADMIN_EMAILS` também têm acesso de administrador, mas sua função é gerida na configuração do Render. A autorização é conferida no servidor, não apenas na interface.

O [guia completo](GUIA-RENDER.md) também explica a publicação manual.

## Como ler os painéis

O `/administrador` reúne as métricas de validação da landing page e a atividade do marketplace. O `/painel` continua disponível e apresenta os mesmos indicadores da landing page, além dos mesmos quatro totais do marketplace.

- **Landing page:** interesses únicos contam o primeiro clique por identificador anônimo do navegador; visitas contam uma por sessão; cliques incluem repetições; cadastros de interesse são formulários enviados; conversão relaciona sessões com cadastro às sessões visitantes. Um identificador de navegador não equivale a uma pessoa.
- **Marketplace:** contas com login vêm do Neon Auth; prestadores com perfil, pedidos e dúvidas vêm das tabelas do marketplace. Esses registros começam quando alguém cria conta ou usa os fluxos autenticados.
- **Reconciliação:** cadastros de interesse da landing page não são contas, perfis profissionais nem pedidos. A tabela por serviço mostra os interesses e perfis em colunas separadas; os dados históricos permanecem nos seus armazenamentos originais.

Os eventos sintéticos identificados pelo modo de teste `?teste=1` continuam excluídos dos totais reais.

## Armazenamento e limites

- O serviço Render Free pode hibernar sem tráfego; o próximo acesso pode demorar. Respeite as cotas do plano gratuito.
- Com `DATABASE_URL`, o contador, os cadastros, os perfis, os pedidos, os tickets, as avaliações, as funções administrativas atribuídas e as métricas ficam no PostgreSQL externo. No Render, a inicialização exige esse banco para evitar perda de dados em disco efêmero. A lista de contas vem da tabela gerenciada pelo Neon Auth.
- Perfis profissionais exigem autorização explícita e aprovação pela equipe. Contatos são compartilhados entre as partes somente após o aceite do pedido. Nenhum cadastro antigo de interesse é transformado automaticamente em perfil público.
- O [modelo de receita](MODELO-DE-RECEITA.md) contém hipóteses de comissão e VIP. O site ainda não processa pagamentos nem ativa assinaturas.
- O contador soma o primeiro clique por identificador do navegador. Outro navegador, modo privado ou limpeza dos dados podem contar novamente; não é identificação de uma máquina física ou pessoa única.
- O envio deste código não importa os dados anteriormente coletados no computador da equipe.
- Senhas, conexão real do banco e registros dos participantes devem permanecer fora do repositório. `.env.example` contém apenas campos vazios para referência.

## Executar localmente

Requer Node.js 24. Execute `npm ci`, `npm run build` e `npm start`. As variáveis de `.env.local` são carregadas automaticamente. Sem `DATABASE_URL`, os dados ficam em `data/`, fora da página pública e ignorados pelo Git. A página abre em `http://127.0.0.1:4173/consertai`. Veja [a integração Neon e o acesso da equipe](NEON.md).

## Verificação

`npm run build` valida o código e gera os recursos do login. `node --test test/marketplace-store.test.mjs` cobre aprovação, filtro, pedido e avaliação no armazenamento local. `npm run test:neon` verifica o banco e a autenticação reais usando contas sintéticas, incluindo cadastro, contagem concorrente, reinício e sessão. Esse teste precisa de `.env.local` configurado e limpa seus próprios registros ao terminar. A entrega de códigos a uma caixa de e-mail real é uma conferência manual separada.
