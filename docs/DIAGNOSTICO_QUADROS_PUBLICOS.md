# Carregamento público de giros — diagnóstico de 2026-10-21

Registro anterior à alteração da implementação. Escopo: toda a cadeia editor → publicação → armazenamento → RPC → visualizador. O relato não foi atribuído automaticamente a uma causa única de rede.

## Fluxo existente

1. `ProductSpinEditor` importa fotos em ordenação natural de nome ou extrai quadros de vídeo em canvas. Vídeo tem prazo para metadados/seek/conversão; fotos são decodificadas na importação. Os arquivos reais ficam em IndexedDB (`projectStore`); URLs blob do editor são temporárias e não constituem uma publicação.
2. `prepareStorefrontPublication` valida os itens selecionados. `publishShowcase` envia cada arquivo a uma revisão UUID nova e aguarda todos os uploads antes da RPC transacional. O R2 confirma tamanho/partes antes de finalizar. A RPC publica caminhos duráveis em `asset_paths`, associados ao proprietário; a vitrine guarda IDs de publicações.
3. Fotos importadas são publicadas sem recompressão; vídeo usa perfis de extração. Portanto, o limite de aceitação de 500 MB por sequência não equivale a um tamanho adequado para qualquer conexão.
4. `load_public_storefront` retorna somente os itens publicados do proprietário. A miniatura usa o primeiro quadro e o produto abre `/showcase/:slug`. `load_public_showcase` separa quadros laterais/superiores mantendo a ordem armazenada.
5. `publicShowcaseAssetUrl` interpreta `r2:` como endpoint público do gateway; caminhos Supabase usam o bucket público. R2 continua privado e o gateway confere a publicação antes da leitura. O editor não paga esse custo de rede por usar arquivos locais.
6. `useSpinFrame` já evita esperar todos os quadros. O cache decodifica uma imagem por vez, guarda URLs blob e aquece vizinhos. A mensagem de carregamento depende de o quadro solicitado atingir o estado de exibição.

## Evidências antes da correção

- Dois produtos publicados encontrados, com 48 quadros cada. Metadados públicos: 96 arquivos, 7.877.019 bytes no total; arquivos de 41.176 a 113.200 bytes. Não são sequências gigantes no caso observado.
- Navegador Chrome novo, backend real, sem respostas simuladas: primeira imagem em 1.396/1.677 ms; ângulos novos em 363–438 ms; retorno a quadro ainda decodificado em 22–23 ms. Primeiras imagens decodificadas em 1280×720 e 864×496. Nenhuma espera infinita natural nessa conexão. Não declarar que este teste reproduziu exatamente a sessão do usuário.
- Leituras reais responderam 200, com CORS correto, mas `Cache-Control: no-store`. Trocas rápidas cancelaram vizinhos e voltaram a requisitar alguns deles. O cache só guarda imagens decodificadas; perder uma entrada obriga nova leitura do arquivo.
- `r2_gateway` confere permissões, atualiza contador e toma uma trava global de orçamento a cada leitura. O custo não existe no editor local. Não relaxar autorização nem os limites de armazenamento para tentar melhorar o visualizador.
- O cache tem uma única posição `running`. Cancelar uma requisição apenas sinaliza o carregador; a posição só é liberada quando a Promise termina. Se a operação não responde ao sinal, novos ângulos nunca começam. `AbortSignal.timeout` também só sinaliza, sem uma liquidação independente da Promise.
- `tests/spinLoadingRecovery.test.ts`, executado antes da alteração: **2 testes falharam**, comprovando bloqueio por operação obsoleta sem resposta e ausência de uma conclusão independente no prazo. Esses testes injetam a falha de transporte; não simulam progresso visual nem inventam métricas de produção.
- A leitura do manifesto do produto não possui cancelamento/prazo próprio; a validação de seu conteúdo também é menor do que a da publicação. A vitrine pública já tem um prazo, mas o produto aberto é outro fluxo.

## Direção da correção

**Evidência adicional real no portal Maestri, antes do ajuste de compatibilidade:** o mesmo produto que abre no Chrome permanecia sem imagem. A inspeção encontrou respostas de mídia completas em 313–529 ms. Uma prova isolada recebeu HTTP 200, `image/jpeg`, 95.758 bytes; `Image.onload` disparou com `naturalWidth=1280` e `complete=true`, mas a Promise de `Image.decode()` não concluiu durante a observação. O prazo de 20 segundos então encerrava o cache com erro, sem exibir a imagem disponível. Isso comprova um bloqueio na dependência exclusiva de `decode()` no navegador incorporado, distinto de arquivo inexistente ou download pendente. Um teste adicional reproduziu a imagem carregada com `decode()` permanentemente pendente e falhou antes de mudar esse caminho.

Garantir conclusão do agendador mesmo com operações sem resposta; permitir que o quadro visível passe à frente de trabalho especulativo; mostrar o primeiro quadro real utilizável; manter aquecimento limitado e cache de bytes separado do cache de decodificação; concluir erro/retentativa sem manter um carregamento indefinido. Usar revalidação HTTP para aproveitar bytes armazenados sem servir arquivos despublicados. Validar manifesto e cancelar leitura ao sair/trocar produto.

As medições após a alteração e os limites da verificação estão abaixo. Relatórios brutos filtrados ficam em `.tmp-ui`, fora do Git.

## Implementação e verificação em produção

