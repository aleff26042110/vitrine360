# Melhorias locais de qualidade — 2026-10-11

## Problemas e mudanças

| Observação no código anterior | Mudança no proprietário do comportamento |
| --- | --- |
| Um único perfil de extração não oferecia controle de resolução ou trecho. | `spinExtraction.ts` calcula dimensões proporcionais, perfil e intervalo; valida duração, tamanho e limites antes de alocar quadros. Não amplia o original. |
| Importação longa não tinha interrupção própria. | O editor possui um AbortController por importação. Cancelamento, erro e saída da rota liberam vídeo/canvas/URLs; a sequência anterior só é substituída após sucesso. |
| Miniaturas carregavam os mesmos arquivos grandes do palco. | Cache por File, decodificação serializada, imagens de até 256 px e carregamento quando visíveis. Vídeos produzem as miniaturas a partir do canvas já decodificado. |
| Debounce podia ser descartado ao sair da rota; falha parecia salvamento concluído. | Um mecanismo compartilhado guarda a última edição, envia pendências ao desmontar, serializa escritas por projeto e mantém falhas para tentativa manual. |
| Controles podiam ficar habilitados entre a criação do ID e a leitura do rascunho. | Os quatro editores só habilitam o nome após a leitura concluir; o giro também protege envio e troca de perspectiva. |
| Superfícies claras e controles isolados não formavam um cockpit coerente. | Tema azul-noite, acentos ciano/violeta, foco visível e hierarquia de painéis. Tema limitado à interface, sem filtros sobre a mídia. |

## Evidência de validação

- `npm run lint`: sem alertas.
- `npm run build`: TypeScript e compilação de produção passaram. Continua o aviso de tamanho do chunk Three.js; não foi ocultado.
- `npm test`: 47 testes em 11 arquivos passaram, incluindo planos de captura, salvamento, geometria, segurança de arquivos e contratos de armazenamento remoto simulados.
- `run-browser-futuristic-theme.mjs`: biblioteca/tour/giro, contraste de textos selecionados >= 4,5:1, mídia sem filtro, 375/844/1024/1440 px e movimento reduzido.
- `run-browser-editor-panel.mjs`: ferramentas, modo foco, nomes em lote, ordenação, persistência e layout móvel/paisagem.
- `run-browser-spin-video.mjs`: segundo WebM real, perspectivas independentes, preservação do ângulo, tela cheia e recarregamento.
- `run-browser-autosave.mjs`: IndexedDB real nos quatro editores, saída imediata da rota, falha de quota injetada, erro visível no celular e recuperação manual.
- `run-browser-spin-quality.mjs`: WebM real 3840 × 2160, 120 quadros nativos no Ultra, redução proporcional para Full HD, trecho selecionado, miniaturas <=256 px, cancelamento/entradas inválidas sem substituir a sequência e persistência real.

Os testes de navegador usam perfis temporários isolados do Chrome, não a sessão ou os arquivos do usuário.

## Limites mantidos

Ultra amostra 120 quadros até 3840 px no maior lado; não cria ângulos nem aumenta resolução. Um vídeo de baixa taxa de quadros pode gerar amostras repetidas. Processamento e codecs dependem do navegador/dispositivo; não há medição de desempenho universal. Entrada/saída de cada sequência de vídeo têm limite de 500 MiB e resolução de entrada até 8192 px por lado/33,5 MP.

Salvamento confirmado permanece neste perfil do navegador. Envio ao sair é uma proteção de melhor esforço, não garantia contra fechamento forçado ou perda de energia; backups continuam necessários. Publicação, IA paga, migrações e sincronização remota não foram executadas nem verificadas em uma conta real nesta alteração. Firefox, Safari, codecs HEVC e hardware móvel real continuam sem verificação neste conjunto.
