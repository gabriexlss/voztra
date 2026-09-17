# Distribuição do Voztra

## Build local

O postinstall executa `install-electron` explicitamente: a versão 44 do pacote Electron não tem postinstall próprio. O binário precisa existir antes de o electron-vite gerar bytecode. As entradas `@emnapi/core`, `@emnapi/runtime` e `@emnapi/wasi-threads` nas dependências de desenvolvimento estabilizam a resolução das dependências opcionais WASM no npm 10/11.

`npm ci`, `npm run setup:python`, `npm run build:win` produzem NSIS e portable x64 em `dist/releases/<versão>`. Python entra em `resources/core`; modelos não entram no pacote. Execute o build Windows no Windows. Linux usa `npm run build:linux` em Linux e ainda precisa de validação na plataforma.

`node scripts/verify-build.mjs dist/work/1.3.0/win-unpacked` compara a saída atual com o ASAR e exige bytecode V8 no main. O preload continua JavaScript com sandbox e isolamento de contexto. Bytecode depende da versão de V8/Electron e da arquitetura: sempre gere junto com a distribuição. ASAR e bytecode não são criptografia nem protegem segredos.

`node scripts/checksums.mjs dist/releases/1.3.0` cria SHA256SUMS.txt. Valide os dois executáveis antes de publicar. O instalador não tem assinatura comercial; o Windows pode mostrar o editor como desconhecido.

## Dados e compatibilidade

O appId `com.transcrevedor.desktop` permanece estável para atualizar instalações antigas. O diretório instalado continua `%APPDATA%/transcrevedor`; a troca de nome não move nem apaga modelos ou histórico. A desinstalação não remove dados do usuário automaticamente.

O launcher portable define `PORTABLE_EXECUTABLE_DIR`; os dados ficam em `data` nesse diretório. O runtime é extraído temporariamente, comportamento normal do portable Electron. Em pasta sem permissão de escrita, o app mostra um erro em vez de criar dados em outro local. Para mover ou atualizar, leve o executável e a pasta `data`. O portable não importa automaticamente a instalação existente.

`TRANSCREVEDOR_DATA_DIR` permite isolar testes e desativa consultas automáticas de atualização. Não use sua pasta real de dados em testes. `VOZTRA_DISABLE_GPU=1` é uma alternativa para falhas de driver gráfico do Chromium; não muda o dispositivo de inferência Whisper.

## Testes

Execute `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. Para testar a distribuição, defina `TRANSCREVEDOR_EXECUTABLE` com o caminho absoluto de `win-unpacked/voztra.exe`. No Windows, `scripts/create-fixture.ps1` cria fala sintética para `REAL_TRANSCRIPTION=1`, que verifica fila, exportação, progresso intermediário, cancelamento e benchmark. `TEST_DOWNLOAD=1` habilita download real isolado (~75 MB).

## Atualizações e publicação

A edição instalada usa electron-updater/NSIS e o canal estável de `gabriexlss/voztra`. A consulta é automática e configurável; baixar e reiniciar são ações explícitas. Não há instalação ao fechar o aplicativo. Fila ou operação ativa impede a instalação. Falhas de rede não impedem transcrição offline. Portable e Linux consultam o canal e oferecem a página para download manual.

A primeira atualização de versões antigas para 1.3 deve ser manual, pois os binários antigos não têm atualizador. Um novo lançamento precisa de instalador, blockmap e latest.yml correspondentes. Nunca publique `latest.yml` de uma compilação diferente. Os hashes do manifest são validados pelo electron-updater. Não há token dentro do aplicativo.

Para novas versões: atualize package.json/lockfile e `src/shared/releases.json`; rode `node scripts/release-notes.mjs`. Crie uma tag `vX.Y.Z` no commit validado. O workflow prepara um draft com instalador, portable e checksums. Revise os artefatos e publique a release estável. A versão 1.3 é o primeiro build desse processo; builds legados são preservação de instaladores, sem alegação de fonte histórico exato.

## Organização de arquivos

- `dist/releases/<versão>`: instalador, portable, metadados de atualização e checksums.
- `dist/work/<versão>`: resultado desempacotado e logs de empacotamento.
- `dist/archive`: ZIPs de versões antigas e manifestos SHA-256.
- `release/work`: intermediários do PyInstaller; `release/core`: motor empacotado.
- `.cache`: fixtures e resultados locais, fora do Git.

`python scripts/archive-legacy.py --prune` atua somente nas versões 1.0.0, 1.1.0, 1.1.1 e 1.2.0 conhecidas. Cada conteúdo do ZIP é relido e verificado por SHA-256 antes da exclusão das cópias soltas. Instaladores já comprimidos economizam pouco; o ganho principal é compactar as pastas desempacotadas antigas.
