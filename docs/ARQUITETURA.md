# Arquitetura e guia de edição

## Responsabilidades

| Módulo                                         | Responsabilidade                                       |
| ---------------------------------------------- | ------------------------------------------------------ |
| `src/shared/types.ts`                          | Contratos TypeScript da ponte e eventos                |
| `src/main/index.ts`                            | Janela, validação IPC, ciclo das tarefas e diálogos    |
| `src/main/backend.ts`                          | Processo Python e leitura JSON por linha               |
| `src/main/model-manager.ts`                    | Carga manual, descarga, catálogo, exclusão e benchmark |
| `src/main/storage.ts`                          | Histórico com troca atômica de arquivo                 |
| `src/main/export.ts`                           | Serialização TXT/SRT/VTT/JSON                          |
| `src/preload/index.ts`                         | API explícita e isolada exposta ao React               |
| `src/renderer/src/hooks/useTranscriber.ts`     | Estado visual, rascunhos e assinatura dos eventos       |
| `src/renderer/src/components/`                 | Componentes visuais independentes                      |
| `src/renderer/src/components/ModelControl.tsx` | Seletores e ciclo de vida manual do modelo             |
| `src/renderer/src/components/ModelLibrary.tsx` | Biblioteca e configurações por modelo                  |
| `src/renderer/src/components/ResourceBar.tsx`  | Barra segmentada e legenda acessível                   |
| `src/renderer/src/lib/usage.ts`                | Partição aplicativo/outros/livre sem dupla contagem    |
| `src/renderer/src/lib/requirements.ts`         | Estimativas por modelo e base de CPUs com fontes       |
| `backend/transcrevedor/server.py`              | Leitura de comandos e worker de inferência             |
| `backend/transcrevedor/engine.py`              | Modelo reutilizável, transcrição e progresso           |
| `backend/transcrevedor/audio.py`               | Decodificação incremental PyAV para 16 kHz mono        |
| `backend/transcrevedor/models.py`              | Download retomável e cache local                       |
| `backend/transcrevedor/benchmark.py`           | Teste local do modelo já carregado e pico de RAM       |
| `backend/transcrevedor/assets/benchmark.wav`   | Fala sintética em português distribuída no core        |
| `backend/transcrevedor/hardware.py`            | Capacidades e telemetria de CPU/RAM/NVIDIA             |
| `backend/transcrevedor/protocol.py`            | Serialização concorrente de eventos                    |
| `scripts/python.mjs`                           | Setup, testes e build Python portáveis                 |

## Protocolo

Electron envia um JSON por linha no stdin. Python responde no stdout; logs de bibliotecas devem ir para stderr. Um lock protege a escrita de eventos de threads distintas.

Comandos: `start` com `jobId`, `path` e `options`; `cancel`; `load`, `catalog`, `metadata`, `download`, `delete` e `benchmark`. Operações de modelos usam `requestId` e recebem `response` com `ok`, `result` e eventual `message`.
Eventos: `ready`, `metrics`, `download`, `stage`, `segment`, `progress`, `complete`, `cancelled`, `error`. Electron também produz `state`, `fatal` e `restarting`. `state` carrega um snapshot do modelo ativo, catálogo e observações.

Cada evento de transcrição identifica sua tarefa. Eventos de telemetria são globais. Uma única operação mutável pode executar por vez. O servidor publica o término de uma tarefa somente após liberar o lock, permitindo que o próximo áudio da fila comece. Nunca envie áudio bruto pela ponte React: o core abre o caminho autorizado pelo processo principal.

## Ciclo de vida manual

`unloaded → loading → loaded → unloading → unloaded`. Início e reinício do app sempre ficam em `unloaded`. O catálogo distingue arquivos no disco de um modelo na memória. Somente `load` constrói um `WhisperModel`, exclusivamente de um snapshot local completo; `start` valida o modelo carregado e nunca baixa/carrega implicitamente.

Modelo, dispositivo, precisão e threads ficam bloqueados enquanto houver um modelo carregado. Idioma e VAD são opções por transcrição. Alternar abas mantém o estado da sessão. A fila somente começa por ação explícita e só continua enquanto o modelo estiver carregado.

Descarregar encerra o processo Python, garantindo a liberação dos recursos nativos, e inicia um core vazio para manter catálogo/telemetria. O transporte ignora eventos de gerações antigas e rejeita RPCs pendentes. Cada operação tem um identificador próprio, para que um temporizador antigo de cancelamento não interrompa uma operação posterior do mesmo tipo.

Excluir um modelo carregado usa esse mesmo descarregamento antes da remoção. O módulo de cache restringe nomes a repositórios conhecidos e valida caminhos, symlinks e junctions. O tamanho deduplica hardlinks e blobs referenciados por symlinks; snapshots completos baixados por SHA são reconhecidos mesmo sem `refs/main`. Arquivos parciais contam no armazenamento, mas não permitem carregar.

## Cancelamento e falhas

O comando de cancelamento sinaliza um `threading.Event`. Se uma chamada nativa ou download não retornar em dois segundos, o Electron encerra o processo Python e inicia outro. Resultados recebidos anteriormente já estão no histórico. Depois de um reinício forçado, o usuário precisa carregar o modelo manualmente. Um cancelamento cooperativo pode preservar o modelo ativo.

