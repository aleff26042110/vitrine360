# Vitrine360 — diagnóstico e plano de evolução SaaS

Data: 12/10/2026. Etapa 1, anterior à implementação do novo SaaS.

Este documento preserva o diagnóstico inicial. As alterações posteriores e a cobertura dos 31 requisitos estão em [Implementação incremental](IMPLEMENTACAO_SAAS.md).

## Escopo e limites da auditoria

Leitura da arquitetura, módulos de mídia/publicação, autenticação, administração, perfil público, migrações e testes. Execução dos testes locais, lint, build, auditoria das dependências de produção e cenário de vídeo 4K em navegador isolado. Consulta somente de leitura às configurações do Worker e aos acessos públicos do bucket R2.

Nenhuma alteração de código de aplicação, migração, implantação, conta, assinatura ou arquivo de usuário foi feita nesta etapa. O projeto Supabase antigo não foi acessado. O estado do esquema Supabase descrito abaixo é o das migrações do repositório, não uma nova inspeção SQL do banco remoto. Verificações remotas anteriores estão documentadas em `R2_SETUP.md` e `ADMIN_SETUP.md`; não foram repetidas aqui.

Não há ferramentas de trace/Lighthouse expostas nesta sessão. Não foram medidos Core Web Vitals de produção, FPS em telefone físico, qualidade perceptual de produtos reais ou médias de consumo comercial. Teste sintético não representa relógios, unhas, joias ou veículos reais.

O pedido anterior retirou objeto/modelo 3D e reconstrução da interface. Isso permanece assim: rotas de criação ocultas/removidas, componentes e dados legados preservados. A publicação pública legada GLB ainda tem leitor. Reativar criação GLB é uma decisão de produto separada; esta auditoria não a reativa.

## 1. Arquitetura atual

| Camada | Implementação atual | Uso na evolução |
| --- | --- | --- |
| Aplicação | React 19, TypeScript, React Router, Vite; dashboard/editor de tour em `App.tsx` | Manter stack, extrair componentes apenas onde houver necessidade real |
| Mídia | `creationTools.tsx`, `spinExtraction.ts`, `sceneMedia.ts`, hooks de interação | Preservar edição/importação; evoluir o spin existente |
| Persistência local | IndexedDB, `projectStore.ts`, `useLocalAutosave.ts`, backups `.v360` | Preservar rascunhos, serialização, retry, backup e identidade dos arquivos |
| Conta e metadados | Supabase Auth, PostgreSQL, RLS, RPCs | Continuar como fonte de identidade e autoridade |
| Arquivos remotos | `cloudStorage.ts` → Worker → R2 privado; suporte a arquivos Supabase legados | Estender contratos e ledger, sem migração automática de arquivos antigos |
| Publicação | `cloudProjects.ts`, `cloudShowcases.ts`, `/p/:id`, `/showcase/:slug`, `/u/:slug` | Reusar experiências públicas e criar camada comercial leve |
| Administração | `AdminPage.tsx`, `siteAdministration.ts`, RPCs da migração 0018 | Ampliar a autoridade de servidor já existente, não depender do menu |

Não há necessidade de Next.js, outra aplicação por segmento ou troca de banco. Three.js permanece necessário para vídeo 360 e conteúdo legado, mesmo com as ferramentas de criação 3D retiradas.

## 2. Funcionalidades existentes

- Tours com cenas de imagem e vídeo, projeção plana/equiretangular, hotspots de passagem/informação, cena inicial, orientação norte, retorno automático, preview, tela cheia e compartilhamento.
- Product Spin/Vehicle Spin compartilham editor, extração, reprodução, gesto e publicação. Vistas lateral e superior, recorte do vídeo, perfis de qualidade, quadros ordenáveis/removíveis, cancelamento e exportação HTML offline.
- Biblioteca com coleções locais, busca, duplicação, backups, lixeira de tours e armazenamento local.
- Login, cadastro, recuperação de senha, perfil público opt-in e administração com permissão validada no servidor.
- Plantas baixas e Skybox continuam acessíveis; geração por fornecedor externo depende da integração/credenciais. Não foi executada geração paga.
- O perfil público atual oferece nome, bio e site. Ainda não é uma loja/portfólio com banner, logo, WhatsApp, itens e templates.

## 3. Product Spin e processamento

O cliente seleciona um vídeo ou fotos. Vídeo é decodificado no navegador e amostrado por seek em intervalos uniformes. Os quadros são desenhados em canvas e codificados em JPEG. O original fica em memória/URL local durante a importação; não é enviado ao R2 pelo fluxo de spin.

Perfis atualmente existentes, não novas recomendações de limite:

