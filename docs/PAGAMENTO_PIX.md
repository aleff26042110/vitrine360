# Mercado Pago — Pix online · Brasil · Orders API · Worker JavaScript

Estado em 2026-10-20: emissão real habilitada a pedido explícito do usuário. Endpoint publicado no Supabase Edge: `https://msovfbuhehaiousuzbwr.supabase.co/functions/v1/pix-billing`. `GET /config` confirmou `enabled=true`, `method=pix`, `renewal=manual`. Aplicação recebedora 6583777378117136, país MLB e Pix ativo verificados. A aplicação de Assinaturas estava sem produção ativada; foi reutilizada a aplicação existente com produção disponível.

Um QR Code real de R$ 19,90 foi emitido na API e cancelado em seguida (HTTP 200), sem pagamento. Isso verifica emissão e cancelamento; não equivale a confirmação de um pagamento bancário realizado. Testes de confirmação de período pago usam transporte simulado/SQL local.

O usuário escolheu Pix com QR Code, sem cartão. A renovação é manual, com novo Pix por mês. Não usar `/preapproval`; Pix Automático não foi implementado.

## 1. Instalação

Usa as dependências existentes (`npm ci`). Adapter HTTP com `fetch` nativo do Worker, conforme exemplo oficial da Orders API; nenhum SDK Mercado Pago foi instalado ou atualizado nesta etapa. Não coletar cartão nem carregar SDK de cartão.

Frontend: `npm run dev`. A instalação local usa `VITE_BILLING_API_URL` para o endpoint Edge acima. Sem esse endereço, o cliente usa o gateway R2 ou o proxy local como fallback. O adapter canônico permanece em `cloudflare/pix.mjs`; `node scripts/sync-pix-backend.mjs` sincroniza a cópia para `supabase/functions/_shared/pix.mjs` antes de publicar a função `pix-billing`. Ela verifica a sessão e a assinatura de webhook no próprio handler; o verificador JWT do gateway fica desabilitado para permitir o webhook público. Rota de checkout: `/account/billing/pix?plan=professional`.

## 2. Credenciais

No servidor, configurar `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_CLIENT_KEY`, `SUPABASE_SERVER_KEY`. Em desenvolvimento, usar `cloudflare/.dev.vars` ou arquivo de variáveis suportado pelo Wrangler, sempre ignorado pelo Git; nunca usar prefixo `VITE_` para segredos. Não salvar credenciais neste documento. Consultar credenciais oficiais em https://www.mercadopago.com.br/developers/panel/app.

Os dois flags estão configurados como `true` no serviço publicado. Credenciais permanecem nos segredos Supabase; o segredo de webhook existente `MERCADO_PAGO_WEBHOOK_SECRET` é aceito como alias de `MP_WEBHOOK_SECRET`. As credenciais Supabase são fornecidas pelo ambiente da Edge Function. Desabilitar novas cobranças não interrompe a reconciliação de invoices existentes.

Verificar que a aplicação e a chave Pix recebedora estão aptas a Pix online brasileiro. Não confundir QR Pix online (`type=online`, `pix`, `bank_transfer`) com QR presencial do Mercado Pago (`type=qr`, loja/POS).

## 3. Código do servidor

`cloudflare/pix.mjs`, chamado por `worker.mjs`:

- `GET /billing/config`: disponibilidade, sem credenciais.
- `POST /billing/pix`: somente `{planId}`; exige sessão real e e-mail confirmado. Valores 1990/3990/7990 centavos resolvidos no servidor/banco, não no navegador.
- `GET /billing/pix/:id`: dono autenticado, conciliação com `GET /v1/orders/:id`.
- `POST /billing/webhook`: verificação HMAC antes de consultar qualquer registro; conciliação em `ctx.waitUntil`.

Criação em `POST https://api.mercadopago.com/v1/orders`, `type=online`, `processing_mode=automatic`, método `pix/bank_transfer`, expiração do pagamento `PT30M`. ID persistido da invoice é `external_reference` e `X-Idempotency-Key`. Repetir envio usa a mesma invoice, e-mail persistido e corpo. Incerteza de rede preserva a tentativa; não cria automaticamente outra.

Migrações aplicadas no projeto remoto e verificadas por consultas: `20261020225552_pix_billing.sql`, `20261020231149_pix_plan_limits.sql` e `20261020231709_pix_storage_paid_capacity.sql`. Invoices e acesso mensal ficam separados das subscriptions legadas. Uma invoice aberta por conta, controle de tentativas, isolamento RLS, escrita/RPC somente por `service_role`. Confirmação paga concede uma vez `now() + interval '1 month'`; repetição não estende a validade. Reembolso integral retira somente o acesso vinculado à invoice.

Triggers no servidor limitam o crescimento dos itens publicados na vitrine e o armazenamento combinado R2 + Supabase. Conteúdo existente é preservado após expiração; crescimento acima do limite é bloqueado. A proteção operacional R2 mantém sua capacidade base e acrescenta a capacidade dos períodos pagos ativos. Editor/documento agora suportam até 100 itens, com publicação limitada ao plano. O painel de conta lê o plano real em `billing_pix_access`.

## 4. Código do cliente

