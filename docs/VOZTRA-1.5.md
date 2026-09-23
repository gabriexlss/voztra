# Voztra 1.5 — checkpoint local

Atualizado em 23/09/2026.

## Publicação concluída

Release pública: https://github.com/gabriexlss/voztra/releases/tag/v1.5.0

- Tag v1.5.0 no commit 7b9064f62abd82006e4bb073211d6b4866a33754.
- Workflow 35911461477 concluiu com sucesso em Windows e Ubuntu 22.04, incluindo testes dos executáveis empacotados.
- Oito arquivos: setup, portable, AppImage, deb, blockmap, manifestos Windows/Linux e SHA256SUMS.txt.
- Checksums da lista comparados aos digests do GitHub; latest.yml aponta para o setup 1.5.0.
- Publicada como versão estável mais recente em 23/09/2026. Pacotes gerados no CI para poupar espaço local.
- Próximos bugs devem ser tratados em patch; permanecem as limitações de validação real de Live, OpenAI e inferência NVIDIA.

## Autorização de publicação

Após validar também o Transcribe, o usuário autorizou gerar e publicar a 1.5.0, aceitando a ausência de testes reais de Live, OpenAI e inferência NVIDIA. Builds Windows e Linux serão feitas pelo workflow; publicar somente depois das verificações.

## Registro anterior à autorização

O usuário autorizou implementar, compilar e testar localmente, inclusive abrir o aplicativo. A restrição é publicar: não fazer push, tag, release ou instalador definitivo sem nova autorização. A 1.4.0 continua publicada e package.json continua em 1.4.0. As alterações da 1.5 estão locais. A rejeição anterior da compilação local foi resolvida pela autorização explícita; não constitui bloqueio atual.

## Implementação

- Workers Python separados para Whisper, APIs e manutenção GPU. API não importa CTranslate2, catálogo ou benchmark local; somente Whisper configura o runtime CUDA.
- Troca encerra e aguarda o processo anterior. Transcrição, lote e microfone impedem a troca. Consulta auxiliar do catálogo pode ser interrompida ao trocar, sem limpar a operação nova por uma resposta antiga.
- Confirmações em AlertDialog centralizado com portal shadcn/Radix. Seletores de arquivos continuam nativos; erro fatal antes de existir janela mantém a caixa de erro de inicialização.
- Nova conexão/edição em Dialog com rolagem e rodapé acessível. Rascunhos e chaves em memória permitem buscar, selecionar e testar antes de salvar.
- Motores seleciona conexão; Modelos alterna entre biblioteca Whisper e catálogo remoto. Consulta a cada entrada, busca sem filtro de compatibilidade, identificador manual, teste explícito e salvamento opcional.
- Aba GPU exclusiva. Serviço independente instala/remove bibliotecas NVIDIA; API ativa não executa manutenção no seu worker. Whisper é descarregado antes de alterar DLLs. Cancelamento de instalação usa o serviço dedicado. Consultas simultâneas de status compartilham uma única solicitação.
- Migração dos perfis v1 para v2 com backup, preservação de prompts e chaves cifradas. Modo de instrução explícito: usuário, sistema ou nenhum. Interactions/Live migrados sem instrução automática.
- Gemini Interactions lê o texto de steps/model_output/content no REST e mantém compatibilidade com outputs/output_text. Status incompleto é comunicado como erro, não como transcrição completa. Não há retentativa paga automática.
- Corrigida inicialização NumPy/PyAV na thread principal do worker API: a primeira importação na thread de comando podia travar no Windows/Python 3.14.
- Preservado envio de prompt no protocolo OpenAI Chat, conforme modo escolhido.

## Validação

- TypeScript passou; compilação electron-vite local passou (out/, main com bytecode V8). Nenhum instalador gerado.
- 32 testes Python passaram, incluindo resposta REST Interactions, importações isoladas, primeira requisição em processo limpo, áudio, modelos e redistribuíveis.
- Suíte Electron anterior: 12 passaram e 4 opcionais foram ignorados. Incluiu migração, catálogo atualizado, rascunhos, lote remoto, microfone simulado, temas claro/escuro e janela mínima.
- Transcrição real com Whisper tiny/CPU passou no teste opcional.
- Gemini real: usuário inseriu a chave no próprio app. Modelo models/gemini-3.5-transcribe, protocolo gemini-interactions, instructionMode none. A amostra foi transcrita com sucesso em aproximadamente 2 segundos após corrigir o parser. Chave não lida nos scripts, não registrada e não enviada ao chat; mantida em memória do app. Perfil de teste salvo sem guardar chave, apenas para reiniciar seu worker.
- Regressão final de Motores e interface: 3 testes passaram após as últimas correções.
- Teste NVIDIA detectou concorrência entre consultas de status após instalar. Corrigida por compartilhamento da solicitação; uma repetição foi interrompida pelo mínimo de espaço livre (menos de 4 GiB). DLLs temporárias da rodada anterior foram removidas, e o teste agora limpa suas DLLs mesmo se falhar. Regressão final passou: instalação real das DLLs, consulta de status concorrente, remoção e preservação de modelos (36 segundos).
- TypeScript, ESLint sem erros, Ruff e git diff --check passaram na conferência final.

## Teste manual e limitações

Janela de teste usa .cache/manual-gemini-1.5, separada dos dados da instalação. Pode permanecer aberta para o usuário. A chave em memória se perde ao fechar; nunca solicitar chave no chat.

Ainda não validado em hardware NVIDIA, Linux, OpenAI real ou Gemini Live real. Testes locais de protocolos usam servidores simulados. Instalar DLLs não comprova inferência em GPU. Ferramenta nativa de controle do computador falhou ao iniciar; testes visuais foram feitos diretamente no Electron com Playwright.

Próxima etapa: usuário testa a interface e informa novos bugs. Publicação/build definitiva somente quando autorizadas. Não repetir chamadas pagas sem necessidade de validar uma correção.

## Referências

- https://ai.google.dev/gemini-api/docs/transcribe
- https://ai.google.dev/api/interactions-api

Consultadas em 23/09/2026. Planejamento completo em PLANEJAMENTO-1.5.md.
