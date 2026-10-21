# Planos Vitrine360

Atualização: 2026-10-20, Codex. O usuário escolheu explicitamente a tabela mais acessível. Este catálogo substitui a sugestão anterior de R$ 79/R$ 199, que não chegou a ser aprovada.

| Plano | Mensalidade | Vitrines | Itens publicados ativos | Armazenamento hospedado |
| --- | --- | --- | --- | --- |
| Gratuito | R$ 0 | 1 | 3 | 250 MB |
| Essencial | R$ 19,90 | 1 | 10 | 1 GB |
| Profissional | R$ 39,90 | 1 | 40 | 3 GB |
| Negócios | R$ 79,90 | 1 | 100 | 10 GB |

Profissional em destaque como recomendado. BRL, periodicidade mensal. Custos e margem ainda precisam ser medidos; não prometer tráfego ilimitado.

Atualização escolhida pelo usuário: pagamento exclusivamente por Pix com QR Code/copia e cola, sem cartão. Renovação manual, sem débito automático. Consulte [PAGAMENTO_PIX.md](PAGAMENTO_PIX.md) para implementação e estado de validação. A sugestão de `/preapproval` abaixo foi substituída por Pix online via Orders API.

Ativação concluída para emissão em 2026-10-20: endpoint Supabase Edge publicado e frontend conectado, três migrações aplicadas, limites de itens/armazenamento ativos e QR Code real emitido/cancelado sem pagamento na verificação. O bloco de pendências abaixo é o planejamento anterior; consulte PAGAMENTO_PIX.md para o estado atual e os limites de validação bancária.

## Regras e apresentação

Cada publicação ativa corresponde a um produto ou veículo público da vitrine. Fotos, tours e spins vinculados ao mesmo item não geram outra contagem. Todos os arquivos hospedados contam no armazenamento, em unidades decimais. Rascunhos locais ficam fora da cota de hospedagem, sujeitos à capacidade do navegador.

Não cobrar comissão sobre vendas dos lojistas: o escopo autorizado continua sendo a assinatura da plataforma. IA, equipes e domínio próprio não são benefícios incluídos no catálogo.

O catálogo para exibição está em `src/planCatalog.ts`; `src/BillingPlans.tsx` apresenta a comparação, detalhes da seleção, estado explícito de cobrança em configuração e o painel existente de armazenamento real R2. Nenhuma seleção altera assinatura nem cria cobrança. A interface não afirma que o usuário tem um plano gratuito sem confirmação da assinatura.

## Integração de cobrança pendente

A tela e o adapter de cobrança Pix estão implementados localmente, sem habilitação real. As cotas comerciais ainda precisam ser integradas. A migração `0003_media_ai_commercial.sql` ainda aceita `free/studio/teams`; não associar silenciosamente esses registros antigos aos novos planos. O novo registro Pix fica separado das assinaturas legadas.

1. Implementar cotas no backend cobrindo publicação e armazenamento R2 e Supabase, com reservas atômicas e sem exclusão de conteúdo em downgrade.
2. Confirmar o país da conta Mercado Pago e configurar credenciais somente no servidor; o preço BRL escolhido não comprova o país da conta.
3. Homologar o fluxo Pix online via `/v1/orders`, implementado em `cloudflare/pix.mjs`, com preços calculados no servidor e renovação mensal manual. Não usar `/preapproval` nem coletar cartão.
4. Validar notificações, vínculo ao dono, duplicação de requisições, conciliação e ciclo da assinatura. O retorno do navegador sozinho não libera plano.
5. Definir política de cancelamento/downgrade e validar renovação, pendência, recusa, cancelamento, eventos repetidos e isolamento entre contas em teste antes de ativar cobrança real.

## Direção visual aplicada

Preservar o estúdio: papel #f4efe6, painel #fffcf7, floresta #153a32, texto #182e26, secundário #626557 e bordas #dcd6ca. Manrope para interface e valores; Bodoni Moda no título. Comparação alinhada à esquerda, quatro colunas quando há espaço, duas no intermediário e uma no celular. Destaque apenas no Profissional; sem adicionar animação ou novas fontes. A comparação comercial justifica cartões iguais; estado da conta e medição de armazenamento ficam em uma área separada.
