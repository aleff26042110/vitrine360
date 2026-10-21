# Vitrine360 — galeria habitável

## Vitrines individuais — clarificação do produto
Cada criador escolhe o tema da própria vitrine em /minha-vitrine. O design editorial da plataforma é somente o estúdio: não é uma aparência obrigatória para as páginas públicas.

As vitrines têm modelos Editorial, Galeria e Showroom; cores livres para fundo/destaque, paletas iniciais e tipografia editorial ou contemporânea. Tokens --sf-* pertencem ao contêiner da vitrine e não alteram o painel nem a cor das mídias.

Prévia usa itens do criador ou exemplos explicitamente identificados, que nunca são publicados automaticamente. Objetos e veículos reais abrem seus visualizadores 360° existentes. Páginas públicas seguem /v/:slug.

Rascunho por conta e snapshot público são separados. Publicar exige que todos os itens sejam publicados e pertençam ao criador; a leitura pública filtra novamente propriedade e status. Rascunhos locais de contas diferentes têm chaves separadas. A migração 20261016045827_personalized_storefronts.sql está preparada e testada em PGlite; ainda não foi aplicada no servidor conectado.

## Direção
Redesign solicitado pelo usuário: luxo contemporâneo, nova fonte, mais interação e animação. Pesquisa externa de Hermes e implementação de Codex. Escolha editorial feita a partir do briefing; a preferência opcional de paleta não foi respondida durante esta sessão.

O painel continua sendo um estúdio de trabalho (Operate); a apresentação em /welcome convida a descobrir o produto (Persuade). O conteúdo real e os fluxos existentes continuam como autoridade funcional.

## Identidade
- Campo principal: marfim #F4EFE6.
- Navegação, estrutura e CTA: verde profundo #153A32.
- Texto: #182E26; texto secundário #626557.
- Detalhes e títulos em itálico: bronze #8A5A36.
- Painéis: #FFFCF7; divisores #DCD6CA.
- Bodoni Moda para títulos expressivos e numerais grandes; Manrope para interface, instruções e leitura. Fontes hospedadas em public/fonts com suas licenças OFL.
- Filetes, cantos discretos, fotografia em escala ampla, controles convencionais. Sem brilho neon, gradientes decorativos ou alteração da cor das mídias do usuário.

## Interação e movimento
ExperiencePreview oferece três inspirações fotográficas, botões de próximo/anterior, controle de enquadramento por slider e teclado e um detalhe expansível. É uma demonstração com imagens ilustrativas, explicitamente identificada; não simula um tour 360 real. As demonstrações reais do produto permanecem em /explore.

A foto entra já visível com uma aproximação discreta; troca apenas mediante interação. Hover dá retorno a links, fotos e botões. Foco de teclado não espera animações. prefers-reduced-motion desativa entradas, transições e rolagem suave. A navegação móvel tem fechamento explícito, Escape, contenção de Tab e restauração de foco.

## Composição
Barra lateral verde no desktop, drawer até 1000px; painel marfim com biblioteca e ferramentas reais. Prévia fotográfica ao lado de uma frase editorial, métricas reais em uma faixa leve, formatos de criação e biblioteca a seguir. No celular, coluna única para a prévia e grade de duas colunas para formatos.

## Referências e ativos
Pesquisa: Aman (https://www.aman.com/), Rosewood (https://www.rosewoodhotels.com/en/default), OMA (https://www.oma.com/projects), Matterport (https://matterport.com/) e Kuula (https://kuula.co/). São referências de composição e interação; não há afiliação nem alegação de aumento de vendas.

Fotografias demonstrativas, hospedadas localmente, provenientes do Unsplash:
- Interior: https://images.unsplash.com/photo-1600210492486-724fe5c67fb0
- Objeto: https://images.unsplash.com/photo-1523275335684-37898b6baf30
- Arquitetura: https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea
- Veículo demonstrativo da personalização: https://images.unsplash.com/photo-1492144534655-ae79c964c9d7
- Termos: https://unsplash.com/license

Fontes: https://fonts.google.com/specimen/Bodoni+Moda e https://fonts.google.com/specimen/Manrope.

## Verificação
Teste de navegador: tests/run-browser-luxury-theme.mjs. Evidências em .tmp-ui/luxury. Verifica interação, teclado, drawer, fontes, movimento reduzido, contraste das amostras de texto e ausência de overflow a 375/768/1024/1440px. O teste existente dos editores foi executado também contra o servidor local, preservando a cor de mídia.

Não confundir essa amostragem com certificação integral de acessibilidade. A suíte de migrações do banco apresentou duas falhas em testes que carregam exclusivamente SQL; as migrações não foram alteradas no redesign.
