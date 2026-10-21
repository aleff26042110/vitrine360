# Publicação do Vitrine360

Código em repositório GitHub com branch principal `main`; frontend publicado na Cloudflare Workers Static Assets. A configuração do site está em `cloudflare/wrangler.web.jsonc`, separada do gateway de mídia. O roteamento SPA permite abrir diretamente `/auth`, `/minha-vitrine` e `/account/billing`.

Site: https://vitrine360-web.vitrine360-654558de.workers.dev

Repositório privado: https://github.com/aleff26042110/vitrine360

## Preparação

Use Node.js 24 e instale as dependências com `npm ci`. `.env.production` contém apenas URLs e a chave pública Supabase, incorporadas ao navegador. Credenciais de pagamento e chaves administrativas permanecem no backend. `.env.local` pode substituir os valores públicos durante builds locais; confira o destino antes de publicar.

Execute `npm test`, `npm run lint` e `npm run web:check`. O último comando gera o build e valida a configuração sem publicar. Autentique a CLI com `npx wrangler login`, confirme a conta com `npx wrangler whoami` e publique com `npm run web:deploy`. Use o endereço retornado pela CLI; não presuma que um endereço previsto já está publicado.

## Integrações do novo endereço

Antes de considerar a publicação funcional, acrescente a origem HTTPS retornada ao `ALLOWED_ORIGINS` do gateway de mídia e publique o gateway preservando seus bindings e segredos. Acrescente também a origem ao segredo `BILLING_ALLOWED_ORIGINS` da função Supabase `pix-billing`, preservando origens locais necessárias.

Configure no Supabase Auth o Site URL público e as URLs de redirecionamento de autenticação necessárias. Valide login, confirmação de e-mail e recuperação de senha no endereço publicado. Não altere credenciais, cotas ou dados de contas para testar a hospedagem.

Verifique em navegador a página inicial e uma rota interna aberta diretamente, carregamento dos assets e CORS das integrações. Consultar `/pix-billing/config` é seguro e não gera cobrança. A validação de uma transferência Pix aprovada continua separada da publicação do frontend.

## GitHub

Crie um repositório novo, envie o commit da branch `main` e configure essa branch como padrão. Mantenha arquivos locais, caches da CLI Supabase e segredos fora do Git. O GitHub armazena o código; não usar GitHub Pages para este SaaS comercial, conforme os [limites oficiais](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Verificação da publicação — 2026-10-20

Frontend publicado como `vitrine360-web`, versão `79a7987c-014f-4d6c-bd40-301504b74f51`. Início, autenticação, cobrança e checkout Pix responderam HTTP 200 em acesso direto. O navegador carregou a interface e os módulos de produção, inclusive o checkout Pix disponível, sem erros no console observado.

A origem pública foi adicionada ao CORS do gateway R2 e ao `BILLING_ALLOWED_ORIGINS` da função Pix. Preflights das duas integrações responderam 204 com a origem correta; `/pix-billing/config` respondeu 200 com Pix habilitado. Tentativa de emissão sem autenticação respondeu 401 e não gerou cobrança.

Supabase Auth foi configurado com Site URL público e redirecionamentos `/auth` do site e do desenvolvimento local. A comparação da configuração publicada retornou zero diferenças. Login de uma conta real, entrega de e-mail e transferência Pix paga não foram executados como parte desta publicação.

Verificações locais: 186 testes em 38 arquivos, lint, build e dry-run de assets passaram. Atualizações do código no GitHub não publicam automaticamente o frontend: execute `npm run web:deploy` após validar a alteração. Segredos permanecem nos serviços; credenciais locais e caches não fazem parte do Git.
