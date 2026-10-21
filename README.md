# Vitrine360

## Minha Vitrine

A área `/minha-vitrine` permite a cada criador escolher modelo (Editorial, Galeria ou Showroom), paleta, cores próprias, tipografia, nome, apresentação e itens de objetos/veículos em 360°. A prévia é atualizada ao vivo e oferece enquadramento de computador ou celular.

O botão Visualização rápida abre as alterações atuais em tela inteira, sem exigir salvamento, login ou publicação. Voltar à personalização preserva essas alterações. Sem autenticação, o rascunho é salvo somente neste navegador; exemplos visuais não são publicáveis.

Para publicar, entre, selecione seus objetos/veículos em Itens 360° e clique Publicar vitrine. Os giros locais selecionados são validados e publicados pela própria vitrine, com progresso por item; não é necessário abrir cada editor. Publicações existentes são reutilizadas e uma falha parcial preserva os itens já publicados. O endereço público é `/v/:slug`. Administradores reconhecidos pelo servidor veem Administrador conectado; a publicação continua respeitando a propriedade dos itens.

O backend desta funcionalidade está em `supabase/migrations/20261016045827_personalized_storefronts.sql`, validada em PGlite e aplicada no projeto existente em 16/10/2026, junto da extensão de modelos `20261016150000_storefront_extra_templates.sql`. A migração cria rascunhos privados por dono, snapshots de publicação separados e leitura pública filtrada. Salvar rascunho não altera a versão pública existente. O isolamento entre contas foi verificado no banco remoto em transação revertida; publicação completa com arquivos reais não foi repetida nesta auditoria.

Verificações específicas:

```powershell
npx --no-install vitest run tests/storefront.test.ts tests/storefrontSecurity.test.ts
node tests/run-browser-storefront.mjs
```

O teste de navegador usa um contexto isolado, valida persistência e visualizadores locais reais, e simula somente a resposta RPC de leitura pública. Não comprova publicação no servidor. Capturas: `.tmp-ui/storefront`.

Aplicativo web para organizar tours panorâmicos, spins de produto, modelos 3D e plantas esquemáticas. Este é um projeto independente dentro da pasta do REA; o repositório pai não faz parte do produto.

## Executar localmente

Requer Node.js 20.19+ ou 22.12+.

```powershell
cd C:\Users\Administrator\Downloads\Vitrine360_V2_LIMPO_para_PC\vitrine360
npm install
npm run dev
```

Abra `http://localhost:5188`. A porta é fixa para coincidir com as origens autorizadas no gateway R2; se estiver ocupada, o Vite informa o conflito em vez de escolher uma porta bloqueada pelo CORS.

`npm run integrations:check` verifica Auth, leitores públicos, proteção dos rascunhos e CORS do gateway sem criar contas ou arquivos. A configuração fica em `.env.local`, ignorado pelo controle de versão, e contém somente a chave pública de cliente. O segredo de servidor permanece no Worker.

Para repetir o contrato de lixeira em Chrome/Windows com IndexedDB real, inicie `npm run dev -- --host 127.0.0.1 --port 5188 --strictPort` e execute `node tests/run-browser-trash.mjs` em outro terminal. O teste usa um perfil temporário, cria um projeto de teste e o remove ao terminar. Valida armazenamento, proteção contra salvamento antigo e os controles de remoção, restauração e exclusão definitiva do dashboard.

Para gerar a compilação de produção:

```powershell
npm run build
npm run preview
npm test
npm run lint
```

## Recursos implementados

