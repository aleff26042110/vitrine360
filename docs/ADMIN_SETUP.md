# Administração do Vitrine360

Em 2026-10-11 foi provisionada a conta solicitada `aleff@gmail.com`, somente no projeto novo `msovfbuhehaiousuzbwr`. O projeto antigo não foi acessado. A migração `0018_site_administration.sql` acrescenta uma tabela protegida de membros e duas RPCs. Agora há 18 migrações registradas e 19 tabelas públicas com RLS.

## Acesso atual — login normal

A pedido explícito do proprietário, a conta `aleff@gmail.com` foi configurada para login comum com a senha escolhida por ele. O e-mail foi confirmado administrativamente e a permissão administrativa preservada. A senha e a chave de servidor foram recebidas somente em stdin sem eco e não foram gravadas no código, configurações ou documentação.

O teste real de `signInWithPassword` confirmou a identidade esperada; `is_site_administrator()` e `site_admin_overview()` responderam com sucesso nessa sessão. A sessão de verificação não foi salva no navegador. O acesso é `http://127.0.0.1:5188/auth?returnTo=%2Fadmin`.

O arquivo de convite anterior foi removido definitivamente por conter uma credencial temporária desnecessária. Não é preciso abrir convite nem definir outra senha para entrar. Recomenda-se posteriormente trocar a senha escolhida, pois foi compartilhada no chat.

## Histórico — convite substituído

Inicialmente foi gerado um convite pessoal de uso único em `C:/Users/Administrator/.vitrine360/admin/definir-senha.local.html`. Esse arquivo foi removido quando o proprietário escolheu o login normal. Ficava fora do repositório e do diretório servido pelo Vite, com acesso NTFS apenas para o usuário atual e SYSTEM; nenhum e-mail foi enviado.

O fluxo de convite permanece implementado para uso futuro, mas não é necessário para esta conta. Tokens de convite ficam no fragmento da URL e são removidos após verificação; nunca reutilizar um token já consumido.

Depois, entrar com e-mail/senha em `/auth?returnTo=%2Fadmin`. O menu **Administração** aparece após confirmação da permissão pelo banco.

## Autoridade e limites

- A autoridade vem de `site_administrators.user_id`, não de e-mail, `user_metadata`, localStorage ou um botão escondido.
- Usuários comuns não podem consultar/inserir/excluir membros. A chave de servidor não existe no frontend.
- `site_admin_overview()` verifica a identidade em toda chamada. Revogar o membro bloqueia a chamada imediatamente, sem esperar renovação do JWT.
- O painel é somente leitura: totais de contas/tours/giros/modelos/publicações, reservas e operações R2, até 20 títulos de tours recentes. Não oferece exclusão, alteração de usuários, acesso a arquivos privados de terceiros ou promoção de outros administradores.
- As políticas normais de propriedade de projetos não foram ampliadas. Esta é uma conta administrativa do site, não uma conta de proprietário da plataforma Supabase/Cloudflare.

## Verificação

O provisionador usa chave de servidor por stdin sem eco e não registra credenciais. Uma conta temporária com autenticação real validou recusa de acesso comum e de metadata `role=admin`, concessão de membro pelo servidor, resposta da RPC administrativa, revogação imediata e bloqueio de autopromoção pelo cliente. A conta temporária foi removida. O convite do proprietário não foi consumido nos testes: a definição da senha e seu primeiro login dependem do usuário.

Testes SQL locais cobrem a migração idempotente e as permissões. Testes do cliente cobrem a resposta administrativa e o convite de uso único, incluindo montagem duplicada React e token expirado. A interface é testada sem consumir o convite, com recusa anônima real e fixture somente de apresentação para o painel autorizado.

O instalador do banco valida os digests já registrados e aplica apenas a extensão ainda pendente. Não altera as migrações antigas nem reaplica seus efeitos.

Verificação final: 81 testes em 17 arquivos passaram; lint e build passaram, com o aviso pré-existente de chunks maiores que 500 kB. A segunda execução do instalador remoto confirmou 18 digests sem reaplicação. O navegador verificou recusa anônima real, layouts de 375 e 1440 pixels sem erros e o fluxo de convite/definição de senha com transporte simulado, sem consumir o convite real. O acesso HTTP do Vite ao arquivo de ativação externo foi recusado com 403. A ACL do arquivo contém somente SYSTEM e o usuário atual.
