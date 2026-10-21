# Vitrine360 — implementação incremental do SaaS

Atualizado em 12/10/2026. O escopo continua sendo o pedido completo de 31 requisitos. Este documento registra os incrementos depois da [auditoria e plano entregues](AUDITORIA_SAAS_2026-10-12.md); não declara o SaaS concluído. O [segundo incremento, publicação transacional e métricas por conta](ATOMIC_TOURS.md), já está aplicado no projeto Supabase novo.

## Implementado neste incremento

### Viewer público e prévia de spin

- Reutilização do hook existente de giro, inércia, teclado, reprodução, fullscreen e perspectivas lateral/superior. Editor e exportação offline continuam funcionando.
- Modo explícito **Detalhes**: pinça com dois dedos, arraste para explorar a imagem ampliada e roda do mouse. Ao retirar um dedo, o outro continua o pan; cancelamento interrompe o gesto. Limites de pan consideram a área real da imagem em `object-fit: contain`, não os espaços vazios do palco.
- Modo **Girar produto** mantém `touch-action: pan-y`, permitindo rolagem vertical nativa. Detalhes usa `touch-action: none` somente no palco; há controles de zoom e retorno ao giro como alternativas aos gestos. Nenhuma animação nova força movimento reduzido.
- Cache de sessão com decodificação serial, prioridade para o quadro solicitado, deduplicação, descarte de vizinhos obsoletos e liberação de URLs ao sair/trocar vista. A imagem só muda após decodificação; a anterior permanece visível durante a espera. Falhas mostram aviso e botão de nova tentativa.
- Reprodução aguarda o quadro solicitado ficar pronto, em vez de avançar indefinidamente enquanto a conexão está atrasada. O ângulo solicitado e a imagem efetivamente exibida são estados distintos.
- Preload padrão limitado a três vizinhos. Se o navegador informar economia de dados ou 2G, sem download especulativo; em 3G, só o próximo vizinho. Isso não substitui a imagem por uma versão de baixa qualidade.

O orçamento de retenção do cache considera bytes RGBA estimados mais o blob comprimido, tendo como referência dois quadros 4K. **Não é um teto físico de memória nem quota de plano**: quadro exibido e próximo solicitado podem ultrapassar temporariamente o orçamento; decodificador, elemento DOM, GPU e navegador têm memória adicional. Um quadro maior permanece acessível sem aquecer mais vizinhos. É necessário medir memória em aparelhos reais.

Os hints de rede são opcionais e não têm suporte universal: sem eles, aplica-se a política padrão. Ver [MDN saveData](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData). A definição explícita de gestos segue [MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action); não se tenta mudar a política nativa no meio de um gesto.

Arquivos principais: `spinFrameCache.ts`, `useSpinFrame.ts`, `spinPreloadPolicy.ts`, `spinZoomGeometry.ts`, `useSpinGesture.ts`, `PublicShowcase.tsx` e CSS do viewer.

### Pipeline: observabilidade e dados para decisão

- Mantidos os recortes, contagens e perfis existentes; fotos originais não foram recomprimidas nem aumentadas artificialmente.
- Estados de validação, extração, otimização de quadro/miniatura e finalização, com número do quadro e total; cancelamento mantém a sequência anterior.
- Relatório local por perspectiva: bytes do vídeo, dimensões/duração da fonte, intervalo, perfil, dimensões/contagem finais, bytes finais e tempo observado no dispositivo.
- Relatório persiste no IndexedDB, acompanha backup `.v360` com validação de formato e pode ser baixado em JSON. Não inclui vídeo original, nome de arquivo, tokens ou segredos.
- Troca de vista mostra o relatório correto. Entrada inválida não perde evidência anterior; edição manual da sequência invalida seu relatório, evitando apresentar métricas de uma captura que já mudou.
- Vídeo de entrada continua **somente local**, sem upload para R2. `finally` libera o vídeo, URL temporária e canvases em sucesso, erro ou cancelamento. Nenhum arquivo original do usuário é apagado e não foi inventado um job de remoção de originais remotos inexistentes.