- Landing comercial original em `/welcome`, responsiva, com apresentação das ferramentas e entrada direta para cadastro ou Studio.
- Dashboard responsivo em português, com navegação para tours, equipes, marketplace, comunidade, perfil, conta e relatórios.
- Relatórios de tours em `/reports`: totais, visitas do mês, série diária, entradas em cenas, cliques em hotspots e ranking por proprietário. Requer Supabase configurado com as migrações até 0010; não coleta IP ou identificador pessoal.
- Editor de tour com imagens e vídeos, panoramas equiretangulares 2:1 em Marzipano (imagens) ou Three.js (vídeos), cenas planas, miniaturas, ordenação, cena inicial e pontos interativos com título, descrição e link. A projeção pode ser corrigida por cena.
- Conexões entre cenas: selecione um ponto e escolha **Cena de destino**. Na prévia ou no visualizador, **Ir para…** abre o ambiente escolhido, inclusive cenas planas. Duplicar remapeia os destinos para a cópia; remover a cena limpa as conexões. A publicação/restauração inclui esses destinos e exige `0012_hotspot_scene_connections.sql`, que restringe conexões ao mesmo tour. Navegação local validada em Chrome com `node tests/run-browser-trash.mjs --connections`; serviço remoto ainda não validado.
- Extensão estimada de fotos por espelhamento de bordas, identificada como aproximação. Não reconstrói áreas que a câmera não capturou.
- Salvamento automático local de projetos, imagens e pontos em IndexedDB. Os arquivos permanecem no perfil deste navegador e não são sincronizados.
- Lixeira local na aba Lixeira: remover um tour preserva imagens e pontos; restaure ou exclua definitivamente com confirmação. A prévia local é desativada ao mover para a lixeira. A lixeira ocupa armazenamento até a exclusão definitiva.
- Duplicação local pelo dashboard: cria um rascunho independente com novos IDs, preserva cenas, arquivos e hotspots e remapeia a cena inicial. A cópia pode ser publicada separadamente.
- Exclusão definitiva local de giros, modelos e plantas pelo painel, com confirmação. Remove os arquivos somente deste navegador; cópias na conta e links publicados permanecem. Um registro mínimo de exclusão bloqueia salvamentos atrasados de outras abas. Plantas da conta podem ser baixadas novamente por uma restauração explícita. Fluxo, cancelamento e bloqueio de salvamento atrasado validados em Chrome com `node tests/run-browser-trash.mjs --objects --floorplan`.
- Prévia local de tour em `/p/:id`, com cenas, pontos, tela cheia e compartilhamento local. Ela só abre no mesmo perfil do navegador.
- Product Spin e Vehicle Spin: envie um vídeo MP4/MOV/WebM de uma volta ao redor do objeto ou veículo; perfis Leve (24–48 quadros, até 1280 px), Equilibrada (48–96, até Full HD) e Ultra (120, até 4K) preservam as proporções e nunca ampliam o original. Início/fim selecionam o trecho; cancelar ou uma falha mantém a sequência anterior. Quadros amostrados não garantem ângulos distintos quando o vídeo tem poucos frames. Sequências de imagens continuam aceitas, podem ser reorganizadas e publicadas.
- Publicação de Product Spin/Vehicle Spin por link público, com manifesto remoto, quadros ordenados, giro por arraste, teclado e zoom; despublicar remove as cópias públicas.
- Visualizador 3D para arquivos GLB com órbita, enquadramento e apresentação local. A validação limita o modelo a 150 MB, 2 milhões de triângulos e 32 MB de texturas embutidas, rejeitando dependências externas. Modelos também podem ser publicados por link com visualizador 3D público.
- Editor de planta esquemática: crie, mova, renomeie, redimensione e altere a cor dos cômodos. Selecione pelo quadro ou pela lista; ajuste posição e tamanho relativos ao quadro pelo painel. As setas movem 1 ponto percentual; Shift + seta move 5. O arraste mantém o ponto de captura e respeita as dimensões do ambiente. O salvamento local é automático. Com uma conta, use **Salvar na nuvem** para guardar uma planta privada; o painel lista plantas da conta e permite baixar e editar. Substituir uma cópia local exige confirmação. Requer a migração 0011; fluxo remoto ainda sem validação em staging. Não é uma planta automática nem uma reconstrução 3D.
- Login, cadastro e recuperação de senha por e-mail prontos para conectar a Supabase.
- Perfil de criador salvo na conta, privado por padrão e publicável por escolha do usuário em `/u/seu-endereco`.
- Com Supabase configurado, rascunhos podem ser salvos na nuvem, listados na conta e baixados de volta para o navegador para continuar a edição.
- Publicação em nuvem de tours copia os arquivos para um bucket público, expõe somente metadados publicados e permite despublicar e remover as cópias públicas.
- Exclusão de tours da conta usa uma transação: desativa o link, remove o agrupamento do tour e registra mídia sem referências para limpeza. Outros objetos vinculados são preservados, assim como a cópia local. A limpeza física ainda depende de um executor administrativo; a operação não promete liberação imediata de espaço.

