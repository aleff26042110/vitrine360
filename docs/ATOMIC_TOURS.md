# Publicação transacional de tours — incremento 2

Data: 12/10/2026. Parte do objetivo completo de SaaS, não conclusão das fases 4–9.

## Estado aplicado

`0019_atomic_tour_publication.sql` foi aplicada **somente** no projeto Supabase novo `msovfbuhehaiousuzbwr`, depois de conferir o histórico das 18 migrações anteriores. O projeto antigo não foi acessado. A migração não deve ser editada agora: seu SHA-256 está registrado no histórico remoto. Mudanças posteriores exigem outra migração.

O instalador grava um backup privado das definições de funções e restrições em `vitrine360_setup.migration_backups`, dentro da mesma transação. Não imprime credenciais e aceita senha somente por stdin sem eco, verificando TLS com a CA já provisionada. A conexão ao projeto antigo não pode ser escolhida por argumento ou variável de ambiente.

## Mudança de comportamento

- Novos uploads usam revisão UUID no caminho em R2 **e** Supabase, com `upsert: false`; uma nova tentativa não sobrescreve arquivos da versão anterior.
- O frontend consulta a revisão atual, prepara os arquivos privados/públicos e chama uma única `commit_tour_revision`.
- A RPC valida dono, manifesto, caminhos da revisão, mídia disponível e destinos de pontos. No R2 exige registro pronto com os mesmos bytes/MIME; no Supabase legado verifica a existência do objeto. Isso ainda não é inspeção binária de codec/dimensões no servidor.
- Linha do projeto bloqueada e revisão esperada impedem que duas publicações normais do novo fluxo se sobrescrevam silenciosamente. Revisão + digest SHA-256 identificam a mesma tentativa e rejeitam reutilização com outro conteúdo.
- Cenas e hotspots são atualizados mantendo IDs. A unicidade de posição é adiada dentro da transação para permitir reordenação sem apagar as cenas; referências de métricas são preservadas.
- Troca de cenas, pontos, seleção inicial e publicação ocorre em transação. Uma falha de restrição no meio reverte tudo, mantendo a versão anterior.
- O leitor `/p/:id` chama `load_public_tour`: cenas e pontos vêm de um único snapshot, sem mistura de duas revisões. A RPC só retorna publicações públicas/não listadas ativas e não inclui os caminhos privados.
- Se o comprovante da operação se perder, o frontend confere revisão/status antes de reportar sucesso. Se essa conferência também falhar, preserva os arquivos e informa estado incerto.
- Mídia antiga é registrada na outbox `media_cleanup_queue` na própria transação. Falhas de staging registram suas próprias intenções de limpeza; não removem a versão anterior. A fila não concede ao cliente autorização para apagá-la ou manipulá-la diretamente.

## Métricas por conta

`account_storage_usage` consulta apenas o dono autenticado e distingue bytes registrados, confirmados, uploads pendentes e exclusões em andamento. Inclui contagem de objetos e registros de limpeza. O painel **Conta e cobrança** apresenta esses dados, atualiza sob demanda e oculta métricas ao sair da conta ou em erro.

A barra compara bytes confirmados com bytes registrados, **não uso de uma quota comercial**. Sem limite de plano configurado não se inventa uma porcentagem de plano. Os valores são do ledger R2: não incluem IndexedDB/buckets Supabase legados e não equivalem a uma consulta de faturamento ou inventário físico atual da Cloudflare.

## Evidência verificada

- SQL em PGlite com todas as 19 migrações: idempotência, reordenação, preservação de IDs/analytics, rollback após falha de embed, conflito de revisão, outra conta, mídia R2 não confirmada e métricas isoladas.
- Testes da aplicação: nenhum DML de projeto antes dos uploads; cópias imutáveis; uma RPC; staging malsucedido; recibo perdido confirmado/não confirmado; conflito; draft privado; snapshot público e formato inválido.
- `scripts/verify-atomic-tour.mjs` executado no **PostgreSQL remoto real**, com papéis authenticated/anon e senha via stdin: receipt idempotente, falha de restrição revertida, snapshot anônimo consistente e confirmação de rollback da fixture. Metadados de storage da fixture existiram apenas dentro da transação; não houve operação R2 ou arquivo real criado/removido.
- POST anônimo real a `load_public_tour` com UUID inexistente: HTTP 200/null. O teste não usou um projeto real do usuário como fixture.
- `run-browser-tour-navigation.mjs`: passou com o novo contrato null/snapshot.
- `run-browser-account-storage.mjs`: tela autenticada, dados/pendências distintos, refresh, erro sem falso zero, logout e larguras 1440/375/844. Transporte simulado integralmente; não é uma verificação de fatura real.
- Suíte local: 114 testes em 25 arquivos passaram; testes focados de armazenamento repetidos após corrigir a saída da sessão. Lint sem alertas e build aprovado; aviso de chunks grandes continua.

## Limites conhecidos e próximas ações

1. **Executor da outbox ainda não implementado.** Arquivos antigos continuam registrados/contabilizados; não liberar espaço por timeout. Próxima migração precisa conferir referências atuais, estados/leases do R2 e resultados incertos antes de apagar ou liberar quota.
2. Fila de staging precisa separar intenção sem arquivo de objeto efetivamente reservado e restringir registros a recursos conhecidos; não interpretar toda linha da fila como prova de arquivo físico.
3. A proteção de concorrência cobre os clientes do novo fluxo. Writes diretos/legados não incrementam revisão automaticamente. Integrar suas regras antes de prometer autoridade total do domínio ou cotas.
4. Salvar draft ainda conserva a semântica antiga: ao confirmar um draft do mesmo tour publicado, o status passa para draft. Separar snapshot publicado do rascunho de edição é necessário para um fluxo SaaS com publicação contínua; não chamar esta entrega de versionamento completo.
5. A nova RPC pública respeita visibilidade privada. As políticas públicas antigas e a autorização de mídia no gateway ainda precisam ser alinhadas com essa visibilidade antes de afirmar isolamento de conteúdo em todas as interfaces.
6. Falta contabilização Supabase legado e recursos por vitrine/item, reservas/cotas por plano, gerenciador de limpeza/administração e implantação do frontend.
7. Nenhum número comercial/preço novo foi definido. As tabelas do domínio comercial e os sete layouts continuam no objetivo completo.

As skills de OWASP orientaram a autorização no servidor e o tratamento de resultados incertos; React/UX orientaram a apresentação de dados reais e estados de sessão. Referências: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).