| Perfil | Maior lado de saída | Qualidade JPEG solicitada | Quadros finais |
| --- | --- | --- | --- |
| Leve | até 1280 px | 0,85 | 24–48 |
| Equilibrada | até 1920 px | 0,92 | 48–96 |
| Ultra | até 3840 px | 0,96 | 120 |

A contagem depende do perfil e do intervalo selecionado, não do FPS original. Não há detecção de nitidez, descarte de duplicatas ou seleção angular inteligente. Vídeos com poucas imagens distintas podem produzir quadros repetidos, inclusive no Ultra. Resolução nunca é ampliada além do original.

Miniaturas de vídeo são produzidas no mesmo canvas em até 256 px. Fotos originais são mantidas sem recompressão, com miniaturas separadas. WeakMap evita repetir trabalho para o mesmo objeto File, mas isso não é um cache persistente nem um conjunto remoto de resoluções adaptativas.

Importação possui AbortController, timeout, validação de codec/dimensões e progresso percentual. A sequência anterior só é trocada depois do sucesso. `finally` libera vídeo, canvas e URLs. Ainda faltam estados distintos para leitura, extração, otimização e salvamento; a publicação informa envio de forma genérica.

## 4. Upload e retenção

Há limites atuais no código: vídeo de spin até 500 MiB; entrada até 8192 px por lado/33,5 MP; até 120 imagens por vista; publicação exige 2–120 quadros por vista e até 500 MiB no conjunto. São valores herdados, não limites comerciais recomendados nesta auditoria.

Frames finais são salvos em IndexedDB e só são enviados à nuvem na publicação. O upload R2 é multipart sequencial, em partes de 8 MiB. Há tamanho exato, comprovantes e confirmação de conclusão. Caminhos `r2:` distinguem o provedor; arquivos antigos continuam usando seu provedor original.

Não implementar uma limpeza de vídeos originais do R2 para spin como se já existisse esse armazenamento. O fluxo atual não acumula original + frames brutos + finais na nuvem. Se houver processamento remoto futuro, incluir estados persistidos, confirmação, retenção e reconciliação antes de excluir originais.

O Worker valida tamanho, MIME declarado, identidade e publicação. Não decodifica o vídeo para verificar duração/resolução reais, nem faz inspeção completa do conteúdo binário pelo tipo declarado. Com o vídeo original exclusivamente local, o backend não pode comprovar sua duração: essa regra só poderá ser garantida se o servidor tiver acesso à mídia e a um validador confiável. Não tratar metadados enviados pelo navegador como prova.

## 5. Viewer e qualidade pública

`PublicShowcase.tsx` carrega um manifesto e exibe o quadro atual. Pré-carrega quatro vizinhos, não a sequência inteira de propósito. Troca de vista preserva proporcionalmente o ângulo e redefine zoom. Há mouse/touch de um ponteiro, distinção horizontal/vertical, inércia, teclado, pausa e tela cheia. A reprodução respeita visibilidade da página/elemento.

O zoom público de spin é escala CSS entre 0,6 e 2; não oferece pinch ou pan detalhado. Não há variantes preview/normal/alta nem escolha por densidade de pixels. Girar para um quadro ainda não decodificado pode comprometer a fluidez; falta um cache de imagens pronto para troca com orçamento de memória explícito.

O mesmo arquivo final é usado para detalhe e interação. Isso preserva qualidade do arquivo disponível, mas não resolve fontes de baixa nitidez. Não converter tudo para WebP/AVIF ou aumentar JPEG indiscriminadamente sem comparar detalhes reais.

## 6. Performance e gargalos

1. R2 responde `Cache-Control: no-store` e valida publicação em cada leitura. O preload recria/cancela vizinhos a cada quadro. Isso limita cache HTTP reutilizável e pode aumentar requisições. Não remover a proteção sem desenhar revogação e cache autorizado.
2. Extração e codificação sequenciais ocorrem no dispositivo do cliente. Ultra e vídeos grandes precisam de medição de tempo, memória e temperatura em celulares reais; o teste 4K de desktop não prova viabilidade mobile.
3. Falta política explícita de imagens decodificadas, prioridades e recuperação de falha de um frame no viewer. Priorizar nitidez do quadro mostrado e carregar o necessário ao redor.
4. Build atual: chunk principal cerca de 640 kB/188 kB gzip; Three.js cerca de 736 kB/187 kB gzip; CSS principal cerca de 147 kB/29 kB gzip. São tamanhos do build, não tempo de carregamento. Há imports dinâmicos, mas o conjunto inicial ainda merece investigação.
5. Na nova página `/loja/:slug`, carregar somente manifesto comercial e capas. Não montar viewers, importar motor 3D ou baixar sequências de todos os produtos na grade.

## 7. Armazenamento e estado remoto confirmado

