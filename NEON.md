# Neon e acesso da equipe

Este projeto usa o PostgreSQL do Neon com o driver `pg`, adequado ao servidor Node persistente do Render. As consultas são parametrizadas e usam conexão TLS verificada. O código do armazenamento mantém os cliques únicos no banco, inclusive após reiniciar a hospedagem.

`neon.ts` declara PostgreSQL e Neon Auth. A configuração local já está vinculada ao projeto `curly-wave-11802895`, branch `production`. Para atualizar as variáveis locais, use `neon deploy`. O arquivo `.env.local` é privado e ignorado pelo Git. O servidor o carrega automaticamente; as variáveis definidas na hospedagem têm prioridade.

## Login

`/equipe` permite criar uma conta, verificar o e-mail por código, entrar e sair usando Neon Auth. O proxy e as sessões usam o SDK oficial `@neondatabase/auth/server`. Para abrir `/painel`, ler métricas ou exportar cadastros, a conta precisa ter e-mail verificado e estar na lista `ADMIN_EMAILS` do servidor. Criar uma conta não concede acesso ao painel.

No primeiro acesso, o responsável deve criar sua própria conta em `/equipe` e verificar seu e-mail. A senha dessa conta é escolhida por ele. O acesso HTTP Basic com `ADMIN_USER` e `ADMIN_PASSWORD` permanece como alternativa administrativa para ferramentas e recuperação.

## Variáveis da hospedagem

- `DATABASE_URL`: conexão PostgreSQL do Neon.
- `DATABASE_URL_UNPOOLED`: conexão direta para operações administrativas.
- `NEON_AUTH_BASE_URL`: URL de Auth da branch.
- `NEON_AUTH_JWKS_URL`: URL de verificação publicada pelo Neon.
- `NEON_AUTH_COOKIE_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `ADMIN_EMAILS`: e-mails autorizados, separados por vírgula.
- `ADMIN_USER` / `ADMIN_PASSWORD`: acesso administrativo alternativo; senha com pelo menos 16 caracteres.

Cadastre a origem HTTPS real do site nos domínios confiáveis do Neon Auth depois da publicação: `neon neon-auth domain add https://endereco-real.onrender.com`. O domínio deve corresponder à branch configurada. Localhost é autorizado pelo Neon por padrão.

## Verificação

`npm run build` valida a sintaxe do servidor, a tipagem de `neon.ts`, os recursos públicos e gera o JavaScript do login. O Render deve executar `npm ci --include=dev && npm run build` e iniciar com `npm start`.

Para executar `npm run test:neon`, adicione antes a origem local de teste: `neon neon-auth domain add http://127.0.0.1:4191`. O teste usa essa porta temporariamente e verifica o e-mail apenas da conta sintética diretamente no banco; ele não confirma a entrega de mensagens a uma caixa real.

Verifique formulário, deduplicação de cliques, persistência após reiniciar, criação de conta, entrada, saída e recusa do painel para contas não autorizadas. Registros de teste usam o prefixo `qa_` e não entram nos indicadores do piloto. Os registros antigos coletados no computador não são importados automaticamente.
