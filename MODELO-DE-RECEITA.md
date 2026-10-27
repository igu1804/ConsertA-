# Modelo de receita para o piloto ConsertAí

**Região inicial:** Santa Maria, RS. **Estado atual:** proposta de teste; o site ainda não cobra, processa pagamentos nem ativa benefícios VIP.

## Oferta proposta

| Plano do profissional | Mensalidade | Comissão por serviço pago pela plataforma | Benefício |
| --- | ---: | ---: | --- |
| Básico | R$ 0 | 10% | Perfil público aprovado, pedidos e avaliações de serviços concluídos. |
| VIP | R$ 24,90/mês | 5% | Taxa menor, aviso prioritário de pedidos compatíveis e ferramentas para acompanhar agenda e resultados. |

O cliente pode buscar e pedir contato sem mensalidade. Preço e escopo do serviço devem ser combinados antes da contratação. As taxas acima são **hipóteses comerciais**, ainda não validadas com clientes e profissionais. O plano VIP deve ser opcional, com benefícios e cancelamento explicados antes da cobrança. Não exibir selo de qualidade ou avaliação superior por causa do pagamento.

Para um serviço de R$ 200, a comissão hipotética seria R$ 20 no Básico e R$ 10 no VIP. Com esse valor médio, o VIP fica mais barato para o profissional a partir de **3 serviços pagos no mês**: 3 × R$ 20 = R$ 60 no Básico; R$ 24,90 + 3 × R$ 10 = R$ 54,90 no VIP. Esta conta ignora taxas do processador, impostos, reembolsos, inadimplência e custo de atendimento.

## Como validar antes de cobrar

1. Formar uma oferta real: profissionais de Santa Maria criam perfil, autorizam sua publicação e a equipe revisa. Cadastros antigos de interesse não viram perfis automaticamente.
2. Medir por 4 a 8 semanas: busca → pedido → aceite → serviço concluído → avaliação; registrar também ticket médio e quanto tempo a equipe gastou por atendimento.
3. Entrevistar profissionais sobre a comissão de 10% e o VIP de R$ 24,90 + 5%; entrevistar clientes sobre confiança, disponibilidade e clareza do preço.
4. Publicar termos de contratação e cobrança, política de reembolso/cancelamento e tratamento de dados antes de aceitar pagamentos. Definir quem emite recibo ou nota e quem resolve disputas.
5. Integrar pagamento hospedado e repasse dividido; registrar o pagamento confirmado por webhook antes de calcular a comissão ou liberar qualquer benefício pago.

O [Mercado Pago documenta checkout para marketplace com divisão automática de valores](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/how-tos/integrate-marketplace?scope=prod) e [planos de assinatura recorrente](https://www.mercadopago.com.br/developers/pt/docs/subscription-plans/create-subscription-plan). É necessário confirmar requisitos de conta, tarifas e se os dois fluxos atendem ao desenho final. A [Stripe Connect também oferece modelo de plataforma com tarifas próprias](https://stripe.com/br/connect/pricing), mas seu custo por conta ativa e repasse precisa entrar na simulação antes de escolher o provedor.

**Métrica de lucro:** receita recebida de comissões + assinaturas, menos taxas de pagamento, hospedagem, suporte, aquisição de clientes, tributos, reembolsos e perdas. Número de pedidos ou valor movimentado não equivale a lucro.
