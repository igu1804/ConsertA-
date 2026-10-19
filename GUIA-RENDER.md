# Publicar a ConsertAí no Render

O código está em [igu1804/ConsertA-](https://github.com/igu1804/ConsertA-). O banco e a autenticação pertencem ao projeto Neon existente `curly-wave-11802895`, branch `production`. Use esse projeto; não é necessário criar outro banco.

## Hospedagem

Use o botão **Deploy to Render** no README, ou crie um Web Service com estes valores:

| Campo | Valor |
| --- | --- |
| Repositório | `https://github.com/igu1804/ConsertA-` |
| Branch | `main` |
| Root Directory | vazio |
| Runtime | Node |
| Plan | Free |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

O arquivo `render.yaml` guarda a configuração. As variáveis e senhas devem ser configuradas no Render, conforme [NEON.md](NEON.md). Não as publique no repositório.

Depois de obter a URL HTTPS real, registre a origem no Neon Auth:

```sh
neon neon-auth domain add https://endereco-real.onrender.com
```

## Primeiro acesso da equipe

Abra `/equipe`, crie sua conta com o e-mail autorizado e verifique o código enviado por e-mail. A senha da conta Neon é escolhida por você. Somente e-mails verificados que constam em `ADMIN_EMAILS` podem abrir `/painel` ou exportar cadastros. O acesso alternativo HTTP Basic continua disponível para ferramentas usando `ADMIN_USER` e `ADMIN_PASSWORD`.

## Conferência

- `/health`: responde HTTP 200 quando o servidor iniciou e conectou ao banco.
- `/consertai`: página pública, formulário e contador.
- `/equipe`: criação de conta, verificação de e-mail, entrada e saída.
- `/painel`: métricas privadas e exportação dos cadastros.

Visitar a página não aumenta o contador de interesses. O primeiro clique em uma ação soma 1; novos cliques do mesmo identificador persistente não somam novamente. Outro navegador, modo privado ou limpeza de dados podem gerar um novo identificador. Trata-se de contagem por navegador, não por máquina física ou pessoa.

Use a URL real nos materiais e no QR code depois da conferência. Não compartilhe os registros pessoais do painel publicamente.

## Limites do plano gratuito

O Render Free pode hibernar após 15 minutos sem tráfego; o primeiro acesso seguinte pode demorar. O banco externo preserva os registros durante os reinícios da hospedagem, dentro das cotas do Neon. Os dados antigos coletados no computador não são importados automaticamente. Consulte os [limites do Render](https://render.com/docs/free) e o [plano Neon](https://neon.com/pricing).
