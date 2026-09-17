# Registro de continuidade — versão 1.2.0

Atualização atual: reformulação completa da interface e histórico agrupado por solicitação.

- Tailwind CSS 4, componentes oficiais shadcn/ui sobre Radix e ícones Lucide; nenhum emoji decorativo.
- Navegação lateral para Transcrição, Modelos, Histórico e Configurações; tema Claro, Escuro ou Sistema persistente.
- Selects com descrições e tipos de compute incompatíveis visíveis/desativados; prévia de RAM/VRAM separa faixa estimada de pico medido.
- Biblioteca com descrição de cada modelo, escalas relativas de qualidade/velocidade, comparação de até três modelos, requisitos e consumo observado.
- Histórico v2 por solicitação: lote atômico, arquivos adicionados durante execução ficam para o próximo envio, renomeação de rótulos, filtros e resultados por áudio.
- Migração mantém `jobs.json` e cria `jobs.json.backup`; execuções abertas são recuperadas como interrompidas.
- Fila passou ao processo principal, com uma tarefa por vez e continuidade após falha individual; carga e descarga continuam manuais.
- Testes Electron reais passaram com dois áudios, exportação, tema, comparação, renomeação, cancelamento, progresso e download/exclusão isolados.
- 14 testes Python, typecheck, lint e build do renderer passaram antes do bloqueio de rede do empacotador.

O instalador NSIS 1.2.0 ainda não foi gerado neste ambiente: o electron-builder tentou baixar um componente externo e recebeu EACCES; a tentativa de aprovação adicional foi bloqueada pelo limite de uso do ambiente. A fonte está pronta e o comando `npm run build:win` gera o instalador quando a rede/limite estiver disponível.

## Continuidade após limite de tokens

Não há módulo de código em aberto. O próximo passo operacional é executar `npm run build:win` e validar `dist/v1.2.0` com `.cache/verify-build.mjs`; o core Python não sofreu alteração funcional nesta versão.

---

## Versão anterior 1.1.1

Atualização atual: painel de progresso da transcrição, mantendo os motores existentes.

- Instalador: `dist/v1.1.1/transcrevedor-1.1.1-setup.exe` (184417796 bytes).
- Executável: `dist/v1.1.1/win-unpacked/transcrevedor.exe` (manter a pasta inteira).
- SHA-256 do instalador: `4C3185597AB9EED73F40BC55649BBFC9E25BBF4AE5FC67E2A9E24E2EFE8BCC64`.
- Build, lint, 14 testes Python e 5 testes Electron passaram.
- Pacote conferido contra os arquivos atuais; captura do painel em `.cache/progress-active.png`.
- Saída separada por versão porque a pasta `dist/win-unpacked` estava em uso.
- Nenhuma mudança em CUDA, ROCm, Vulkan ou outros motores.

# Histórico da versão 1.1.0

Atualizado em 14/09/2026. Leia este arquivo e ARQUITETURA.md antes de retomar.

## Decisões e escopo entregues

- Electron + React/Vite + TypeScript pelo gerador oficial quick-start; core Python com faster-whisper/CTranslate2.
- Windows primeiro; caminhos e empacotamento AppImage/deb preparados para Linux.
- Código modular, comentários e documentação em português.
- Abas Transcrição e Configurações; espaçamento de 20 px entre resultado e histórico.
- Catálogo com tamanho local por modelo, download explícito sem áudio, consulta de tamanho online, retomada de parciais e exclusão confirmada.
- Carga manual obrigatória: baixar não carrega; transcrever não baixa nem carrega; o modelo permanece ativo entre áudios até a descarga explícita ou fechamento.
- Modelo, dispositivo, precisão e threads bloqueados durante a carga ativa; idioma e VAD ajustáveis por transcrição.
- Requisitos aproximados de CPU por nome, GPU, RAM e VRAM, conforme modelo e precisão; não são mínimos oficiais.
- Identificação do processador e comparação com base local de 13 CPUs, com fontes públicas verificadas; CPUs desconhecidas recebem indicação de ausência de dados. O i3-1115G4 desta máquina foi incluído.
- Medições de RAM por configuração e benchmark local opcional com fala sintética em português distribuída no core.
- Barras segmentadas de aplicativo, outros processos e livre; GPU por processo exibe N/D quando o driver não fornece dados.
- Histórico e medições com escrita atômica. Transcrições existentes preservadas.

