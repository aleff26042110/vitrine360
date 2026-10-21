# Integração R2 — estado e requisitos

## Correção publicada em 2026-10-16

Corrigido o preflight CORS de leituras públicas em `/objects`. O gateway permitia `GET/HEAD` anônimo de origem externa, mas recusava seu `OPTIONS`, impedindo requisições de navegador com `Range: bytes=-16`. Ranges de sufixo exigem preflight conforme o [padrão Fetch](https://fetch.spec.whatwg.org/#cors-safelisted-request-header). A exceção agora cobre apenas `GET/HEAD` com `Range`/`Content-Type`; `Authorization`, escrita e outros endpoints continuam restritos às origens configuradas. A autorização de publicação continua sendo executada no banco a cada leitura.

Regressão reproduzida antes da alteração (403 em vez de 204), com cobertura HTTP e no runtime workerd/R2/SQL: 15 testes passaram e `npm run worker:check` passou. Publicada no Worker existente pela conexão MCP Cloudflare, versão `62b398ee-9de2-4610-bec8-a8fafe470dd1`, deployment `aa49fbfc-b4c1-45de-bbd6-37c593e5561b`, em 100%. A fonte anterior foi comparada com o baseline local antes da publicação. Os cinco bindings foram herdados por nome, sem obter o valor do segredo; a releitura confirmou todos os settings preservados, exceto a anotação descritiva do deploy. Nenhum bucket ou recurso novo foi criado.

Verificação HTTP remota: preflight público de Range 204; preflight externo de escrita e de Authorization 403; preflight de upload na origem local configurada 204; health 200. Isso verifica configuração e CORS, sem declarar teste remoto de login, banco ou upload de mídia nesta execução. Rollback: versão anterior `f2d8d4a5-2055-4635-baa6-b8b9f0e568fc`; snapshot dos settings e código anterior em `.tmp-ui/r2-cors-20261016-rollback.json` e `.tmp-ui/r2-cors-20261016-previous-worker.mjs`.

## Infraestrutura verificada em 2026-10-11

- Conexão OAuth Cloudflare disponível ao agente.
- Bucket `vitrine360-media` criado na classe `Standard`.
- Acesso `r2.dev` desativado; nenhum domínio personalizado conectado.
- Nenhum arquivo do usuário enviado ou migrado.
- O adaptador R2 está ativo no `.env.local` para novos uploads de tours, giros com duas vistas e modelos. Arquivos antigos continuam no provedor original.
- Gateway publicado: `https://vitrine360-media-gateway.vitrine360-654558de.workers.dev`. Binding privado `vitrine360-media`, segredo `SUPABASE_SERVER_KEY` criptografado na Cloudflare, origens locais `127.0.0.1:5188` e `localhost:5188`.
- Verificação real com conta temporária: login Supabase, multipart de 9 MiB em duas partes, download SHA-256, range público 206, revogação após despublicar, giro de veículo com duas vistas, GLB e aborto de multipart. Arquivos e conta temporária removidos; reserva de espaço voltou ao valor inicial. Tombstones sem reserva permanecem por segurança.
- O arquivo de 9 MiB era uma fixture de transporte, não um vídeo reproduzível. Esta verificação não comprova reprodução de vídeo 360 nem o fluxo completo pela interface do navegador.
- Após ativação: 75 testes em 15 arquivos passaram, lint e build passaram, assim como o empacotamento do Worker. O build mantém o aviso conhecido sobre chunks maiores que 500 kB.

## Separação obrigatória do Supabase

O usuário informou que já possui um projeto antigo, cujo nome lembra “Josi”. Esse projeto deve permanecer intacto: não vincular o aplicativo a ele, não aplicar migrações, não alterar autenticação, buckets ou políticas e não remover dados. Criar um projeto separado chamado `Vitrine360`, no plano gratuito, verificando a disponibilidade antes de confirmar sua criação. Não fazer upgrade pago para contornar limites de projetos.

O usuário confirmou que o projeto `msovfbuhehaiousuzbwr` é novo e separado do “Josi”. Sua URL e chave pública foram configuradas no `.env.local`, com backup prévio local. A verificação real de `GET /auth/v1/settings` retornou HTTP 200, com login por e-mail habilitado. A chave anterior enviada pelo usuário foi rejeitada e não foi salva.

Após autorização explícita, foi realizada conexão administrativa direta somente a `db.msovfbuhehaiousuzbwr.supabase.co`, com TLS e hostname validados usando os certificados oficiais do Supabase CLI. A inspeção confirmou ausência de tabelas públicas antes da aplicação. A senha foi transmitida por stdin sem eco e usada somente em memória, sem persistência no código, configuração ou logs; continua recomendada sua troca por ter sido enviada no chat.

As 17 migrações foram aplicadas em uma transação, com digests registrados no schema privado `vitrine360_setup`. A verificação remota confirmou 18 tabelas públicas com RLS. Repetir o instalador confirmou os digests sem reaplicar mudanças. A API respondeu HTTP 200 para consultas vazias a `projects`, `scenes`, `product_spins` e `showcase_publications`; o registro interno `r2_gateway_objects` recusou acesso público (401 / `42501`). A rotina administrativa do gateway também nega execução a `anon` e `authenticated`.

O instalador `scripts/setup-new-supabase.mjs` fica preso à referência nova, exige `--apply` para alterações e recusa tabelas desconhecidas. Foi fixado `pg` 8.23.1 como dependência de desenvolvimento, com backups prévios dos manifestos em `*.db-setup-backup-20261011.local`. Certificados públicos em `.tmp-ui/supabase-root-ca.local.pem`: [CA 2021 oficial](https://github.com/supabase/cli/blob/develop/apps/cli-go/internal/gen/types/templates/prod-ca-2021.crt) e [CA 2025 oficial](https://github.com/supabase/cli/blob/develop/apps/cli-go/internal/gen/types/templates/prod-ca-2025.crt). Nenhum certificado foi instalado no sistema e a validação TLS não foi desativada.

A chave de servidor foi recebida e transferida diretamente para o segredo criptografado do Worker, sem salvá-la em arquivo local ou frontend. Login e operações remotas foram verificados com uma conta de teste, sem envio de e-mail. Como senha e chave de servidor foram compartilhadas no chat, recomenda-se substituí-las; inserir a substituição por arquivo protegido/entrada sem eco, não no chat. Não revogar a chave atual antes de atualizar o Worker e verificar a substituição.

O arquivo `.tmp-ui/supabase-new-project-setup.sql`, preparado anteriormente para aplicação manual, permanece como artefato local ignorado. Não é necessário executá-lo agora: as migrações já foram aplicadas diretamente. As fontes oficiais continuam em `supabase/migrations/`. A aplicação do banco não significa que login, publicação e R2 tenham sido verificados de ponta a ponta.

## Worker publicado e verificado

`cloudflare/worker.mjs` usa o binding privado `MEDIA_BUCKET` e a rotina SQL abaixo. O Wrangler 4.149.0 está instalado localmente e fixado no lockfile; não foram alterados Node.js ou npm. Backups dos manifestos anteriores estão nos arquivos locais `package.json.cloudflare.local` e `package-lock.json.cloudflare.local`.

Endpoints:

- `POST /uploads`: usuário verificado no Supabase, reserva de espaço e criação de multipart.
- `PUT /parts`: partes de 8 MiB (última menor), tamanho exato por streaming e operação exclusiva por arquivo.
- `POST /complete`: manifesto ordenado, ETags e confirmação do tamanho real antes de marcar como pronto.
- `GET/HEAD /objects`: autorização antes de acessar R2, respostas parciais para vídeos e `no-store` para não contornar despublicação por cache.
- `DELETE /objects`: aborta multipart incompleto, remove o objeto e só depois libera a reserva. Falhas preservam o registro para reconciliação.
- `GET /usage`: uso agregado, somente após login. `GET /health` informa presença de configuração, sem declarar validação remota do banco.

Os parâmetros `bucket`, `path` e `part` são passados pela query nos endpoints de partes/objetos; `/uploads` recebe `bucket`, `path`, `size` e `type` no JSON. O cliente nunca recebe a chave de servidor nem escolhe o proprietário de uma operação.

`cloudflare/wrangler.jsonc` mantém o binding local (`remote: false`) para testes e exige `SUPABASE_SERVER_KEY` como segredo. URL e chave pública do projeto novo estão preenchidas; empacotamento e tipos foram verificados. A publicação via API Cloudflare utiliza o bucket real e preserva o segredo em atualizações. Falta definir domínio/origens de produção quando o frontend for hospedado. Não adicionar o segredo ao JSON.

Validações locais: testes de fronteira HTTP com bindings simulados; empacotamento `npm run worker:check`; geração de tipos `npm run worker:types`; inicialização real no workerd via Wrangler local, verificando respostas 503 sem configuração e 403 para origem não permitida. O teste de runtime descobriu e permitiu corrigir uma exportação inválida que os testes Node não detectavam. A verificação remota está registrada acima.

`tests/r2GatewayRuntime.test.mjs` executa o Worker de produção em workerd com o binding R2 local e todas as migrações SQL em PGlite. Os três testes verificam upload de 9 MiB em duas partes, integridade SHA-256 após download, publicação/despublicação pelo banco, range de vídeo, exclusão, aborto de multipart incompleto e rejeição por cota/tamanho. Apenas o transporte HTTP e a autenticação Supabase são simulados; não há credenciais reais, fallback de rede nem acesso ao bucket da conta. O runtime é encerrado ao terminar.

Esse teste revelou que comprovantes de partes R2 não devem ser tratados como hashes MD5. Cliente e Worker agora preservam ETags como strings opacas, conforme o contrato da [API R2UploadedPart](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#r2uploadedpart). Isso evita rejeitar uploads válidos apenas pelo formato do comprovante.

Miniflare `5.20261006.1-alpha`, a mesma versão já utilizada pelo Wrangler fixado, foi declarado como dependência de desenvolvimento direta para o teste. Não houve upgrade de Node/npm/Workers. Backups locais dos manifestos antes dessa declaração: `package.json.runtime-test-20261011.local` e `package-lock.json.runtime-test-20261011.local`. A configuração do harness segue o schema instalado dessa versão; exemplos antigos de configuração do Miniflare não são usados.

Comandos locais:

```powershell
npm run worker:dev
npm run worker:check
npm test -- tests/r2Gateway.test.mjs tests/supabaseMigrations.test.ts
npm test -- tests/r2GatewayRuntime.test.mjs tests/cloudStorage.test.ts
```

### Registro SQL

`0016_r2_gateway_ledger.sql` prepara o registro de arquivos, reservas e operações. Foi aplicado ao projeto novo junto com `0017` e está conectado ao Worker publicado.

- Capacidade conservadora: 8.000.000.000 bytes, contando uploads incompletos e limpezas pendentes.
- Limites por mês UTC: 500.000 leituras e 10.000 escritas. São limites internos deste aplicativo, não limites de cobrança da conta Cloudflare.
- A reserva e os contadores usam uma linha compartilhada com bloqueio transacional, não estado do navegador ou de um processo.
- Apenas `service_role` pode executar a rotina. A credencial de servidor deverá ficar em um segredo do Worker, nunca no frontend.
- Operações mutáveis usam um identificador exclusivo. Operações interrompidas não expiram automaticamente nem liberam espaço por suposição.
- Leitura anônima só é autorizada para um arquivo finalizado vinculado à publicação ativa do próprio proprietário. Despublicar retira essa autorização.
- Caminhos excluídos permanecem registrados e não são reutilizados; isso evita que uma repetição atrasada recrie um arquivo já removido.

`0017_r2_publication_paths.sql` preserva caminhos Supabase anteriores e exige arquivos R2 finalizados e registrados para o usuário correto antes de associá-los a cenas ou publicar giros/modelos. Também confere tamanho e MIME na publicação de objetos.

Validação local: nove testes de migrações e políticas SQL passaram em PGlite, incluindo bloqueio de ações pelo cliente, propriedade, cotas, identidade de operação, tamanho final e publicação/despublicação. Operações de autenticação, arquivos e publicação também foram verificadas no Supabase remoto/R2 real. Limites de capacidade não foram artificialmente reduzidos no projeto remoto para testes.

## Cliente implementado

`src/cloudStorage.ts` faz upload R2 em partes sequenciais de 8 MiB, valida os comprovantes e preserva registros quando o resultado é incerto. Caminhos novos usam o prefixo `r2:`; arquivos Supabase anteriores continuam sendo lidos/excluídos pelo provedor original, independentemente da configuração dos novos uploads. Tours usam revisões imutáveis no R2 para não sobrescrever um arquivo em uso. O limite de arquivo é 500 MiB no R2 e 50 MiB no Supabase gratuito.

Somente após a configuração remota, preencher em `.env.local`:

```dotenv
VITE_MEDIA_STORAGE=r2
VITE_R2_GATEWAY_URL=https://ENDERECO-REAL-DO-WORKER
```

Não usar uma URL de exemplo como configuração válida. A credencial de servidor fica exclusivamente nos segredos do Worker.

## Pendências e reprodução dos testes

1. Concluído: migrações, segredo criptografado, Worker publicado e R2 ativo no frontend local. O projeto antigo não foi acessado. Backup da configuração antes da ativação em `.env.r2-activation-backup-20261011.local`.
2. Verificar cadastro com confirmação por e-mail e os fluxos pelo navegador com arquivos reais do usuário. A conta do teste administrativo era temporária e confirmada sem envio de e-mail.
3. Antes de hospedar o frontend, definir sua URL e adicioná-la às origens permitidas do Worker. Não migrar arquivos antigos automaticamente.
4. Implementar reconciliação administrativa para operações interrompidas. Até lá, reservas com resultado incerto ficam preservadas; não liberar espaço apenas pela passagem do tempo.

`node scripts/check-live-r2.mjs --live` reproduz o teste remoto. A chave de servidor é recebida exclusivamente por stdin sem eco, mantida em memória e nunca impressa. O script cria uma conta temporária e remove apenas os próprios arquivos/conta; em falha de limpeza, informa identificadores para reconciliação e preserva a conta para recuperação. Não incluir credenciais em argumentos do comando.

## Custos e limites

O R2 é cobrado por uso. A franquia gratuita Standard não constitui um teto de gastos. Alertas de orçamento não bloqueiam operações. Um limite conservador de espaço no aplicativo, isoladamente, não impede cobranças por leitura/escrita ou por outros recursos da conta. Os controles acima estão ativos no banco remoto e no gateway; não são um teto de cobrança da conta Cloudflare inteira. Nenhum plano pago adicional foi ativado.

Referências: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/), [Workers R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