Limites locais atuais: imagens até 100 MB cada, panoramas até 8192 px de largura, GLB até 150 MB e até 120 quadros por spin. Demonstrações de fórum, marketplace e opções que exigem serviços remotos estão identificadas como demonstração ou configuração pendente.

## Configurar autenticação Supabase

A integração com Cloudflare R2 possui adaptador de arquivos, Worker publicado e controles SQL. Esta cópia local foi configurada para o projeto Supabase e gateway já existentes. Veja [estado e limites](docs/R2_SETUP.md). Os controles do aplicativo não constituem um teto de cobrança da conta Cloudflare.

1. Nesta instalação, reutilize o projeto já configurado `msovfbuhehaiousuzbwr`; não crie outro projeto. Para uma instalação independente, use um projeto separado. O projeto antigo do usuário deve permanecer intacto.
2. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (ou publishable key). A chave pública de cliente não substitui as políticas RLS. Nunca coloque uma chave `service_role` no frontend.
3. Em uma instalação independente, execute as migrações de `supabase/migrations/` na ordem dos nomes, incluindo `0020_tour_drafts_and_media_references.sql` e as migrações de vitrines. O frontend atual usa `edit_revision` e `load_owner_tour`, introduzidos na 0020. Não reaplique migrações antigas sobre o banco existente sem conferir seu histórico.
4. Aplique também `0010_tour_interactions.sql` para os indicadores de entradas em cenas e cliques em hotspots. Em **Authentication → URL Configuration**, configure a origem local e a origem de produção como URLs permitidas. A recuperação de senha retorna para `/auth?mode=update-password` na mesma origem.
5. Aplique `0011_cloud_floorplans.sql` para sincronizar plantas privadas entre dispositivos.
6. Aplique `0012_hotspot_scene_connections.sql` para salvar, restaurar e publicar conexões entre cenas dos tours.
7. Reinicie `npm run dev` e abra **Entrar / criar conta** no rodapé da navegação lateral.

Para ativar R2, aplique também `0016_r2_gateway_ledger.sql` e `0017_r2_publication_paths.sql` no **novo** projeto e siga o guia acima. Não altere `VITE_MEDIA_STORAGE` para `r2` antes de configurar e verificar o Worker remoto.

### Gerar um objeto 3D com Tripo

Para experimentar o editor sem configurar serviços, abra `/objects/generate` e use **Testar relógio 3D de demonstração**. O aplicativo cria um GLB de exemplo local; esse modelo não é uma reconstrução da foto enviada. A renderização usa um contêiner próprio para preservar os elementos do React. A abertura, validação do GLB e recarregamento foram verificados no Chrome com `node tests/run-browser-trash.mjs --watch-demo`.

O cartão **Objeto 3D a partir de foto** envia uma imagem JPG ou PNG (até 20 MB) para uma função Edge. A chave Tripo fica somente no servidor. A página pede autorização explícita porque a geração consome créditos da conta Tripo; consulte saldo e preços atuais do seu plano antes de confirmar. O GLB resultante é validado e salvo no bucket privado da conta.

Para ativar o fluxo, instale/acesse a Supabase CLI, vincule a pasta a um projeto Supabase, aplique as migrações e publique as funções:

```powershell
supabase link --project-ref SEU_PROJECT_REF
# Antes destes comandos, aplique 0001 a 0012 no SQL Editor, na ordem descrita acima.
supabase secrets set TRIPO_API_KEY=SUA_CHAVE_TRIPO
supabase functions deploy create-tripo-model
supabase functions deploy get-tripo-model-job
```

Não coloque a chave Tripo em `.env.local` nem em variáveis `VITE_*`. O recurso não inicia tarefas pagas quando a função ou a chave do provedor não está configurada.

