# Integrações de geração 3D e reconstrução

Revisão das documentações oficiais em 10/10/2026. Valores e limites de fornecedores podem mudar; revalidar antes de habilitar produção.

## Tripo — gerar objetos, não reconstruir ambientes

- API v3: `https://openapi.tripo3d.ai/v3`; autenticação por bearer API key.
- Fluxo assíncrono: enviar imagem, criar tarefa de image-to-model ou multiview-to-model, persistir o `task_id`, consultar status/progresso, validar saída, copiar o GLB para armazenamento da conta e permitir revisão.
- A documentação descreve tasks com estados `queued`, `running`, `success`, `failed` e `cancelled`; a API recomenda polling a cada 1–2 segundos, com timeout do nosso lado.
- Upload da API aceita JPEG/PNG até 20 MB; arquivos maiores que 60 MB têm caminho de upload grande, relevante para modelos de entrada. Não enviar chave API ao navegador.
- O app implementa image-to-model v3, polling autenticado por proprietário, armazenamento privado e cópia imediata do resultado. O fluxo ainda precisa ser implantado e validado contra Supabase e Tripo reais.
- Preço exibido hoje: 1 crédito = US$ 0,01; image-to-3D aparece como 20 créditos sem textura ou 30 com textura padrão (aprox. US$ 0,20/US$ 0,30), antes de add-ons e impostos. O preço oficial é variável.
- Direitos comerciais são condicionados ao plano/termos da conta. A página oficial diferencia usuários pagos e gratuitos; antes de oferecer saídas comercialmente, validar o plano e os direitos de entrada/saída. O usuário também precisa ter direitos sobre a foto fornecida.
- Tripo gera um objeto; isso não satisfaz a reconstrução navegável de uma sala inteira.

## Polycam Reconstruction API — reconstrução de ambientes

- API oficial em `https://poly.cam/api/v1`, bearer token com escopo `reconstruct`. A habilitação é limitada por workspace e exige acesso Enterprise aprovado; há créditos pré-pagos.
- Fluxo oficial: criar capture/job, receber URL assinada, enviar `session.zip`, confirmar o upload e acompanhar job via estado/webhook.
- Cada archive contém pelo menos 20 keyframes. Uploads muito grandes podem usar multipart com partes assinadas e ETags. O modo `splat` exige `frames.json` no formato Polycam com poses/intrínsecos; imagens comuns sem pose não são automaticamente um archive splat válido.
- Limites padrão documentados: 25 jobs por janela móvel de 24 h e 2 jobs concorrentes; jobs que falham ainda consomem a cota diária. O endpoint de uso informa saldo e cotas.
- Um exemplo de criação de capture mostra cobrança de 600 créditos, mas a documentação aberta não fornece conversão confiável dos créditos para USD. O custo precisa ser confirmado com a conta Enterprise antes de ativar.
- O API também permite listar e exportar capturas existentes; não confundir esse fluxo de Content Management com reconstrução de novas imagens.

## Nerfstudio — alternativa própria com GPU

- Código aberto Apache 2.0 segundo o projeto. O stack envolve Python, PyTorch, CUDA, COLMAP/gsplat e extensões nativas; a documentação recomenda Linux. Windows é descrito como menos testado e mais frágil.
- O método Splatfacto declara aproximadamente 6 GB de memória para o modelo padrão e 12 GB para a variante maior, além de memória compartilhada suficiente para o container/processo. Isso é referência de treinamento, não uma garantia de capacidade para todos os vídeos.
- Splatfacto exporta Gaussian splats PLY para viewers compatíveis; a documentação não apresenta exportação de mesh nessa opção. A entrega no browser precisa de viewer de splat, otimização e benchmark móvel próprios.
- Custo direto de licença do projeto: sem taxa de licença Apache; custo operacional real inclui GPU, armazenamento, fila, engenharia/monitoramento e consumo de energia ou instância em nuvem. Não instalar pipeline no computador do usuário final.

## Decisão de arquitetura

1. Tripo fica atrás de um `ObjectGenerationProvider` para gerar objetos; a chave e chamadas ficam em Edge Function/worker. Persistir id/status/tentativas/erro sem segredos; limitar créditos e exigir aceite antes de uma tarefa cobrada.
2. Polycam fica atrás de `EnvironmentReconstructionProvider` quando uma conta Enterprise com escopo e orçamento estiver aprovada. Não criar o capture até validar a cota e o tamanho do upload.
3. Nerfstudio fica como adaptador alternativo de worker Linux/GPU, fora do app web. Comparar qualidade, tempo e custo com capturas de teste autorizadas antes de selecionar produção.
4. O contrato de resultado deve distinguir `model_glb`, `gaussian_splat`, `mesh` e `panorama`; só publicar depois de o usuário aceitar o resultado e o viewer correspondente ter sido validado.

## Referências oficiais

- [Tripo API introduction e padrão assíncrono](https://developers.tripo3d.ai/en/docs/introduction)
- [Tripo upload de arquivos e limites](https://developers.tripo3d.ai/en/docs/files)
- [Tripo pricing](https://developers.tripo3d.ai/en/pricing)
- [Tripo orientação de uso comercial](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)
- [Polycam Reconstruction API](https://poly.cam/docs/api/reconstruction)
- [Polycam Content Management API](https://poly.cam/docs/api)
- [Nerfstudio installation](https://docs.nerf.studio/quickstart/installation.html)
- [Nerfstudio Splatfacto, memória e export](https://docs.nerf.studio/nerfology/methods/splat.html)
- [Nerfstudio license](https://github.com/nerfstudio-project/nerfstudio/blob/main/LICENSE)