Os relatórios são evidência local, não contabilização confiável de quota pelo servidor. Seleção continua **uniforme**; não é descrita como seleção inteligente. Nitidez, duplicatas, variantes de qualidade e WebP/AVIF ainda exigem comparação com vídeos representativos. Não foram definidos novos limites comerciais ou preços.

Arquivos principais: `spinExtraction.ts`, `spinCaptureReport.ts`, `SpinCaptureControls.tsx`, `creationTools.tsx`, `projectStore.ts` e `projectBackup.ts`.

## Cobertura dos 31 requisitos

| Requisito | Estado atual | Próxima entrega necessária |
| --- | --- | --- |
| 1. Vitrine comercial em um link | Pendente; perfil `/u/:slug` não é uma loja completa | `/loja/:slug`, capas leves, negócio e catálogo |
| 2. Quinze segmentos iniciais | Pendente | Catálogo e regras de campos, nomenclaturas e CTAs |
| 3. Motor configurável | Pendente | Separar dados/segmento/layout/paleta/experiência/CTA |
| 4. Sete templates distintos | Pendente | Componentes com layouts reais e testes responsivos |
| 5. Fluxo de personalização | Pendente | Editor da vitrine, preview mobile e publicação |
| 6. Qualidade pública | Parcial: espera pelo decode, fonte preservada e detalhes | Validação perceptual e dispositivos reais |
| 7. Auditoria do spin | Entregue | Manter baseline ao evoluir |
| 8. Fluxo de vídeo simples | Existente, observabilidade melhorada | Seleção de candidatos validada por qualidade |
| 9. FPS não é contagem final | Preservado: amostras finais limitadas, não todos os frames | Seleção adaptativa medida, sem inventar ângulos |
| 10. Temporários e original | Originais não são enviados; recursos temporários liberados | Política configurável somente se surgir processamento remoto |
| 11. Vistas separadas | Preservado e testado lateral/superior | Preparar outras vistas sem multieixo complexo |
| 12. Zoom/touch/pan | Implementado no viewer público/preview | Medir fonte e eventual alta resolução adaptativa |
| 13. Qualidade adaptativa/codecs | Pendente | Medir detalhes reais antes de produzir variantes |
| 14. Preload/cache | Implementado neste incremento | Medição de rede/memória/latência em hardware físico |
| 15. Upload configurável/backend | Limites técnicos atuais preservados; comercial pendente | Reserva e validação autoritativas em todos os caminhos |
| 16. Limites baseados em dados | Relatórios adicionados; números comerciais não escolhidos | Amostra real de vários segmentos e distribuição de consumo |
| 17. Uso por conta | Parcial: métricas R2 por dono e painel real, sem quota comercial | Itens, vistas, Supabase legado, reservas por plano e barra de quota |
| 18. Planos configuráveis | Pendente | Catálogo de quatro planos, sem preços/cotas definitivos |
| 19. Administração de planos | Pendente | RPCs protegidas, versionamento e interface |
| 20. Gerenciador de vitrines | Pendente | Segmentos/templates/paletas/compatibilidade/CTAs |
| 21. Página individual de item | Viewer isolado existente; composição comercial pendente | Só experiências não vazias, lazy loading |
| 22. WhatsApp principal | Pendente | CTA com negócio, item, link e preço opcional |
| 23. Mobile | Larguras e touch em Chromium verificados | Android intermediário, memória e rede real |
| 24. Segurança | Diagnóstico e proteções existentes preservados | RLS do novo domínio, limites, produção e rotação de credenciais |
| 25. Limpeza com referências | Outbox transacional de tours implementada; sem executor | Reconciliação/leases/referências antes de remover arquivos |
| 26. Métricas de armazenamento | Capturas locais e ledger R2 por dono observáveis | Supabase legado, atribuição por vitrine/item e crescimento |
| 27. Estados de processamento | Implementados para extração local | Upload/backend quando houver processamento remoto |
| 28. Preservação | Regressões de spin, tour, hotspots e legado cobertas neste incremento | Repetir em todas as fases; criação 3D continua removida conforme pedido anterior |
| 29. Auditoria antes de código | Diagnóstico separado entregue antes deste incremento | Ver auditoria vinculada |
| 30. Ordem incremental | Fase 1 entregue; fases 2/3 parciais; fase 4 iniciada | Completar segurança/limpeza/quotas e fases 5–9 |
| 31. SaaS completo | **Ainda não concluído nem implantado por esta entrega** | Integrar e validar fluxo completo de vitrine |