`src/PixCheckoutPage.tsx` e `src/pixBilling.ts`: preço acima do pagamento, inicialização, processamento, erro legível, pendente, pago, expirado, cancelado, falha e devolução. QR PNG e copia e cola vêm da resposta do servidor. Nunca gerar QR fictício na aplicação real. Consulta a cada 10s apenas na aba visível, sem sobreposição. Troca de sessão limpa dados da invoice; respostas antigas são ignoradas.

## 5. Webhook

Registrado pelo MCP na aplicação 6583777378117136: `https://msovfbuhehaiousuzbwr.supabase.co/functions/v1/pix-billing/webhook`, tópico atual `order` segundo a documentação oficial consultada (a referência empacotada usa o nome `orders`). A aplicação também mantém `payment`; notificações numéricas legadas válidas são reconhecidas e ignoradas, sem liberar acesso. Retorno 200 após verificar assinatura; reconciliação consulta o provedor, não confia no status do corpo. Eventos repetidos são seguros pela idempotência transacional do acesso. Polling autenticado também reconcilia. A consulta de histórico não retornou notificações, portanto entrega externa não foi comprovada nesta etapa.

Recuperação de confirmação publicada: `vitrine360-pix-reconcile` verifica a cada minuto se há invoices pendentes e consulta novamente o Mercado Pago, independentemente da aba do cliente. Cada lote tem até 10 invoices e uma espera mínima de 45s entre lotes; tentativas ficam registradas para não bloquear indefinidamente outras invoices em caso de falha. Uma falha de `waitUntil` deixa a invoice pendente para a próxima execução.

O agendador usa tickets aleatórios de uso único com expiração de 2 minutos; o banco consome o ticket antes de consultar o provedor. A fila da extensão pg_net é gerenciada pela plataforma e pode manter grants PUBLIC, portanto ela não recebe credenciais reutilizáveis da aplicação. O ticket só permite conciliar o lote selecionado pelo servidor; não permite escolher dono/valor, emitir cobrança ou conceder acesso sem confirmar o status no provedor. O segredo legado do agendador foi invalidado na migração para tickets.

Migrações de recuperação: `20261021011730_pix_confirmation_recovery.sql`, `20261021011854_pix_confirmation_schedule.sql`, `20261021012327_pix_scheduler_queue_privacy.sql` e `20261021012531_pix_scheduler_single_use_tickets.sql`. A revogação inicialmente tentada em tabelas da extensão não removeu os grants do proprietário da plataforma; a proteção efetiva é o modelo de tickets de uso único. Não presumir que a fila da extensão foi privatizada.

## 6. Testes

`npm run test -- tests/pixBilling.test.mjs tests/pixBillingMigration.test.ts tests/r2Gateway.test.mjs` valida transporte simulado e PGlite local: preços, Pix exclusivo, idempotência, sessão, propriedade, assinatura webhook, bloqueio de emissão sem configuração, confirmação única e devolução. Não equivale a compra real nem valida credenciais do recebedor.

Homologar com o [teste oficial de Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/test-pix) e credenciais apropriadas antes de produção. Pix não usa cartões de teste. Não realizar transferência bancária real como efeito colateral de um teste automatizado.

## 7. Documentação

- [Pix Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix)
- [Status da order](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/order-status)
- [Status da transação](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/status/transaction-status)

## 8. Particularidades

`processed/accredited` confirmado pelo servidor libera período pago; geração de QR, comprovante ou clique do cliente não liberam. Referência, total, transação única, método e ID são verificados antes de persistir. Renovação antecipada/troca de plano durante período ativo estão bloqueadas nesta versão, até definir regras comerciais. Invoice pendente de outro plano precisa ser resolvida antes de nova emissão. Não apagar conteúdo por expiração do plano.

Verificação no banco publicado para Essencial/Profissional/Negócios: uma transação de teste com rollback confirmou início somente na confirmação, um mês de validade, desbloqueio das cotas, preservação de datas em replay e retorno aos limites gratuitos após expiração. Nenhuma conta de verificação ficou persistida. A tela exibe o início e o vencimento recebidos do servidor. A cobrança real pendente consultada continuou sem granted_at/access_until; não iniciar prazo enquanto não houver confirmação de pagamento.

O cron autenticado retornou HTTP 202 e processou uma invoice real pendente, atualizando sua consulta ao provedor sem conceder acesso indevido. Isso comprova o caminho de recuperação funcionando; não equivale a um pagamento bancário aprovado, ainda não realizado nesta validação.

## 9. Próximos passos

1. Webhook: URL pública, assinatura e recuperação periódica já configuradas; acompanhar a primeira notificação de uma transferência realmente aprovada para comprovar a entrega externa.
2. Teste: credenciais/contas e homologação do Pix (`mp-test-setup` quando aplicável), sem cartões.
3. Revisão: inspeção de segurança local concluída; o checklist oficial retornou `Product not homologable` para esta aplicação e não forneceu critérios. Não declarar homologação/certificação oficial. Quotas e migrações já estão aplicadas e a emissão está habilitada. Nenhuma transferência real foi efetuada; a cobrança de verificação foi cancelada sem pagamento.

Revalidação em 2026-10-20: 186 testes passaram em 38 arquivos; lint e build passaram. O teste de validade cobre os três planos, com cobrança criada dois dias antes, acesso ausente enquanto pendente, mês completo contado da confirmação e replay preservando início/vencimento. Consulta remota confirmou a regra publicada e o cron ativo a cada minuto. A cobrança pendente existente continuava sem ativação. Isso não substitui o teste bancário pago ainda pendente.
