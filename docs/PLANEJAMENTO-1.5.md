# Voztra 1.5 — correções de motores e experiência de configuração

Status: implementação local autorizada em 23/09/2026. Manter versão de pacote e releases inalteradas até os testes do usuário. Não gerar instalador/build definitiva nem publicar a 1.5 nesta etapa. A 1.4 já está publicada, com seus problemas conhecidos nas notas. Retomada técnica em VOZTRA-1.5.md.

## 1. Diagnóstico do Gemini (prioridade P0)

Erro relatado: `Developer instruction is not enabled for this model` (HTTP 400). A mensagem indica rejeição à instrução system/developer pelo modelo/endpoint utilizado. Ainda precisamos registrar o identificador exato do modelo, protocolo e parâmetros sem credenciais para reproduzir o caso específico.

Evidência local: o fluxo que troca o provedor para Gemini mantém o prompt base e escolhe Generate Content; o adaptador envia `systemInstruction` sempre que há instruções. Interactions e Live também podem enviar instruções de sistema quando preenchidas. A correção não será apenas ocultar a mensagem.

- Separar instruções editoriais, contexto de transcrição e campos de sistema na serialização de cada protocolo.
- Gemini multimodal: oferecer envio como texto do usuário junto ao áudio, sem systemInstruction automático. Modo system apenas explicitamente configurado nos ajustes avançados.
- Gemini Transcribe dedicado: modo sem instruções de sistema/developer, usando somente os parâmetros de transcrição suportados pelo protocolo; vocabulário/contexto não deve ser convertido automaticamente em system prompt.
- Preservar as instruções do usuário no rascunho; não apagar ou ignorar texto silenciosamente. Explicar o que efetivamente será enviado e permitir mudar o modo.
- Após essa rejeição, oferecer ação explícita para testar sem instruções; nunca repetir automaticamente uma chamada potencialmente cobrada nem registrar sucesso sem texto válido.
- Continuar sem filtros ou bloqueios de modelos por nome. O teste do usuário permanece a verificação efetiva; JSON avançado permanece disponível.
- Perfis 1.4 serão preservados. Revisar a migração das opções de instruções com indicação visível das mudanças, sem sobrescrever personalizações silenciosamente.

Aceite: reproduzir o erro original; inspecionar o corpo enviado sem segredos; confirmar ausência de system/developer no modo dedicado e resultado correto no teste manual do usuário.

## 2. Navegação: Motores escolhe o provedor; Modelos escolhe o modelo

A única área que apresenta alternativas de motores será o seletor de motor (na aba Motores e no acesso rápido). Ela precisa listar alternativas para permitir a troca; os painéis operacionais sempre pertencem exclusivamente ao motor ativo.

| Área        | Whisper ativo                                                    | API ativa                                                           |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Motores     | Resumo e configuração do motor local                             | Provedor, conexão, credencial e endereço                            |
| Modelos     | Biblioteca Whisper, download, exclusão, carga manual, comparação | Catálogo remoto, busca, seleção, teste de conexão e teste com áudio |
| Transcrição | Modelo local carregado, CPU/GPU e compute type                   | Modelo remoto, estado da conexão e opções próprias do protocolo     |
| Cabeçalho   | Motor local e monitor de recursos                                | Provedor ativo e o mesmo monitor geral                              |

Não exibir cartões CUDA nas telas Motores, Modelos ou Transcrição em modo API. Não exibir modelos Whisper, compute type, botões de carga ou download local com API ativa. Não exibir configurações de API com Whisper ativo. O monitor de recursos do sistema e o histórico permanecem compartilhados; registros antigos mantêm a identificação do motor que os gerou.

Fluxo API: escolher motor/provedor → preencher chave/URL em modal → continuar com rascunho em memória → abrir Modelos → buscar catálogo, escolher e testar → salvar opcionalmente → transcrever. Sem modelo selecionado, apresentar estado de configuração pendente, não controles Whisper.