A migração cria perfis, metadados de projetos/cenas/pontos e políticas RLS por proprietário; somente metadados de projetos publicados são legíveis anonimamente. Hotspots aceitam imagem por URL e vídeo incorporado do YouTube ou Vimeo, exibidos sem reprodução automática. Rascunhos e originais ficam em bucket privado. Ao publicar, as cenas são copiadas para o bucket público; despublicar remove as cópias públicas. Confirme os limites e tipos de arquivo do seu plano Supabase antes de publicar imagens grandes.

## Recursos que ainda dependem de serviços externos

Reconstrução de ambientes a partir de fotos, cobrança, equipes compartilhadas e domínios white-label ainda não estão ativos. O Skybox por IA exige a função e a chave de provedor descritas abaixo. O sistema não fabrica respostas desses serviços: as opções pendentes explicam seus requisitos.

### Skybox por IA

O fluxo `/skybox/new` usa a função Supabase `skybox-ai` como proxy autenticado para a API da Blockade Labs. Defina o segredo somente no servidor (`supabase secrets set BLOCKADE_LABS_API_KEY=...`) e publique a função (`supabase functions deploy skybox-ai`). A interface consulta os estilos Model 3, solicita a geração com confirmação explícita de custo, acompanha o trabalho e importa o panorama concluído como um projeto local editável. A chave do provedor nunca deve ser colocada em `.env.local` ou em uma variável `VITE_*`.

Analytics conta visitas confirmadas por sessão da aba usando uma chave aleatória no sessionStorage. Se o armazenamento estiver bloqueado, recargas podem contar novamente. A API pública não distingue bots e ainda precisa de controle de abuso antes de uso comercial. Eventos permanecem no banco até exclusão da publicação; retenção automática e analytics de objetos/spins seguem pendentes. Os contratos SQL foram validados localmente, sem execução em Supabase remoto.

O estado de cada área, ordem de trabalho e limites de verificação estão em [docs/STATUS_E_PLANO.md](docs/STATUS_E_PLANO.md). A análise documentada de Tripo, Polycam, Nerfstudio e custos está em [docs/INTEGRACOES_E_CUSTOS.md](docs/INTEGRACOES_E_CUSTOS.md).

## Vídeo comum e vídeo 360° nos tours

O Studio oferece entrada **Vídeo 360°** e o editor de tours aceita imagens e vídeos no mesmo envio, inclusive por arraste. MP4, MOV e WebM são aceitos até 500 MB por arquivo, com codec compatível com o navegador e dimensões de até 8192 px por lado. A proporção próxima de 2:1 sugere projeção panorâmica; ela não comprova captura 360°. O seletor **Tipo da cena** permite corrigir entre panorama e mídia plana. Mudar essa opção não reconstrói ângulos ausentes.

Vídeos panorâmicos são reproduzidos como textura esférica em Three.js, com arraste, teclado, zoom, pausa, avanço, som e hotspots conectando cenas. Vídeos comuns usam controles nativos e enquadramento sem recorte. O arquivo original permanece em IndexedDB e acompanha backups, duplicações e restaurações. A prévia pública local e a tela cheia mantêm os controles de reprodução. Não há reprodução automática.

A publicação/restauração em Supabase exige `0015_tour_video_scenes.sql`, depois das migrações anteriores. A migração adiciona o tipo de mídia e permite os formatos de vídeo nos buckets, preservando políticas de acesso. O aplicativo envia o arquivo original: não implementa transcodificação nem streaming adaptativo. Limites do plano Supabase podem impedir arquivos grandes. Upload remoto e codecs em Safari/Firefox não foram verificados.

Validação em Chrome isolado: `node tests/run-browser-tour-video.mjs`, com dois WebMs reais gerados por MediaRecorder, seleção/correção de projeção, reprodução, som, hotspots, navegação para vídeo plano, tela cheia, persistência e layout móvel. Contratos SQL e formatos têm testes em `npm test`.

## Giro com duas perspectivas

No editor de produtos ou veículos, selecione **Ao redor** para a sequência principal e **Por cima** para enviar um segundo vídeo ou fotos com a câmera elevada e apontada para baixo. Cada perspectiva aceita até 120 quadros; a publicação mantém o limite total de 500 MB. O botão **Visualizar como visitante** permite testar as duas vistas neste dispositivo. A alternância também aparece no link público, iframe e tela cheia, preservando aproximadamente a posição na volta.