Consulta Cloudflare de somente leitura confirmou o Worker `vitrine360-media-gateway`, binding para `vitrine360-media`, segredo com tipo `secret_text` e projeto novo `msovfbuhehaiousuzbwr`. O R2 está sem r2.dev público e sem domínios diretos. As origens de escrita continuam somente localhost/127.0.0.1:5188.

O ledger possui teto global de 8.000.000.000 bytes reservados, 500.000 leituras e 10.000 escritas mensais. Esses são controles atuais do aplicativo, não teto financeiro da conta. Não há cotas comerciais por usuário/plano nem atribuição completa por vitrine/item. Admin mostra reserva global, incluindo envios/limpezas pendentes — isso não equivale a uma medição atual do espaço físico faturado pelo R2.

Tours publicados guardam cópias privada e pública da mídia. Para spins, o fluxo de publicação envia o conjunto final público, não o vídeo de entrada. Na evolução, as capas/adaptativos precisam de contabilização e identidade próprias.

## 8. Banco existente e extensão proposta

As 18 migrações locais descrevem 19 tabelas públicas:

- Conta: `profiles`, `site_administrators`.
- Tours: `projects`, `scenes`, `hotspots`, `publications`, `floorplans`.
- Mídia/objetos: `media_assets`, `product_spins`, `product_spin_frames`, `models_3d`, `reconstruction_jobs`, `showcase_publications`.
- Comercial/métricas: `subscriptions`, `usage_events`, `analytics_events`.
- Gateway: `r2_gateway_budget`, `r2_gateway_operations`, `r2_gateway_objects`.

`subscriptions.plan_key` hoje permite free/studio/teams, mas não há catálogo editável de planos com preço, limites e recursos. `usage_events` não constitui sozinho um mecanismo completo de cotas físicas e por item.

Extensões propostas, ainda NÃO aplicadas:

- `business_showcases`: dono, slug estável, segmento, template, paleta, informações comerciais, mídia de marca e estado de publicação.
- `showcase_items`: produto/trabalho/imóvel/veículo, capa leve, ordem, título, descrição, preço opcional e campos validados do segmento.
- Vínculos de experiência do item: referências tipadas a spin/tour/vídeo/GLB legado, com propriedade verificada; não salvar qualquer iframe/HTML arbitrário.
- Catálogos `business_segments`, `showcase_templates`, `showcase_palettes` e relações de compatibilidade. Template novo continua podendo precisar de código visual.
- `plan_definitions` + vínculo/versão do plano na assinatura; reservas de quota, referências de mídia e tarefas de limpeza/reconciliação conforme necessidade.

Migrações aditivas, testadas isoladamente, sem recriar tabelas existentes. Mudança de catálogo de planos deve preservar as assinaturas legadas e evitar redução destrutiva de conteúdo quando o plano mudar.

## 9. Segurança e integridade

**Proteções existentes:** RLS por proprietário; RPC de administração com tabela de membros protegida e `search_path` fixo; Worker valida o JWT através de Supabase Auth; segredo de servidor não vai para VITE; ledger só acessível por serviço; arquivos R2 privados e publicação verificada; parsers de URL e embeds restritos; confirmação e preservação de trabalho em falhas incertas. Testes locais cobrem acesso entre usuários e revogação administrativa.

**Pendências prioritárias:**

| Prioridade | Evidência/risco | Ação proposta |
| --- | --- | --- |
| Alta | `persistCloudProject` coloca tour em draft, remove metadados e publica por várias chamadas | Preparar revisão, validar mídia, trocar manifesto em transação e só então limpar versão anterior |
| Alta | Teto global, sem isolamento comercial de reservas por conta/plano | Reservar bytes/itens/vistas no backend em transação antes de aceitar upload/publicação |
| Alta | Falta reconciliação de leases e resultados incertos | Gerenciador de recuperação; nunca liberar quota apenas porque passou tempo |
| Alta | Credenciais foram compartilhadas anteriormente; rotação não comprovada nesta etapa | Rotacionar coordenadamente antes de produção; senha administrativa forte e verificar MFA |
| Média | MIME/duração/resolução não são completamente verificados pelo servidor | Validação real dos derivados e definir arquitetura para validar originais quando necessário |
| Média | Falha de cleanup de showcase pode ser capturada sem registro administrativo durável | Fila/outbox com retry, estado e detecção de referências antes de remoção |
| Média | Hosting público/CORS/autenticação de produção ainda não verificados em conjunto | Publicar frontend e testar origens, redirects, email, acesso anônimo e revogação |

Não foi identificado um bypass reproduzido de ownership nesta etapa. Isso não é certificação de ausência de vulnerabilidades. Limites por plano não podem existir só na UI; incluir todos os caminhos de escrita, inclusive arquivos Supabase legados. Um catálogo público deve expor só campos aprovados, sem permitir acesso a rascunhos, caminhos privados ou permissões de administração.

