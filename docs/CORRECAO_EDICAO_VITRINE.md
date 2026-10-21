# Edição, produtos e temas da vitrine — 21/10/2026

## Diagnóstico comprovado

- O frontend oferecia nove temas, mas `public.valid_storefront_document` no banco conectado aceitava cinco. A consulta de validação retornou `false` para Jardim Botânico, Estúdio Nórdico, Art Déco e Concreto Brutal.
- Joalheria e Concessionária usavam variáveis CSS com `!important`, sobrescrevendo a paleta do criador. No Chrome, a cor escolhida `#FFFFFF` continuou computada como `#100f14`.
- Alterações existiam apenas no estado React até clicar em salvar. Reprodução antes da correção: digitar “Nome novo sem salvar”, criar objeto, voltar: o campo retornava para “Minha Vitrine”. O link de retorno do editor apontava para `/`.
- A retirada de todos os itens podia exibir novamente os exemplos, confundindo a seleção vazia com conteúdo que não tinha sido removido. Não havia ação explícita para limpar os dados do rascunho.

As evidências de navegador anteriores à mudança estão em `.tmp-ui/storefront-repair/before.json` e `before.png`, ignoradas pelo Git. O portal do usuário estava sem sessão da conta; não foi usada a conta pessoal para alterar ou publicar conteúdo.

## Comportamento implementado

- Cada edição preserva uma cópia local, separada por conta, inclusive antes de navegar para criar produto. Falhas no armazenamento mostram aviso. Uma leitura atrasada da conta não substitui alterações locais pendentes.
- “Limpar dados da vitrine” limpa os dados e a seleção do rascunho, com confirmação e opção de desfazer; preserva os arquivos e o endereço. “Remover todos da vitrine” remove a seleção, sem apagar os produtos da biblioteca. Exemplos não reaparecem após recarregar um rascunho existente.
- A criação originada na vitrine conserva `?from=storefront`, inclusive na prévia do produto. O botão “Adicionar à vitrine” confirma a gravação local, retorna à aba Itens e seleciona o produto. O link de voltar leva à vitrine.
- Salvar na conta e publicar continuam ações distintas. Operações de conta/publicação têm prazo e mensagens de falha; publicação sem confirmação orienta conferir o link antes de tentar novamente.
- Nove temas completos, com paletas e fontes sugeridas. É possível manter as cores ao mudar de tema ou personalizá-las depois. Nenhum tema força uma cor sobre a escolhida.
- Novas opções: foto inteira ou preenchida, espaçamento amplo ou compacto, preços e descrições visíveis ou ocultos. Campos opcionais mantêm compatibilidade com documentos antigos.
- A migração `20261021192609_storefront_editing_and_themes.sql` amplia somente o catálogo e o formato de apresentação aceito. Permissões, isolamento de contas, cotas e autorização dos itens permanecem aplicados.

## Verificação

- 210 testes em 40 arquivos, lint e build passaram. Aviso anterior de tamanho do chunk Three.js continua presente.
- `tests/run-browser-storefront-repair.mjs`: nove temas em cores claras e escuras, larguras 390/1440, opções visuais, editar → enviar duas imagens → adicionar → retornar → recarregar, remoção, limpeza, desfazer e validação.
- `tests/run-browser-storefront-account.mjs`: cliente Supabase real com transporte simulado; substituição do rascunho autenticado, seleção vazia, preservação da publicação, falha de rede e recuperação, novo tema e publicação explícita.
- Testes existentes `run-browser-storefront.mjs` e `run-browser-storefront-actions.mjs` passaram.
- Capturas de nove temas em computador e celular em `.tmp-ui/storefront-repair/theme-*.png`; amostras visuais examinadas. Detector de interface sem achados.
- Migração aplicada no Supabase conectado. A função real de salvar foi exercitada para todos os nove temas, com seleção vazia e campos novos; o snapshot público foi comparado e preservado. Todas as alterações de teste foram revertidas na mesma transação, e a linha completa foi comparada antes/depois.
- Advisor revisado: nenhum apontamento para a função de validação alterada. Os leitores públicos existentes continuam classificados como SECURITY DEFINER intencional; permissões anônimas às tabelas privadas não foram ampliadas.
- Frontend publicado na Cloudflare: versão `857f66e8-d1fa-4584-986a-d39beb8be07e`. Os dois novos testes de navegador passaram também contra os arquivos de produção, usando armazenamento isolado e transporte simulado apenas no teste de conta.
- Leitura real, sem interceptar API/mídia: `/v/minha-vitrine` abriu o produto existente com 48 quadros; prévia em 1.011 ms, segunda volta com mediana de 35 ms e zero novas requisições, nenhum erro de JavaScript. Medição desta execução, não garantia de tempo em outras conexões.
- Portal Maestri existente recarregado no editor, com o botão de limpeza e bundle novo `index-BEivEHN4.js` confirmados.

Para atualizar a página dos visitantes, use **Publicar vitrine** depois de alterar o rascunho. A cópia automática é local; **Salvar rascunho** sincroniza com a conta.