- Agendador com duas operações simultâneas, prioridade do quadro visível e liquidação própria do prazo de 20 segundos. Cancelamentos liberam a fila imediatamente; resultados tardios descartam seus recursos. Uma prioridade já enfileirada também preempta trabalho especulativo, caso coberto por regressão adicional.
- Primeiro quadro real utilizável aparece mesmo se o quadro inicialmente solicitado está lento. O aquecimento acompanha a direção, em até seis vizinhos; economia de dados desliga esse trabalho. A interface não espera a sequência inteira, mantém imagem anterior e oferece erro/retentativa, em vez de progresso fictício.
- A disponibilidade da imagem também pode ser confirmada pelo evento nativo `load`, com dimensões válidas, sem depender exclusivamente de `Image.decode()`. `decoding="async"` é preservado. Erro de imagem continua sendo erro; não há temporizador que marque como pronta uma imagem inexistente. A mesma foto passou a aparecer no portal Maestri, em 1280×720 e sem status pendente. Uma regressão adicional mantém `decode()` eternamente pendente num Chrome com imagem real e verifica exibição/interação.
- Cache de bytes comprimidos por produto: LRU de até 32 MiB, separado do cache decodificado de 66.355.200 bytes. Voltar a uma imagem removida da LRU decodificada pode reutilizar seus bytes, sem nova leitura. A imagem exibida e a solicitada permanecem protegidas; sua soma pode ultrapassar a cota durante uma troca, e uma imagem individual maior também permanece admitida, preservando resolução nativa. Esses limites são do cache, não uma medição da RAM total do navegador.
- Manifestos públicos são validados: identidade, quantidade de vistas/quadros, unicidade e caminhos duráveis. Não aceitam blob/data/localhost ou hosts arbitrários como arquivos publicados. Leitura tem prazo independente de 10 segundos e sinal de cancelamento. Um manifesto de revisão revogada pode ser atualizado uma vez; falha persistente não dispara loop.
- Imagens públicas no R2 usam `private, no-cache` e ETag. O navegador pode guardar os bytes, mas revalida a autorização antes de reutilizá-los. Teste real recebeu 200 e depois 304 sem corpo. Downloads autenticados, intervalos de vídeo e erros continuam `no-store`. Arquivos despublicados não ganham autorização por apresentar um ETag.

Verificações locais finais: **196 testes em 40 arquivos**, lint e build passaram. `node tests/run-browser-public-spin-loading.mjs` passou oito cenários no Chrome: `decode()` suspenso após imagem carregada, primeiro quadro suspenso, quadro ausente, HTML/imagem corrompida, manifesto suspenso com recuperação, todos os quadros suspensos com prazo e troca de produto, estabilidade do cache e liberação de URLs na desmontagem, manifesto local inválido. São testes de falha controlada, distintos das medições reais. `node tests/run-browser-spin-detail.mjs` passou novamente zoom nativo, gestos, cancelamento, transição de vistas, erro/retentativa e economia de dados. Uma tentativa concorrente desse último runner teve timeout de navegação local antes de abrir o editor; a repetição posterior, com o servidor confirmado saudável, passou.

Varredura real dos arquivos: **96 de 96** quadros publicados baixados e decodificados, sem ausência ou corrupção nessa amostra. Não houve alteração nos arquivos ou dados dos criadores.

Publicado em 2026-10-21: frontend final `f009cab1-9e89-413d-bb6a-19839f0a7d19`; gateway `f924f517-9e92-453c-9b78-2395c5b2f39f`. A primeira publicação do frontend (`506d5e2e-9dde-4b80-905b-877dc10d610d`) foi seguida pelo ajuste de compatibilidade comprovado no portal. Smoke test real da versão final, sem interceptação, partiu da vitrine e abriu o produto, percorreu todos os 48 quadros e repetiu a volta:

| Vitrine pública | Prévia após abrir produto | Mediana primeira volta | Mediana segunda volta | Novas requisições na segunda volta |
| --- | ---: | ---: | ---: | ---: |
| `/v/minha-vitrine` | 1.031 ms | 69 ms | 30 ms | 0 |
| `/v/lorran-negociacoes` | 1.636 ms | 69 ms | 35 ms | 0 |

Ambos renderizaram todos os quadros, preservaram a resolução e não tiveram `pageerror`. Tempos são observações dessa execução em Chrome, não garantia para qualquer conexão. A medição anterior abria diretamente o produto; a atual inclui a navegação desde a vitrine, por isso não deve ser apresentada como comparação percentual equivalente.

Para repetir, sem credenciais de usuário: `node tests/run-browser-public-spin-live.mjs <slug-publico>`. Relatórios e screenshots são salvos em `.tmp-ui/public-spin/`, ignorado pelo Git. Não criar publicações de teste na conta do usuário para executar o smoke test.

Limites: a espera infinita não apareceu no Chrome padrão com rede saudável; a dependência travada de `decode()` foi demonstrada no portal incorporado com o produto real e corrigida no mesmo ambiente. O bloqueio do agendador foi reproduzido por falha de transporte controlada, corrigido e validado por regressão. O contador global de orçamento do banco permanece e ainda pode limitar a taxa de novas leituras sob muita concorrência; não foram removidas travas/cotas de segurança sem uma evidência que justifique mudar esse contrato. A redução de releituras vem dos caches e da revalidação, sem liberar acesso privado.