Para publicar, aplique `supabase/migrations/0014_spin_top_view.sql` no banco configurado, depois das migrações anteriores. A migração adiciona `publish_showcase_views` e mantém os links existentes com uma única vista. A vista superior exige uma captura adicional; o sistema não inventa a parte de cima usando o vídeo lateral.

## Biblioteca, backups e apresentações independentes

A biblioteca reúne tours, fotos 360°, giros, modelos e plantas com busca por nome, filtro por formato, ordenação e paginação reais. A busca da barra superior abre a biblioteca com o termo informado. Coleções têm atribuição por projeto, filtro e contagem; não são buscas pelo nome da pasta. Os cartões exibem apenas dados dos projetos locais, sem visualizações fictícias.

Cada cartão permite duplicar e baixar um backup `.v360`, que inclui mídia binária e metadados sem conversão base64. **Importar backup** valida estrutura, tamanhos e referências e cria uma nova cópia. Tours importados ficam como rascunhos, com IDs de cenas/hotspots remapeados. O original não é sobrescrito nem republicado. Limite: 512 MB de mídia e 1 MB de manifesto por backup. Backups não incluem sessões, credenciais, analytics nem publicações remotas.

O editor de giro tem **Baixar visualizador offline**: um HTML independente com os quadros das duas perspectivas, descrição/preço, arraste, teclado, reprodução, zoom e tela cheia. Não usa scripts externos, conta ou rede. Metadados são inseridos como texto, sem executar HTML do título ou da descrição. O documento é limitado a 200 MB após expansão base64, antes de alocar imagens codificadas. O arquivo pode ser enviado ou hospedado; não é o mesmo que um endereço de prévia local.

Tours públicos têm controles de cena dentro da tela cheia e alternativa de expansão da janela quando a API é bloqueada. `?embed=1` retira o cabeçalho e usa a altura do iframe; o iframe deve permitir fullscreen. As propriedades do editor permanecem acessíveis no celular. `/help` contém guias pesquisáveis e requisitos dos serviços. `/explore` e a aba Demonstrações criam exemplos ilustrados locais editáveis, com giro e hotspots funcionais. Eles não são capturas reais nem resultados de IA. Grupos locais permitem criar, renomear e remover nomes; não dão acesso multiusuário.

Validação: `npm test`, `npm run lint`, `npm run build`, `node tests/run-browser-studio.mjs` e `node tests/run-browser-demos.mjs`. Os testes de navegador precisam do aplicativo em `http://127.0.0.1:5188` e de Chrome e `playwright-core` já disponíveis no ambiente. Usam perfis isolados; não alteram projetos do navegador do usuário. Screenshots e downloads de teste vão para `.tmp-ui/` (artefatos locais, não fontes).

## Painel de criação

Os editores de tour e giro compartilham uma navegação compacta de estúdio com **Mídia**, **Ajustes**, **Detalhes**, **Foco** e **Ajuda**. Os atalhos abrem/focalizam os controles existentes; o modo de foco oculta os painéis sem descartar alterações. Cenas têm miniaturas maiores, renomeação em lote com prefixo e ordenação alfabética, preservando IDs, hotspots e cena inicial. A ordem/nome permanecem no salvamento local. O giro tem pré-visualização e acesso à publicação no cabeçalho; abrir a publicação não publica automaticamente.

Os painéis são roláveis no desktop, a mídia mantém o enquadramento inteiro e a navegação se adapta ao celular. Contraste, foco por teclado e redução de movimento foram considerados na revisão UI/UX. Validação: `node tests/run-browser-editor-panel.mjs` em Chrome isolado (375 px, desktop e paisagem), incluindo persistência e navegação. Capturas ficam em `.tmp-ui/editor-panel-desktop.png` e `.tmp-ui/spin-panel-desktop.png`.

## Tema futurista do estúdio

