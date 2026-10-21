# Editor e navegação entre ambientes

## Comportamento

- Hotspots de navegação válidos abrem a cena de destino com um clique, tanto na prévia do editor quanto no tour público. No modo de edição, o clique continua selecionando o ponto para alterar suas propriedades.
- Pontos de informação abrem o cartão, sem navegação automática. Links antigos sem `kind` continuam funcionando quando possuem um destino válido.
- O endereço público aceita `?sceneId=ID_DA_CENA`; destinos inexistentes usam a cena inicial válida ou a primeira cena.
- Imagens e vídeos 360 usam a mesma decisão de navegação. Os testes de navegador verificam panoramas de imagem e dois vídeos WebM reais gerados somente no perfil de teste.
- A busca de cenas ignora acentos e pode ser combinada com os filtros de imagens/vídeos. A ordem e a numeração original são preservadas.
- A preparação do tour aponta destinos ausentes, conta mídias e permite começar a prévia pela cena inicial. Não substitui testes de reprodução ou de publicação.
- A remoção pede confirmação. Nenhum projeto existente foi migrado ou editado automaticamente.
- Cada ponto tem uma lixeira na lista e a última exclusão pode ser desfeita enquanto o editor estiver aberto. Excluir um ponto não remove automaticamente o ponto de retorno na outra cena; ele continua editável separadamente. A remoção é salva localmente e uma publicação remota anterior precisa ser atualizada para refletir alterações.
- No editor, o clique abre as propriedades do ponto e expõe o destino e o botão **Visitar ambiente**. Na prévia e no tour público, um link válido navega imediatamente. Destinos ausentes exigem seleção explícita: o programa não adivinha qual cômodo corresponde à passagem.
- As trocas de cena usam uma transição visual de 480 ms com zoom e linhas de velocidade. Não reconstroem o espaço entre fotografias. O efeito não atrasa a troca de estado, é cancelado em uma nova navegação e usa somente transform/opacity. A preferência de movimento reduzido desativa o efeito espacial.
- O posicionamento dos hotspots pertence ao visualizador: efeitos gerais de pressionar botão não sobrescrevem seu `transform`, inclusive com movimento reduzido. O canvas público é dimensionado pela própria classe, não pela posição de primeiro filho do painel.
- Após publicação, o editor mostra permanentemente o endereço com seleção manual, **Copiar link** e **Abrir tour**. Endereços localhost/loopback recebem aviso explícito: mídia na nuvem não hospeda o frontend.
- A prévia do editor ocupa a altura disponível abaixo do cabeçalho, com saída visível inclusive no celular. O roteiro começa fechado e controles de vídeo/zoom ficam acima das miniaturas. Essa prévia não altera o estado de publicação.
- A prévia identifica o tour e o ambiente atual, oferece navegação anterior/próximo dentro do próprio visualizador (também disponível em tela cheia) e um modo imersivo para ocultar painéis sem remover os hotspots. A entrada na prévia restaura os controles e o botão de VR não implementado foi retirado. O ocultamento dos painéis não afeta o editor.

## Criar uma passagem

1. Adicione ao menos duas cenas 360 do ambiente.
2. Abra a cena de origem, escolha **Link hotspot** e clique na posição da passagem.
3. No painel de propriedades, escolha a cena de destino. O recurso de retorno automático existente pode criar a passagem inversa.
4. Use **Testar como visitante** para conferir entrada e retorno.

Uma cena plana não permite posicionamento panorâmico. A ferramenta não transforma um vídeo comum em reconstrução espacial navegável.

## Verificação

`npm test`: 86 testes passaram, incluindo busca, estrutura, destino válido/inválido e seleção da cena de entrada. `npm run lint` e `npm run build` passaram; permanece o aviso anterior de bundles maiores que 500 kB.

`node tests/run-browser-tour-navigation.mjs`: navegador Chrome, contexto isolado, projeto de teste local, sem upload ou alteração de contas reais. Confere navegação direta, retorno, cartão informativo, sceneId, cancelamento de remoção, busca/filtros e ausência de overflow em desktop, celular e paisagem. As consultas remotas são substituídas por respostas vazias; não comprova publicação remota.

`node tests/run-browser-editor-panel.mjs`: organização de cenas, modo foco, renomeação, persistência e responsividade passaram.

`node tests/run-browser-tour-video.mjs`: reprodução, áudio, posicionamento de hotspot, navegação direta de vídeo 360 para vídeo plano, tela cheia e persistência. O teste marca apenas a própria fixture como publicada no armazenamento do navegador; nenhuma mídia é enviada à nuvem. O teste foi atualizado para a configuração atual com backend conectado e navegação de um clique.

Os cenários de navegação também verificam definir um destino, visitar, excluir/desfazer, persistência, animação ativa, término/limpeza e movimento reduzido. Testes em aparelho físico e medição de desempenho em hardware fraco não foram realizados.

O cenário também verifica endereço restaurado, aviso local, href para abrir tour, cópia na área de transferência e dimensões reais da prévia em 1440×950, 375×844 e 844×390, incluindo botão de saída e ausência de overflow horizontal. Não publica uma fixture no backend real.

## Referência e limites

Os links CloudPano fornecidos não puderam ser lidos pela ferramenta web. A tentativa REA no endpoint local `127.0.0.1:9222` retornou `endpoint_unreachable`; não houve inspeção do Chrome autenticado nem alteração em sua configuração. O painel enviado anteriormente pelo usuário orientou a organização visual. A correção funcional foi derivada do código local e confirmada no navegador: anteriormente o hotspot público abria um cartão e exigia um segundo clique para trocar de cena.
