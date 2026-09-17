# Checkpoint da versão 1.3

## Implementado

- Marca Voztra e arte original gerada, PNG/ICO de produção e prompt documentado.
- Página Novidades offline, fonte única para CHANGELOG e notas de publicação.
- Gerenciador de atualização instalado/portable, preferências, progresso e proteção de operações ativas.
- Dados legados preservados no caminho instalado; portable usa pasta própria com verificação de escrita.
- ASAR e bytecode V8 no main, sandbox no preload.
- Targets Windows NSIS e portable; scripts de checksums, validação do ASAR e arquivamento verificado.
- Repositório público criado: https://github.com/gabriexlss/voztra.
- README, MIT, avisos de terceiros, instruções de contribuição e workflow de distribuição.

## Validação realizada durante o desenvolvimento

- Typecheck e build de produção passaram.
- 14 testes Python passaram.
- 8 testes básicos Electron/contratos passaram; download de modelo opcional não executado nessa rodada.
- Quatro arquivos ZIP legados tiveram todos os conteúdos verificados por SHA-256 antes da remoção dos originais soltos.

## Próximos passos deste checkpoint

Publicação concluída: https://github.com/gabriexlss/voztra/releases/tag/v1.3.0. A tag aponta para o commit bdaff15. Não há etapas pendentes para distribuir esta versão; o workflow de tags pode repetir os builds e preserva os arquivos já publicados.

## Progresso confirmado

- Repositório público e tags legadas enviados; releases 1.0.0, 1.1.0, 1.1.1 e 1.2.0 publicadas com instaladores originais, blockmaps e SHA256SUMS. Os hashes retornados pelo GitHub coincidem com os locais.
- Transcrição real em CPU passou nos testes da interface final: lote, exportação, renomeação, benchmark, progresso intermediário e cancelamento.
- Pacote atual em `dist/work/1.3.0/win-unpacked` passou na comparação de todos os arquivos de saída, metadados e benchmark por SHA-256. Main em bytecode; preload isolado.
- Capturas revisadas e adicionadas em `docs/images`; nenhum áudio pessoal incluído.
- Workflow Windows e Linux concluído com sucesso: execução 35207490679, commit 2efc09c. Inclui lint, typecheck, testes Python, build, ASAR e interface empacotada nas duas plataformas.
- Teste final de transcrição real no pacote Windows passou: lote, exportação, histórico, benchmark, progresso, cancelamento e descarregamento do modelo.
- Teste portable passou com duas aberturas do executável em pasta com espaços e persistência das preferências.
- Teste do atualizador passou com download real do instalador, integridade e bloqueio durante transcrição. A instalação final foi interceptada: não se executou uma atualização completa sobre uma instalação antiga do usuário.
- Linux AppImage e deb baixados do workflow; todos os hashes comparados ao manifesto do artefato. Pacotes reunidos em `dist/releases/1.3.0`, com manifesto SHA256SUMS combinado.
- Artefatos Windows usam ASAR e bytecode V8 no main. Portable e Linux oferecem atualização manual; a instalação Windows usa electron-updater.
- Arquivamento das versões antigas economizou aproximadamente 761 MiB, com verificação de cada arquivo antes da remoção dos originais soltos.
- Em 17/09/2026, o terminal voltou a funcionar após falha do ambiente Codex. A release 1.3.0 foi publicada como versão estável mais recente, com Windows setup/portable, Linux AppImage/deb, metadados e manifesto de integridade. Os oito arquivos remotos tiveram seus hashes comparados aos arquivos locais.
- Os SHA-512 dos instaladores também conferem com `latest.yml` e `latest-linux.yml`. A build Windows consultou o canal público real após a publicação e retornou `status: current`, versão 1.3.0, usando perfil isolado, sem baixar ou instalar atualizações.