### Aba GPU: gerenciamento independente de aceleração local

- Criar uma aba própria chamada **GPU**, separada de Motores e Modelos. Mover para ela o gerenciamento atual das bibliotecas NVIDIA/CUDA: estado, instalação opcional, remoção e diagnóstico.
- Usar o nome GPU porque a área abrangerá bibliotecas de aceleração e compatibilidade, não apenas drivers do sistema. Distinguir o driver instalado no computador das bibliotecas opcionais gerenciadas pelo Voztra.
- Estruturar a área por backend/fabricante, permitindo adicionar AMD/ROCm e Intel futuramente. Nesta versão, apenas NVIDIA/CUDA terá integração funcional; não apresentar suporte futuro como disponível.
- A aba é uma ferramenta de manutenção global e pode ser acessada com qualquer motor selecionado, sem carregar Whisper, modelos ou iniciar inferência. A escolha de CPU/GPU para transcrever continua exclusiva das configurações do motor local.
- Executar manutenção por serviço/processo dedicado e somente mediante ação explícita; não importar CUDA no worker API. Bloquear alterações de bibliotecas durante tarefas ativas ou enquanto estiverem em uso, solicitando descarregamento seguro quando necessário.
- Usar os mesmos componentes shadcn, confirmações em modal e estados de progresso/erro previstos para o restante da interface.

## 3. Consulta e teste antes de salvar (P0)

- Separar configuração ativa em memória, rascunho de edição e perfil persistido. Salvar não será pré-requisito para conexão, catálogo, teste ou uso da configuração temporária.
- O processo principal recebe e valida o rascunho pelo IPC restrito, mantendo a chave fora de logs, snapshots, histórico e arquivos. Cancelar/descartar remove esse estado transitório.
- Operações API só são executadas depois de ativar o contexto API. Não iniciar um worker API oculto enquanto Whisper continua ativo.
- Ao entrar na aba Modelos em modo API, iniciar uma consulta nova ao provedor com a configuração atual. Repetir ao trocar provedor, credencial ou URL válida e oferecer Atualizar. Nenhum catálogo hardcoded.
- Não consultar a cada tecla: concluir a edição/aplicar o rascunho antes da busca, evitando enviar chaves incompletas. Cancelar ou invalidar buscas antigas ao mudar contexto para uma resposta antiga não substituir o catálogo novo.
- Exibir loading, vazio, autenticação inválida, timeout e falha de rede. Um catálogo anterior pode ficar visível com aviso de desatualizado, mas nunca substituir silenciosamente a nova busca.
- Preservar identificador manual quando o servidor não implementar listagem. Não remover modelos apenas porque a aplicação não sabe sua modalidade.
- Diferenciar consulta de modelos de teste real de transcrição. O segundo envia a amostra curta somente por clique, informa cobrança possível e apresenta texto ou erro.
- Vincular o resultado do teste à configuração exata: alterar modelo, URL, chave, prompt ou JSON torna o resultado anterior desatualizado.

## 4. Modais shadcn e hierarquia visual (P1)

- Usar Dialog para Nova conexão, Editar conexão, parâmetros avançados extensos e detalhes que exigem foco.
- Usar AlertDialog para confirmar troca de motor, exclusão, remoção de bibliotecas e descarte de alterações. Auditar todas as confirmações do aplicativo, inclusive encerrar durante transcrição: não usar showMessageBox, window.confirm ou alert para essas decisões.
- Modais centralizados por portal, com overlay, título/descrição acessíveis, foco contido e restaurado, suporte a teclado, temas e movimento reduzido.
- Formulários grandes terão altura limitada à janela e rolagem interna, mantendo cabeçalho e ações acessíveis. Nada de acrescentar um formulário grande no fim da página ou empilhar modais indefinidamente.
- Manter Popover somente no acesso rápido compacto. Fechar o popover antes de abrir a confirmação central.
- Rascunhos sobrevivem à navegação planejada entre Motores e Modelos; descartar alterações exige confirmação. Salvar/Cancelar devem ter semântica explícita.
- Seletores nativos de arquivos para abrir/exportar continuam como integração de arquivos do sistema; as confirmações de decisões usam sempre a UI shadcn.