Ao receber EOF, o core encerra suas threads daemon. O fechamento do Electron encerra seu filho Python. Falhas individuais ficam no histórico e permitem continuar os demais arquivos da solicitação. Uma falha fatal do motor interrompe os pendentes. Nenhuma tarefa é repetida automaticamente com outra configuração.

## Persistência

O histórico utiliza arquivo temporário e rename no mesmo diretório. O salvamento após cada segmento prioriza recuperação simples. Para históricos muito grandes, migrar o repositório para arquivos por tarefa ou SQLite; a interface não deve depender do formato físico.

`observations.json` também usa troca atômica. Picos são atualizados a cada amostra de telemetria e persistidos ao concluir uma operação de modelo, descarregar ou sair. O benchmark salva imediatamente ao terminar. Um encerramento abrupto pode perder as últimas amostras ainda não gravadas, sem corromper a versão anterior.

## Estimativas e telemetria

Requisitos são aproximações do projeto, não mínimos oficiais. Para editar as faixas e as CPUs, altere `requirements.ts`. Pontuações multicore de 13 modelos vêm de páginas públicas do Geekbench consultadas em 14/09/2026; o link de cada entrada aponta à página em que o valor foi consultado, incluindo tabelas de CPUs relacionadas. A comparação usa margem de 10%, respeita sufixos e informa ausência de dados em vez de inferir desempenho pelo nome. Não prevê velocidade Whisper a partir do score e não faz chamadas externas automáticas.

O benchmark usa a gravação sintética incluída e o mesmo modelo ativo, com português, VAD e beam size 5. Mede tempo de execução e amostra RSS do core a cada 50 ms. O resultado representa essa amostra curta e essa configuração; não é teste universal de CPU.

`hardware.py` agrega a árvore Electron/Python. CPU é normalizada pelo número de CPUs lógicas; memória usa USS com fallback RSS. O pico do core usa RSS, incluindo bibliotecas e buffers. NVML fornece totais de GPU e memória e, se suportado pelo driver, dados dos PIDs do app. Dados indisponíveis são nulos. A barra subtrai o app do total usado para obter outros processos e limita valores transitórios fora da capacidade.

## Convenções

- Documentação e comentários em português explicam responsabilidades e decisões; identificadores técnicos seguem as APIs do ecossistema.
- Componentes não acessam sistema de arquivos, child_process ou APIs genéricas de IPC.
- Novos tipos de eventos devem ser atualizados no contrato compartilhado e no consumidor React.
- Ao concluir um módulo, execute seus testes e atualize PROGRESSO.md com evidência, limitações e próximos passos.
- Nunca registre áudio, credenciais ou dados de transcrição em serviços externos.

## Evoluções previstas

Backend whisper.cpp para GPUs não CUDA; divisão de áudio com sobreposição e alinhamento; ampliação da base de CPUs com fontes verificadas; retomada por checkpoint de áudio; virtualização de transcrições e histórico grandes.

## Progresso visual (1.1.1)

`TranscriptionProgress.tsx` concentra o painel, o spinner e o relógio, com suporte a movimento reduzido. Eventos do core são a única fonte da porcentagem; o temporizador da interface só atualiza o tempo decorrido. `engine.py` emite progresso no início do bloco, a cada segmento retornado e ao concluir o bloco. Os timestamps do VAD são relativos ao áudio original; o avanço é limitado ao bloco e nunca retrocede. A conclusão publicada pelo servidor é a única origem de 100%. Nenhum motor ou configuração de inferência foi substituído.


## Interface e solicitações (1.2.0)

`start-request` recebe IDs de arquivos previamente importados e opções. O main valida o lote inteiro antes de gravar `TranscriptionRequest` e seus `Job`s em estado `queued`; `pumpQueue` executa somente um arquivo de cada vez. O campo `activeJobId` e a lista de solicitações entram no snapshot. O handler `start` continua disponível como uma solicitação de um único áudio. Operações de modelo ficam bloqueadas enquanto existirem tarefas ativas ou pendentes.

A persistência é `{version: 2, requests, jobs}` em `history-v2.json`. Cada request guarda IDs ordenados dos jobs; renomear não altera caminhos. A migração copia o histórico antigo antes de salvar a versão nova e nunca inventa agrupamentos antigos. Inicialização recupera `running` e `queued` como `interrupted`.

O React mantém arquivos para o próximo envio separados da solicitação já criada. Rascunhos de edição são preservados em um mapa até exportar, mesmo que snapshots do motor cheguem durante a edição. A seleção só acompanha automaticamente o próximo áudio quando ainda estava no áudio anterior da fila.

`Choice.tsx` compõe o Select shadcn com descrições e itens desativados. `catalog.ts` centraliza descrições; `MemoryPreview.tsx` distingue faixa estimada, RAM disponível aproximada e pico observado. A biblioteca oferece comparação de até três modelos, requisitos e consumo observado sem carregar o modelo implicitamente.

O tema é aplicado por `lib/theme.ts` antes da montagem React; a janela só aparece em `ready-to-show`. `assets/main.css` contém tokens compartilhados e regras de espaçamento; os componentes de `components/ui` são os arquivos editáveis do shadcn. O arquivo `base.css` anterior não é mais importado. Novos controles devem usar os tokens semânticos, ícones Lucide e componentes existentes. Não adicione porcentagem estimada de CPU como requisito: mantenha CPUs de referência e separe telemetria real.
