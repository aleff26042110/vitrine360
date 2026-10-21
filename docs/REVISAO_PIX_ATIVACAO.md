# Revisão da ativação Pix — 2026-10-20

Escopo: emissão de cobranças Pix dos planos, sem cartão. Orders API online; conta brasileira e método Pix ativo verificados.

## Segurança local

| Verificação | Resultado e evidência |
| --- | --- |
| Credenciais somente no servidor | Segredos da Edge Function; nenhum token no frontend ou código fonte |
| Arquivos locais ignorados | `.env.local`, `.tmp-ui` e `.dev.vars*` no `.gitignore` |
| Assinatura do webhook | HMAC-SHA256 via Web Crypto em `cloudflare/pix.mjs` |
| Valores confiáveis | IDs de oferta no navegador; valores definidos em servidor/SQL |
| Confirmação no servidor | Consulta `/v1/orders/:id` e validação de referência, valor, método e estado creditado |
| Idempotência | UUID persistido da invoice, mesmo corpo/e-mail e X-Idempotency-Key nos reenvios |
| Referência externa | UUID da invoice em toda emissão |
| Separação de credenciais | Importada somente a credencial de produção da aplicação escolhida; nenhuma credencial de usuário de teste no serviço |
| URL de checkout obsoleta | Nenhuma referência a sandbox_init_point no adapter Pix |

Controles adicionais: conta/e-mail verificados, RLS, RPC de escrita restrita, limite de tentativas, uma invoice pendente por conta, concessão mensal única, limites de itens e armazenamento no backend. Consultas remotas verificaram tabelas e triggers; advisors de segurança não apontaram os novos objetos billing.

## Evidências e limites

Emissão real na API criou QR Code e imagem de R$ 19,90; cancelamento imediato respondeu HTTP 200. Não houve transferência. Evidência filtrada em `.tmp-ui/pix-activation-receipt.json`, sem token, e-mail ou código pagável.

Interface verificada em Chrome com transporte simulado em 320/375/1440px; cenários pendente/confirmado/copia e cola. Autenticação e confirmação bancária completas ainda precisam ser acompanhadas na primeira transação de um usuário autenticado. Não usar sessão administrativa para impersonar usuário como teste.

Webhook registrado, mas `notifications_history` retornou ausência de eventos. Há polling autenticado e recuperação periódica no servidor, agora publicada e verificada com HTTP 202 e consulta de invoice pendente. Tickets de uso único, curtos, protegem a execução do agendador; o segredo reutilizável não trafega pela fila pg_net. Não afirmar que entrega externa do webhook ou confirmação bancária paga foi comprovada.

## Revisão oficial

`quality_checklist(application_id=6583777378117136)` retornou `Product not homologable`, sem critérios. `quality_evaluation` não se aplica ao fluxo exclusivamente Orders. Nenhuma homologação oficial foi declarada.

Skill: `mercadopago:mp-review` v1.0.0. Segurança local 9/9; qualidade oficial N/A. Veredito: emissão habilitada e verificada; ciclo bancário de confirmação e entrega externa ainda sem comprovação de uma transação paga.