## 10. Exclusão e reutilização

Já há limpeza de revisões antigas de showcase, despublicação e exclusão de tour mantendo metadados até remover os arquivos. Respostas incertas são preservadas em parte dos fluxos. Falta visão administrativa e retry persistente para todos os casos.

Ao ligar um spin/tour a mais de um item, verificar referências antes de remover mídia. Retirar um item não pode apagar um arquivo usado por outro. Planejar unlink → registro de limpeza → verificação de referências → remoção → confirmação → liberação de quota. Não apagar conteúdo existente automaticamente ao atingir limite ou trocar plano.

Reutilizar: `cloudStorage`, ledger, Auth/RLS/admin membership, `projectStore`, autosave/backups, `extractSpinFrames`, miniaturas, `useSpinGesture`, `useSpinPlayback`, fullscreen, `PublicShowcase`, `PublicTour`, hotspots e componentes de perfil. O novo motor comercial deve ser separado desses viewers.

## 11. Plano incremental e critérios de aceite

1. **Auditoria (esta entrega):** baseline, limites de evidência, riscos e decisões. Sem implementação do novo SaaS antes de apresentar o diagnóstico.
2. **Viewer:** evoluir gesto existente com pinch/pan e controles acessíveis; separar quadro solicitado/exibido; preload e decode com orçamento de memória. Conservar nitidez e vistas. Aceite: testes de touch, entrada/saída de pinch, troca de vista, cancelamento e memória; medir aparelhos/conexões reais antes de prometer performance.
3. **Pipeline:** manter recorte/perfis e adicionar observabilidade por etapa; avaliar seleção de candidatos mais nítidos, duplicatas e codecs com vídeos representativos. Não armazenar todos os frames do vídeo. Não aprovar limites comerciais a partir da fixture estática.
4. **Armazenamento:** contabilização por proprietário/item/vitrine, reserva atômica, reconciliação e limpeza por referências. Proteger publicação de tours por revisão antes de ampliar o uso.
5. **Vitrine pública:** `/loja/:slug` e página individual de item; capas normais leves, WhatsApp com mensagem/link/preço, sem carrinho/checkout. Experiência pesada somente ao abrir item/acionar viewer.
6. **Motor configurável:** Segmento + Template + Paleta + Item + Viewer + CTA; dados comerciais separados da aparência. Um conjunto de componentes, não quinze aplicações. Introduzir Minimal/Beauty/Dark Premium/Luxury/Glass/Automotive/Real Estate por layouts reais, sem JSON arbitrário ou navegação 3D automática.
7. **Planos:** catálogo versionado e configurável, sem preços/cotas definitivos; backend aplica itens/bytes/vistas/recursos. Barra por conta precisa distinguir espaço confirmado, reservas e limpezas pendentes. Atingir limite bloqueia novas reservas, não destrói conteúdo.
8. **Administração:** RPCs seguras para catálogos, planos, compatibilidades e métricas; trilha de alteração e previews. Reusar a permissão atual, adicionar testes contra usuários comuns.
9. **Regressões em todas as fases:** testes automatizados, publicação/revogação, RLS entre donos, falhas de upload/limpeza e validação física em Android. Não deixar toda a verificação para o fim.

Antes de definir cotas/preços: reunir vídeos reais de segmentos representativos e registrar duração, dimensões, bytes do original, bytes finais por vista, tempo de processamento, duplicação/nitidez, memória e experiência de zoom. Reportar mediana e variação, não apenas um caso. Nenhum número comercial novo foi escolhido nesta etapa.

## 12. Verificações desta etapa

- `npm test`: 86 testes, 19 arquivos, passaram.
- `npm run lint`: sem alertas.
- `npm run build`: passou; avisos de chunks >500 kB mantidos.
- `npm audit --omit=dev --json`: zero vulnerabilidades reportadas nas dependências de produção consultadas. Não cobre toda a segurança do aplicativo nem todos os pacotes de desenvolvimento.
- `node tests/run-browser-spin-quality.mjs`: WebM sintético real 4K, Ultra/120, downscale Equilibrado, intervalo, miniaturas, cancelamento/entrada inválida, persistência e largura mobile passaram. Navegador isolado; não é uma captura comercial de produto ou Android físico.
- Cloudflare: três consultas GET ao Worker/R2; nenhuma mutação. Nenhum segredo foi retornado no relatório.

## Referências de infraestrutura

Manter R2 privado e não abrir o bucket inteiro para obter cache: [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/). Hospedagem do frontend requer configuração SPA para rotas profundas: [Workers Static Assets SPA](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/). Estender ownership no banco, não só esconder menus: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Estado: auditoria inicial entregue; fases de implementação 2–9 ainda não executadas nesta entrega. O produto SaaS completo não está pronto.
