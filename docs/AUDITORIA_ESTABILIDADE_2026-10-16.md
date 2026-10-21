# Auditoria de estabilidade e integrações — 16/10/2026

Escopo: cópia `C:\Users\Administrator\Downloads\Vitrine360_V2_LIMPO_para_PC\vitrine360`. Foram usados três agentes com arquivos separados e as habilidades de depuração, Supabase, Cloudflare, Wrangler, Playwright e verificação. A cópia antiga em `Music\rverse` não foi alterada.

## Causas e correções

| Causa verificada | Correção |
| --- | --- |
| `indexedDB.open` sem tratamento de bloqueio por outra aba podia manter autosave pendente indefinidamente. | Erro acionável em `onblocked`, limite de abertura de 15 segundos, fechamento de conexões tardias e em `versionchange`; fechamento em falhas síncronas. |
| Frontend usava `content_revision` e tabelas publicadas, enquanto a migração 0020 exige `edit_revision` e snapshot do dono. | Salvamento e confirmação de recibo usam revisão de edição; restauração usa `load_owner_tour`, incluindo rascunho, hotspots e MIME dos vídeos. |
| Cadastro mostrava confirmação de senha sem compará-la. | Validação antes da chamada de rede, compartilhada com recuperação de senha. |
| Preflight CORS de leitura externa era recusado no R2. | Exceção somente para leitura anônima `GET/HEAD /objects`; escrita, Authorization e outros endpoints continuam restritos. |
| Frontend sem `.env.local` e Vite na porta padrão não correspondiam ao servidor e ao CORS existentes. | Configuração local com chave pública, R2 existente e porta fixa 5188; nenhum segredo de servidor no frontend. |
| Exclusão tentava remover mídia ainda referenciada; a 0020 bloqueia essa remoção. | RPC `retire_tour` faz bloqueio de projeto, autorização, retirada de metadados e registro da limpeza em transação. Arquivos vinculados a outros objetos são preservados. |
| Dois testes SQL ainda esperavam leitura direta de metadados por visitantes. | Testes usam o leitor público autorizado e conferem bloqueio das tabelas e ausência de campos privados. |
| Teste de autosave tentava abrir editor 3D removido do produto. | Cobertura ajustada aos três editores habilitados, preservando testes de saída, quota e recuperação. |

## Serviços existentes

Somente o Supabase `msovfbuhehaiousuzbwr` foi alterado. Foram aplicadas as migrações de vitrines, modelos adicionais, separação de rascunhos 0020 e `20261016203041_atomic_tour_retirement.sql`. O histórico legado anterior está no instalador do projeto; não interpretar a lista inicialmente vazia do MCP como banco vazio nem reaplicar a migração inicial.

Uma transação remota temporária verificou salvar rascunho próprio, os modelos `jewelry_luxury` e `auto_premium`, invisibilidade do rascunho para outro dono e negação de acesso anônimo. A transação foi revertida, incluindo o usuário de teste; nenhum arquivo foi enviado.

Outra transação temporária verificou `retire_tour`: negação para outra conta, despublicação preservando o rascunho, exclusão pelo dono e ausência de permissão anônima. Usuário e projeto da fixture foram revertidos; os dados existentes do usuário não foram usados como teste.

O Worker existente recebeu a correção CORS. Versão `62b398ee-9de2-4610-bec8-a8fafe470dd1`, anterior para rollback `f2d8d4a5-2055-4635-baa6-b8b9f0e568fc`. Fonte anterior comparada antes da publicação e settings/bindings preservados. Verificações remotas: Range público 204, preflight de escrita e Authorization externos 403, preflight de upload local 204 e health 200. O health não comprova login ou upload de arquivos.

`npm run integrations:check` executa verificações sem criação de contas ou mídia: Auth, leitores públicos, proteção do leitor de rascunhos e origem local do gateway.

## Evidências

- `tests/projectStore.test.ts`: bloqueio, timeout, fechamento tardio, troca de versão e falhas síncronas.
- `tests/cloudProjectPublication.test.ts` e `tests/cloudProjectRestore.test.ts`: revisão, recibo perdido, snapshot privado e vídeo.
- `tests/cloudProjectDeletion.test.ts` e `tests/tourRetirementMigration.test.ts`: contrato de retirada, propriedade, referências, preservação de objetos e rollback.
- `tests/r2Gateway.test.mjs` e `tests/r2GatewayRuntime.test.mjs`: CORS e runtime workerd/R2/SQL.
- `tests/run-browser-runtime-recovery.mjs`: Chrome real, duas abas bloqueando upgrade, recuperação da escrita e cadastro divergente sem requisição.
- `tests/run-browser-storefront.mjs`: persistência e giros locais reais; leitura pública simulada.

Validação final: **145 testes em 31 arquivos passaram**, sem falhas, com `npm test -- --maxWorkers=1 --no-file-parallelism --testTimeout=30000`. `npm run build`, `npm run lint` (sem alertas), `npm run worker:check` e as seis verificações de `npm run integrations:check` passaram. Os testes Chrome de recuperação entre abas/cadastro, vitrine e autosave dos três editores habilitados também passaram. Durante alterações concorrentes, uma execução antiga de autosave falhou; duas execuções isoladas posteriores passaram. Navegação desse teste agora aguarda o DOM e os controles necessários, sem depender da conclusão de imagens externas.

## Limites

A fila de limpeza registra intenção; um executor administrativo ainda precisa conferir referências e confirmar cada exclusão física. Bytes e reservas não são liberados só porque o tour saiu da biblioteca. URLs diretas de arquivos legados em buckets públicos Supabase podem continuar acessíveis até a limpeza; o gateway R2 revalida a publicação nas leituras. Não houve migração automática de arquivos existentes.

Não foram repetidos login autenticado com upload real, e-mail de confirmação/recuperação, geração paga de IA ou faturamento. Funções de IA dependem das credenciais dos provedores; não foram inventadas nem ativadas novas assinaturas. O frontend permanece local; uma hospedagem pública precisa de sua própria origem no CORS.

O build mantém os avisos de chunks grandes. O auditor Supabase também aponta funções `SECURITY DEFINER` acessíveis (vários leitores públicos são intencionais), tabelas internas fechadas sem políticas de cliente e proteção de senhas vazadas desativada. Isso não foi tratado como autorização para abrir tabelas, remover leitores públicos ou alterar plano. Referências: [funções públicas privilegiadas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