## Evidências finais

- Build TypeScript/Vite e lint ESLint passaram.
- 12 testes Python passaram: formatos, decodificação incremental, cancelamento, carga explícita, integridade do catálogo, snapshots por revisão e exclusão confinada ao modelo.
- Verificação Python focada em erros E9/F passou.
- Modo de desenvolvimento Vite + React + Electron validado.
- 6 testes Electron passaram no pacote Windows final em 25,3 s, com REAL_TRANSCRIPTION=1 e TEST_DOWNLOAD=1.
- Teste real incluiu dois áudios consecutivos com a mesma carga, exportação SRT, alternância de abas, requisitos CPU/GPU, benchmark, cancelamento e bloqueio depois de descarregar.
- Download sem áudio e exclusão do modelo carregado testados com diretório de dados isolado.
- Main, preload, renderer e áudio do benchmark comparados ao pacote por SHA-256; metadados de nome, versão, descrição e entrada também conferidos.
- Capturas finais: .cache/interface.png, .cache/transcription.png e .cache/settings.png. Interface e espaçamento revisados visualmente.

## Entrega

- Instalador: dist/transcrevedor-1.1.0-setup.exe, 184.416.897 bytes (~176 MiB).
- SHA-256: FAAC6026892902EF313CE40876A96E43332A37BDE80161435DE3A0B486131F07.
- Executável em pasta: dist/win-unpacked/transcrevedor.exe; mantenha a pasta inteira.
- Python e dependências incluídos em resources/core; modelos são baixados separadamente pelo usuário.
- README.md explica instalação, fluxo manual, dados, testes e distribuição.
- ARQUITETURA.md descreve módulos, protocolo, ciclo do modelo, cancelamento e estimativas.
- A versão 1.0.0 do instalador foi preservada em dist.

## Correções relevantes para futuras alterações

- Snapshots baixados por SHA podem não ter refs/main; a detecção busca snapshots locais completos, sem acessar a rede.
- O servidor libera o lock antes de publicar o término de uma transcrição, permitindo o próximo áudio da fila.
- Operações têm identificadores únicos; temporizadores antigos não cancelam operações posteriores do mesmo tipo.
- Descarregar encerra e reinicia o processo Python, liberando recursos nativos. O novo core fica vazio.
- O áudio do benchmark entra no PyInstaller por caminho absoluto, pois o spec fica em release.
- Testes aguardam o término de um novo benchmark; um resultado anterior salvo não significa que a operação atual acabou.

## Limites conhecidos

GPU CUDA e Linux não foram executados nesta máquina. Suporte preparado, sem afirmar validação real nessas plataformas. Métricas por processo dependem do driver NVIDIA. A base de CPUs é local e pequena, sem API de atualização automática; pontuação não é previsão de velocidade Whisper.

Download mostra arquivos concluídos, não bytes. Tamanho local mede bytes lógicos únicos, não clusters do disco. RAM da barra usa USS com fallback RSS; medições do core usam RSS incluindo runtime e buffers.

Cancelamento forçado após dois segundos deixa o modelo descarregado; cancelamento cooperativo pode mantê-lo. Não há retomada da inferência no ponto exato, diarização ou captura de microfone. Blocos de 30 segundos ainda não usam sobreposição acústica. Detalhes em README.md.

Nenhuma implementação obrigatória ficou pendente. Próximas evoluções opcionais constam em ARQUITETURA.md.

## Atualização 1.1.1 — progresso de transcrição

Implementação concluída: painel componentizado com spinner, porcentagem, duração processada, relógio, velocidade e ETA; progresso por segmento no core existente. Build, lint e 14 testes Python passaram. Validação visual e empacotamento concluídos. Os 5 testes Electron passaram no pacote final, incluindo avanço intermediário real, spinner, fila e cancelamento. O teste optativo de download não foi repetido nesta atualização; o gerenciamento de modelos não mudou. Não foram adicionados motores ou aceleração de GPU.
