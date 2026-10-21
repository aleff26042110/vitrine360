# Vitrine360 — estado do produto e fases seguintes

Auditoria atualizada em 11/10/2026 a partir do código em `src/`, das migrações em `supabase/migrations/` e do escopo do produto. “Implementado localmente” não significa que a implantação ou o serviço remoto foi validado.

### Ampliação do estúdio local

- Biblioteca unificada com busca de todos os formatos, filtros, ordenação, paginação, coleções atribuídas de verdade e contagens de projetos reais. Duplicação e backup/restauração abrangem tours, giros, GLB e plantas. Arquivos `.v360` mantêm mídia binária; importações criam novas cópias, sem sobrescrever ou publicar automaticamente.
- Giro exportável como HTML independente sem rede, incluindo vistas ao redor/por cima, reprodução, arraste, zoom, teclado e tela cheia. Limite de 200 MB após expansão; metadados escapados contra fechamento de script e inseridos por textContent.
- Tour público com navegação dentro da tela cheia, fallback quando a API é bloqueada, saída por Esc e modo iframe. Editor com propriedades acessíveis no celular e abas Cena/Estilo/Informações funcionais.
- Ajuda pesquisável, página 404, exemplos ilustrados interativos de giro e panoramas com hotspots, e cadastro/renomeação/exclusão de grupos locais. Fórum/vagas mostram ausência de serviço; não mostram respostas fictícias.
- Verificação local: 32 testes em 7 arquivos passaram. `run-browser-studio.mjs` cobre biblioteca, corrupção de preferências, download/importação, cópias, exportação offline, metadados maliciosos, fullscreen nativo/bloqueado, navegação de tour, iframe, ajuda e responsividade 375–1440 px. `run-browser-demos.mjs` exercita o renderer panorâmico e a conexão por hotspots em Chrome. Isso não prova Safari/iOS ou publicação remota.

Publicação por URL em outro dispositivo, contas remotas, IA com provedores, equipes multiusuário, DNS, pagamentos, VR e reconstrução de ambientes **não foram ativados ou validados em serviço real**. A implementação local não deve ser apresentada como SaaS comercial completo.

## Matriz de funcionalidades