`FuturisticTheme.css` define a paleta azul-noite, ciano/violeta, superfícies em camadas, grade discreta e foco luminoso da biblioteca e dos editores. A orientação da skill `ui-ux-pro-max` foi aplicada ao contraste e à hierarquia, sem adicionar animações permanentes ou filtros à mídia capturada. As cores dos ambientes da planta e o fundo escolhido para modelos 3D continuam sendo dados do projeto. Verificação: `node tests/run-browser-futuristic-theme.mjs`, com contraste de textos selecionados >=4.5:1, 375/844/1024/1440 px e movimento reduzido. Screenshots ficam em `.tmp-ui/futuristic-*.png`.

## Movimento dos visualizadores

O arraste do giro acompanha o ponteiro e desacelera ao soltar, com interrupção imediata por novo gesto ou controle. Esse comportamento está no editor, na visualização de visitante e no HTML offline. Vídeos novos geram 24–120 quadros conforme o perfil escolhido; sequências existentes permanecem intactas. A reprodução automática usa o relógio de renderização e uma volta de duração consistente, independentemente da quantidade de quadros. Fotos esparsas continuam tendo posições discretas: não há geração ou interpolação de novos ângulos.

## Painel futurista e qualidade local

A biblioteca e os editores usam azul-noite, ciano/violeta, superfícies elevadas e foco de teclado visível. O tema é da interface: não aplica filtros a produtos nem muda o fundo salvo de modelos GLB. O teste `node tests/run-browser-futuristic-theme.mjs` confere contraste dos textos selecionados, ausência de rolagem horizontal em 375/844/1024/1440 px, mídia sem filtro e movimento reduzido.

O importador de giro permite selecionar perfil, início e fim do vídeo e cancelar sem substituir os quadros anteriores. Fotos são validadas antes de entrar na sequência. Miniaturas visíveis usam imagens de até 256 px, com cache por arquivo e decodificação serializada, enquanto o visualizador usa o quadro original.

Tour, giro, modelo e planta compartilham salvamento automático com fila por projeto, tentativa manual após erro e envio das alterações pendentes ao sair da rota. Uma falha de leitura não ativa salvamento por cima do projeto existente. IndexedDB permanece local: fechar à força o navegador ou perder energia antes da confirmação pode perder mudanças; faça backup dos projetos importantes. Esses mecanismos não substituem sincronização remota.

Modelos GLB têm sensibilidades mais suaves, limites de aproximação e amortecimento calculado pelo tempo entre quadros, com encerramento da cauda quase imperceptível do movimento. A renderização GPU só ocorre quando a vista muda; o relógio pausa fora da tela. O vídeo 360° também tem desaceleração, zoom suavizado e suspensão do relógio/renderização fora da tela ou na aba oculta. As cenas panorâmicas de imagem reutilizam o visualizador e fazem uma transição de 240 ms; o zoom é interrompível pelo usuário. A planta acompanha o ponteiro sem inércia e mantém a precisão do teclado. `prefers-reduced-motion` desativa a inércia extra, o amortecimento e as transições, preservando os controles.

A skill `ui-animation` orientou a separação entre manipulação direta e movimento após soltar, os tempos por quadro, a interrupção e a redução de movimento. Verificação em Chrome isolado: `run-browser-viewer-motion.mjs`, `run-browser-model-motion.mjs`, `run-browser-panorama-motion.mjs`, `run-browser-floorplan-motion.mjs`, `run-browser-spin-video.mjs` e `run-browser-tour-video.mjs`, no diretório `tests/`. O teste de modelos usa um GLB real local no editor e o componente público real montado por um harness; não simula uma publicação remota. Não foram medidos FPS em aparelhos físicos, Safari/Firefox, upload remoto nem serviços pagos de IA.

## Referências

- [Marzipano — documentação](https://www.marzipano.net/docs.html)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase RLS](https://supabase.com/docs/guides/database/secure-data)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Tripo API — geração de modelo a partir de imagem](https://developers.tripo3d.ai/en/docs/generation-image-to-model)
- [Tripo API — upload de arquivos](https://developers.tripo3d.ai/en/docs/files)
- [Tripo API — consulta de tarefas](https://developers.tripo3d.ai/en/docs/task-query)
- [REA — repositório auxiliar](https://github.com/morluto/rea)
