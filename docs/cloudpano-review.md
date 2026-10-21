# CloudPano: análise e melhorias aplicadas

Data: 10/10/2026. Escopo: criação e apresentação de giros de produto; referências públicas do CloudPano.

## Evidências

- [Página de spins](https://checkout.cloudpano.com/spin-home): descreve vídeo como entrada, envio por arraste, publicação por link e incorporação em lojas/sites. São declarações públicas do fornecedor, não observações do processamento interno.
- [Orientações de incorporação](https://blog.cloudpano.com/how-to-add-a-360-spin-to-your-website-and-remove-the-scrolling-zoom-option/): recomenda instrução para arrastar e desativa zoom por roda dentro do iframe para não interromper a rolagem da página.
- [Demonstração pública](https://app.cloudpano.com/tours/IfLUP2LTpy): a referência de e-commerce do fornecedor abriu um tour de várias cenas. Observação direta mostrou mídia ocupando a tela, orientação para arrastar, miniaturas e controles discretos para ocultar controles, compartilhar e tela cheia. Este exemplo não comprova processamento de vídeo de produto.
- REA `list_browser_targets`: `ev_64863210de61af4408f7f53b812dfaa7786640329e2b0114ed80ded5f68b8b39`.
- REA `inspect_web_page`: `ev_cd5d92b26c5de30feb0d20c5d31305691d7a137d8c86508013566ef6942bb7de`, alvo `7C14F6648F10D384739FAE09FDA80A25`, Chrome 155, captura em 11/10/2026 UTC. Inspeção passiva de DOM/acessibilidade; script sources e valores de armazenamento não solicitados, cobertura de rede apenas após conexão, origens externas filtradas.

O painel autenticado `https://app.cloudpano.com/tours/Ak9EKp49D/edit` não foi acessível. O navegador aberto do usuário não expõe CDP; a análise REA ocorreu numa instância separada, controlada, com demonstração pública. Não foram observados os algoritmos internos de estabilização, centralização ou segmentação por IA.

## Decisões de implementação

As melhorias abaixo são escolhas do Vitrine360 inspiradas nas referências, não uma alegação de reprodução integral do concorrente:

| Necessidade | Implementação |
| --- | --- |
| Captura e envio simples | Arrastar vídeo ou fotos para o editor, com indicação visual da área de envio |
| Conferir antes de publicar | Botão “Visualizar como visitante”; abre o mesmo visualizador público usando os arquivos locais, sem disponibilizá-los na internet |
| Apresentar o produto | Descrição e preço/chamada persistidos localmente e enviados aos campos existentes de publicação |
| Explorar todos os lados | Controle de ângulo, arraste proporcional à largura do visualizador e quantidade de quadros, reprodução/pausa |
| Priorizar a mídia | Ocultar/mostrar controles, ajuste à tela, tela cheia com alternativa de expansão |
| Reduzir espera ao girar | Pré-carregamento limitado aos quadros vizinhos |
| Colocar em lojas e sites | Código iframe com permissão de fullscreen, visualizador compacto `?embed=1`, sem capturar a roda de rolagem |
| Manter o link atualizado | Atualizar publicação mantendo o endereço existente |

## Validação e limites

### Vídeos em cenas — 11/10/2026

Fonte primária: [Como enviar vídeo 360° ao CloudPano](https://help.cloudpano.com/en/articles/6753502-how-do-i-upload-360-video-to-cloudpano). O fornecedor documenta vídeo panorâmico como cena, sugestão equiretangular por proporção 2:1, vídeo comum de objeto interpretado como Exterior Spin e seleção/correção do tipo antes/depois do envio. Isso confirma suporte a diferentes entradas de vídeo; não confirma que ferramentas de IA, modelos GLB ou plantas aceitem qualquer vídeo para reconstrução automática. `/create` autenticado não foi inspecionado nesta etapa; não houve acesso à sessão do usuário.

Aplicação no Vitrine360: cenas preservam o tipo da mídia independentemente da projeção. Tours aceitam imagens, vídeo 360° em esfera e vídeo comum plano; os giros mantêm extração de quadros de uma captura ao redor do objeto. O usuário pode corrigir a projeção por cena. Não há classificação semântica por IA, centralização automática nem transcodificação adaptativa. A migração 0015 preserva as políticas de acesso e acrescenta vídeo à publicação/restauração. Verificação remota em Supabase permanece pendente.

Compilação de produção e 23 testes existentes passaram. Fluxo real no Chrome na porta 5188 verificou prévia, descrição/preço após recarregar e voltar à edição, reprodução/pausa, ângulo, ocultar controles, tela cheia, envio de foto por arraste e layout de 390 px sem rolagem horizontal; sem erros de JavaScript. Um WebM real gerado com MediaRecorder foi enviado por arraste e convertido em 24 quadros pelo fluxo de produção.

O envio real para Supabase e a incorporação em um site externo não foram executados nesta análise. A geração de iframe e o envio dos metadados usam o fluxo de publicação já existente. Centralização de objeto e remoção/desfoque de fundo por IA continuam fora desta implementação.
