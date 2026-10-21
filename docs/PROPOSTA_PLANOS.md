# Proposta de planos Vitrine360

> Superada em 2026-10-20: o usuário escolheu a tabela mais acessível com quatro planos. Consulte [PLANOS_COMERCIAIS.md](PLANOS_COMERCIAIS.md). A proposta abaixo permanece somente como histórico, sem aprovação.

Data: 2026-10-20. Autor: Codex. Estado: proposta para avaliação; valores, moeda e limites não aprovados pelo proprietário. Não configura preços no Mercado Pago nem habilita cobrança.

## Catálogo sugerido para lançamento

Hipótese comercial: cobrança mensal em reais para criadores de vitrines de objetos e veículos. Cada publicação ativa corresponde a um item público da vitrine; tours, spins e plantas vinculados ao mesmo item não geram outra contagem. Todos os arquivos hospedados contam no armazenamento. Essa regra ainda precisa ser implementada no backend.

| Plano | Mensalidade sugerida | Vitrines por conta | Itens publicados ativos | Armazenamento hospedado |
| --- | --- | --- | --- | --- |
| Gratuito | R$ 0 | 1 | 3 | 250 MB |
| Studio | R$ 79 | 1 | 30 | 5 GB |
| Negócios | R$ 199 | 1 | 150 | 20 GB |

Os valores e cotas são hipóteses iniciais, sem validação de margem. Armazenamento não limita sozinho custos de entrega: medir tráfego e operação antes de prometer visualizações ilimitadas. Rascunhos locais ficam fora da cota de hospedagem, sujeitos à capacidade do navegador.

O Studio é a opção sugerida para destaque. O Gratuito permite experimentar a criação e a publicação; os pagos ampliam capacidade. Não cobrar comissão sobre vendas dos lojistas: o escopo autorizado é a assinatura da plataforma.

Não anunciar equipe multiusuário, múltiplas vitrines, domínio próprio, retirada de marca ou geração por IA como benefícios disponíveis sem implementação e validação. Créditos de IA podem ter cobrança separada no futuro. Plano Agência pode ser adicionado quando houver gestão real de clientes/equipes. Começar com mensalidade evita definir descontos e contratos anuais prematuramente.

## Estado técnico e trabalho necessário

A página `src/App.tsx`, rota `/account/billing`, apresenta Gratuito e um diálogo informativo. Não há checkout funcional nem catálogo comercial nessa tela. A migração `0003_media_ai_commercial.sql` aceita chaves `free/studio/teams`; nomes comerciais, versões, preços, limites e associação ao Mercado Pago devem ser definidos em catálogo explícito, sem mudar silenciosamente o significado de assinaturas existentes.

1. Confirmar país/moeda, preços e limites com o proprietário e conferir custos de armazenamento, tráfego e processamento.
2. Implementar catálogo versionado e aplicação de cotas no backend, cobrindo caminhos de publicação R2 e Supabase.
3. Implementar assinatura Mercado Pago no servidor e checkout autenticado; credenciais permanecem no servidor.
4. Validar notificações, idempotência, vínculo ao dono e conciliação do estado da assinatura. O retorno do navegador sozinho não libera plano.
5. Implementar estados pendente, ativo, inadimplente e cancelado; exibir ciclo e cobrança verificáveis. Definir política de cancelamento/downgrade antes de ativar cobrança recorrente. Nunca apagar arquivos automaticamente por downgrade; bloquear novas publicações acima da cota.
6. Validar em ambiente de teste, incluindo pagamento pendente/recusado, renovação, cancelamento, eventos duplicados e acesso entre contas, antes de disponibilizar cobrança real.

Esta proposta não implementa esses passos e não comprova integração de pagamento operacional.

## Referência externa

Consulta em 2026-10-20: a [Kuula](https://kuula.co/page/pricing) diferencia planos por capacidade, personalização e recursos comerciais. Referência de organização do catálogo, sem equivalência de custos ou conversão de seus preços para o Vitrine360.