| Área | Estado verificável agora | Dependências e custo/complexidade | Próximo trabalho |
| --- | --- | --- | --- |
| Landing comercial | Implementada em `/welcome`, com proposta de valor, recursos, fluxo de uso e CTAs para cadastro e Studio. `/` continua sendo o dashboard. | Baixa; hospedagem web. | Validar conteúdo e conversão com usuários; definir se a landing assumirá a raiz no lançamento. |
| Cadastro e conta | Login, cadastro e recuperação de senha implementados para Supabase. O retorno pós-login é restrito a caminhos internos. Login real depende de URL, chave pública, e-mail e migrações configuradas. | Média; Supabase Auth e configuração de e-mail. | Validar confirmação, recuperação e expiração de sessão em projeto de staging. |
| Dashboard e projetos | Painel funcional; listas locais e fluxo de salvar/restaurar/publicar/excluir nuvem. Exclusão limpa imagens antes dos metadados; banco preserva objetos e tarefas ao remover o vínculo com o tour. Contratos de falha simulados e preservação SQL validados. | Média; Supabase Database e Storage, limites do plano. | Testar duas contas, sincronização conflitante, exclusão em Storage real e quota. |
| Tours 360° | Editor Marzipano; múltiplas cenas, ordenação, cena inicial, panorama/foto plana, pontos com texto, link, imagem e vídeo autorizado; autosave local. Incorporações YouTube/Vimeo são normalizadas sem autoplay. | Média; formatos de imagem e armazenamento. | Validar upload e edição concorrente em navegador real; medir mídia externa em redes móveis. |
| Tour público | Visualizador local e caminho remoto sem login preparados; detalhes de hotspot usam URL segura, imagem e player autorizado. | Média; Supabase RLS e bucket público somente para material publicado. | Testar publicação, despublicação, acesso anônimo, cache/CDN e privacidade com dados reais. |
| Spins de produto/veículo | Sequência local e publicação por link implementadas; manifesto persistente, quadros públicos, giro por arraste, navegação por teclado e zoom. Serviço Supabase real ainda não validado. | Média; Supabase Storage público, quota de plano e entrega de arquivos. | Validar em staging, otimizar imagens e medir carregamento em redes móveis. |
| Modelos GLB | Three.js + GLTFLoader; validação local; publicação GLB por link persistido com metadados e viewer público com órbita/zoom. Serviço Supabase real ainda não validado. | Média; RAM/VRAM, tamanho do arquivo e hosting público. | Validar em staging, adicionar hotspots e medir desempenho móvel. |
| Planta | Editor local de cômodos com seleção, posição/tamanho percentual, cor, arraste com limites e teclado; fluxo real de editar, salvar e recarregar validado em Chrome pelo comando `node tests/run-browser-trash.mjs --floorplan`; tabela remota privada e serviços de salvar/listar/restaurar preparados na migração 0011. RLS e validação de coordenadas testadas localmente. Editor conectado ao salvamento privado na nuvem e painel à listagem/restauração, com confirmação antes de substituir a cópia local. Compilação local não prova o serviço remoto. | Baixa para esquema; alta para reconstrução automática/dollhouse. | Validar controles com duas contas em Supabase real; renderização 3D esquemática e integração de planta gerada. |
| Reconstruction Studio (ambientes) | Reconstrução de salas não está ativa. A geração de objetos abaixo não reconstrói ambiente. | Alta; Polycam Enterprise com créditos ou worker GPU próprio. | Criar captura guiada, jobs persistentes, fila, upload multipart, cancelamento e visualizador splat/mesh. |
| Geração de modelos por IA | Fluxo Tripo image-to-3D implementado no cliente e em duas Edge Functions; jobs persistentes, aceite explícito, polling, cópia privada e validação GLB. Ainda sem execução remota. | Média/alta; Supabase remoto, chave Tripo no servidor e créditos por tarefa. | Implantar em staging; executar uma tarefa autorizada; validar quotas e UX de falhas. |
| Perfil, domínio, equipe | Perfil remoto implementado, privado por padrão, com publicação opcional por slug e RPC pública que expõe apenas nome, biografia e site. Domínio e equipes continuam demonstrativos locais. | Média/alta; Supabase para perfil; domínio/DNS, convite, papéis e e-mail para os demais recursos. | Validar perfil com duas contas em staging; depois implementar workspace, convites e papéis com RLS. |
| Analytics | Registro de visita, cena e clique de hotspot por RPC restrita; visitas idempotentes por chave aleatória; relatórios por proprietário e métricas do dashboard. Contratos SQL validados localmente. | Média; Supabase, retenção e controle de abuso. | Validar serviço real, limitar abuso, definir retenção automática e ampliar para showcases. |
| Plano e cobrança | Página informativa; nenhum pagamento é ativado. | Média; controle de quotas primeiro, pagamento após validação comercial. | Limites aplicados no backend para uploads, projetos, jobs e usuários. |
| Testes automatizados | `npm test` cobre GLB, contrato Tripo simulado, URLs de mídia e aplica oito migrações repetidamente; testes SQL exercitam publicação/anulação, isolamento, mídia, perfil e analytics com duplicação, acesso anônimo e despublicação. Edge Functions e serviços remotos seguem sem projeto de staging. | Média; Vitest, mocks e projeto Supabase de staging. | Testar auth, perfil, tour e showcase por serviço real; cobrir falhas de Storage e responsividade. |

## Ordem recomendada

1. Corrigir o fluxo de publicação e sincronização com testes de contrato/RLS; executar contra um projeto Supabase isolado antes de usar produção.
2. Validar identidade, recuperação de senha, perfil público e landing em um projeto de staging e em navegadores móveis reais.
3. Validar em staging a publicação de tours, spins e GLB; depois otimizar imagens, testar incorporação e medir carregamento em dispositivos reais.
4. Implantar e validar Tripo image-to-3D em staging; depois implementar Reconstruction Studio de ambientes via Polycam aprovado ou worker GPU. Geração de objeto não equivale a captura espacial.
5. Implementar eventos de analytics, quotas no backend, workspaces/equipe e implantação.

## Limites de verificação atuais

- Conexões entre cenas implementadas no editor, na prévia e no tour público; destino remapeado ao duplicar e limpo ao remover uma cena. Chrome validou o fluxo com `node tests/run-browser-trash.mjs --connections`. Migração 0012 adiciona destino e restrição ao mesmo tour; execução contra Supabase real permanece pendente.

- Gestão local ampliada: exclusão de giros, modelos e plantas remove arquivos após confirmação; registros mínimos de exclusão impedem recriação por autosave atrasado. Restauração explícita de planta permite baixar novamente a cópia da conta. Os botões, cancelamento, persistência e proteção foram validados no Chrome com `node tests/run-browser-trash.mjs --objects --floorplan`. Exclusão remota desses objetos segue pendente.

- `npm run test`, `npm run lint` e `npm run build` dão evidência local de unidades, lint e compilação, mas não provam comportamento do Supabase ou dos provedores.
- Não existe configuração Supabase real na pasta; por isso login remoto, RLS, Storage, publicação sem login e sincronização permanecem não verificados contra serviço.
- Nenhuma chave Tripo/Supabase ou acesso Polycam Enterprise está configurado aqui; Tripo foi testado com respostas simuladas, sem job pago ou reconstrução de ambiente.
- A compilação alerta que o chunk do Three.js ultrapassa 500 KB minificado; falta medir carregamento e desempenho em celulares.