## Ordem das próximas implementações

1. Completar validação de viewer/pipeline: vídeos reais e comparações de nitidez, duplicação e formatos. Não aumentar consumo/tempo de extração por heurística sem evidência.
2. Armazenamento: publicação de tour por revisão/transação antes de remover a versão anterior; inventário por dono/recurso; limpeza durável com referência e reconciliação. Evitar reutilizar o fluxo atual de múltiplas mutações não atômicas para a loja.
3. Novo domínio comercial aditivo com RLS: catálogo de segmentos/templates/paletas, vitrines/itens e referências às experiências existentes; snapshot público separado do rascunho. Capas não podem expor caminhos privados.
4. Vitrine pública e item, depois personalização/preview. Não montar spins ou Three.js na grade. CTA WhatsApp sem carrinho/checkout.
5. Planos e reservas atômicas por conta, status/versões/auditoria, cobrindo R2 e caminhos Supabase legados. Atingir quota bloqueia novas escritas, nunca remove conteúdo existente.
6. Administração segura de configurações e métricas, reutilizando `site_administrators`; permissão de servidor, não metadata do cliente.
7. Validação integrada de publicação/revogação, proprietários distintos, quota, falhas/retomada, mobile físico e implantação SPA/CORS/auth/email.

## Validação deste incremento

Testes novos: cache/ownership/abort durante decode pendente, geometria e ancoragem de pinch, rede/economia de dados e relatórios/backups. Browser scripts isolados usam dados sintéticos próprios; não alteram projetos reais nem a aba autenticada do usuário.

- `npm test`: 101 testes passaram em 23 arquivos.
- `npm run lint`: sem alertas. `npm run build`: passou; aviso de chunks grandes continua pendente de otimização específica.
- `run-browser-spin-detail.mjs`: dois toques via CDP, transição para um dedo, cancelamento, mouse/roda, rolagem vertical nativa sem girar o produto, fonte nativa, lateral/superior, quadro anterior durante espera, retry e economia de dados.
- `run-browser-spin-pipeline-report.mjs`: WebM sintético decodificado de fato, etapas, bytes, dimensões, tempo, download, persistência e invalidação de evidência obsoleta.
- `run-browser-spin-video.mjs`: segundo vídeo, duas sequências, proporção do ângulo, fullscreen, reload e mobile.
- `run-browser-spin-quality.mjs`: fonte sintética 4K, 120 quadros Ultra nativos, Equilibrado 1920, recorte, miniaturas ≤256, cancelamento e entradas inválidas.
- `run-browser-viewer-motion.mjs`: editor, público e offline; inércia limitada, pausa/interrupção e movimento reduzido.
- `run-browser-tour-navigation.mjs`: tour, pontos, destinos, exclusão/desfazer, transição, publicação fixture e layout responsivo.

Rodadas simultâneas de vários Chromiums produziram duas falhas sensíveis a recursos: a fixture WebM não foi decodificada numa rodada e a injeção do “flick rápido” ficou espaçada em centenas de milissegundos, sem a velocidade assumida pelo teste. As execuções isoladas verificam esses cenários; não executar benchmarks/gestos de tempo junto com geração de vídeo e outros browsers. Isso não foi interpretado como desempenho medido de Android nem como aprovação de capacidade sob carga.

No primeiro incremento, as habilidades de React, UX e gestos orientaram a reutilização dos hooks, alternativas acessíveis e separação entre gesto de giro e exploração de detalhes. Nesse primeiro incremento não houve migração/deploy/alteração de conta ou exclusão de arquivo. No segundo incremento, a migração 0019 foi aplicada no projeto novo com backup privado do esquema; ver relatório separado para evidências e limites. Nenhuma dependência nova foi instalada e o projeto Supabase antigo permanece fora do escopo.