## 5. Isolamento real no código e nos processos (P0)

A 1.4 já encerra o processo ao trocar motor, mas ainda tem imports, comandos e componentes compartilhados que pertencem a motores específicos. A 1.5 deve corrigir a separação, não apenas aplicar CSS para esconder controles.

- Frontend: páginas de Modelos específicas por motor, estado de rascunho separado, contratos discriminados e montagem condicional/lazy de componentes. Efeitos e consultas do motor inativo não rodam.
- Electron: gerenciador de ciclo de vida com estados inativo, configurando, pronto, ocupado, encerrando e erro; validação por motor no IPC, não só no renderer.
- Python: entradas/dispatchers próprios para Whisper e APIs. Em API não importar catálogo/download/benchmark Whisper, CTranslate2 ou CUDA. Em Whisper não importar clientes HTTP/WebSocket de provedores. Serviços neutros de áudio, protocolo e métricas podem ser compartilhados.
- Manutenção NVIDIA fica na aba GPU, desacoplada dos motores e executada em processo dedicado quando necessário. Sua execução não inicia o motor local nem carrega modelos. Ausência de GPU não deve ativar código de inferência CUDA.
- Troca confirmada: bloquear novas ações, cancelar apenas consultas auxiliares, fechar o worker anterior, aguardar a saída e então iniciar o destino. Transcrição, gravação, lote ou operação mutável ativa impedem a troca.
- Validar novamente o estado no main após a confirmação; o contexto pode mudar enquanto o modal está aberto. Confirmação deve corresponder à origem e destino apresentados.
- APIs externas e servidores localhost pertencem ao usuário: encerrar somente conexões e processos do Voztra.

## 6. Migração e preservação

Manter perfis, nomes, credenciais cifradas, histórico por solicitação, modelos baixados, temas e exportações. Versionar a configuração nova e fazer migração recuperável. Não incluir segredos em diagnósticos exportados. Não alterar manualmente o cache de modelos para adaptar a nova navegação.

## 7. Entrega em etapas e testes

1. Reprodução do Gemini e contratos de instruções; testes de payload por protocolo.
2. Isolamento de workers/IPC e estado temporário sem persistência obrigatória.
3. Fluxo Motores → Modelos, consulta atualizada, testes no rascunho e aba GPU independente.
4. Dialog/AlertDialog e remoção dos painéis expansivos inadequados.
5. Migração, regressão, revisão visual em claro/escuro e janela mínima.
6. Rodada manual do usuário com seus modelos, contas e novos relatos; consolidar correções antes da build definitiva.

Critérios de aceite: nenhuma chamada ou componente operacional do motor inativo; RAM/VRAM liberada ao trocar; troca bloqueada durante trabalho; consulta nova a cada entrada em Modelos/API; busca/teste antes de salvar; credencial não persistida sem escolha; erro Gemini reproduzido e resolvido no modo apropriado; confirmações em portal shadcn; manutenção CUDA exclusiva da aba GPU sem carregar motores; nenhum fluxo regredido de transcrição, histórico ou exportação.

Para retomadas: registrar cada etapa em checkpoint e manter testes executáveis isoladamente. Não publicar código/artefatos 1.5 nem promover release até a aprovação final do usuário após os testes. A implementação local e a validação visual/integrada foram executadas; resultados e limitações atuais estão em VOZTRA-1.5.md. A próxima etapa é a rodada manual do usuário.

## Referências

- Gemini Transcribe: https://ai.google.dev/gemini-api/docs/transcribe
- Modelo e limitações: https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe
- shadcn Dialog: https://ui.shadcn.com/docs/components/radix/dialog
- shadcn AlertDialog: https://ui.shadcn.com/docs/components/radix/alert-dialog
