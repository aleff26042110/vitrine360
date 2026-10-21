# Publicação do Vitrine360

Código em repositório GitHub com branch principal `main`; frontend publicado na Cloudflare Workers Static Assets. A configuração do site está em `cloudflare/wrangler.web.jsonc`, separada do gateway de mídia. O roteamento SPA permite abrir diretamente `/auth`, `/minha-vitrine` e `/account/billing`.

## Preparação

Use Node.js 24 e instale as dependências com `npm ci`. `.env.production` contém apenas URLs e a chave pública Supabase, incorporadas ao navegador. Credenciais de pagamento e chaves administrativas permanecem no backend. `.env.local` pode substituir os valores públicos durante builds locais; confira o destino antes de publicar.

Execute `npm test`, `npm run lint` e `npm run web:check`. O último comando gera o build e valida a configuração sem publicar. Autentique a CLI com `npx wrangler login`, confirme a conta com `npx wrangler whoami` e publique com `npm run web:deploy`. Use o endereço retornado pela CLI; não presuma que um endereço previsto já está publicado.

## Integrações do novo endereço

Antes de considerar a publicação funcional, acrescente a origem HTTPS retornada ao `ALLOWED_ORIGINS` do gateway de mídia e publique o gateway preservando seus bindings e segredos. Acrescente também a origem ao segredo `BILLING_ALLOWED_ORIGINS` da função Supabase `pix-billing`, preservando origens locais necessárias.

Configure no Supabase Auth o Site URL público e as URLs de redirecionamento de autenticação necessárias. Valide login, confirmação de e-mail e recuperação de senha no endereço publicado. Não altere credenciais, cotas ou dados de contas para testar a hospedagem.

Verifique em navegador a página inicial e uma rota interna aberta diretamente, carregamento dos assets e CORS das integrações. Consultar `/pix-billing/config` é seguro e não gera cobrança. A validação de uma transferência Pix aprovada continua separada da publicação do frontend.

## GitHub

Crie um repositório novo, envie o commit da branch `main` e configure essa branch como padrão. Mantenha arquivos locais, caches da CLI Supabase e segredos fora do Git. O GitHub armazena o código; não usar GitHub Pages para este SaaS comercial, conforme os [limites oficiais](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

Esta documentação descreve o procedimento. A existência de um repositório remoto e de um site público precisa ser comprovada após autenticação e publicação.
