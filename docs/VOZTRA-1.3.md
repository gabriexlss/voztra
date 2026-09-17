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

Validar o pacote final com código mais recente; executar transcrição real, portable e teste do atualizador; revisar capturas; publicar fonte e releases e registrar resultados finais abaixo. Este arquivo permite continuar uma sessão interrompida sem confundir implementação com validação concluída.

## Progresso confirmado

- Repositório público e tags legadas enviados; releases 1.0.0, 1.1.0, 1.1.1 e 1.2.0 publicadas com instaladores originais, blockmaps e SHA256SUMS. Os hashes retornados pelo GitHub coincidem com os locais.
- Transcrição real em CPU passou nos testes da interface final: lote, exportação, renomeação, benchmark, progresso intermediário e cancelamento.
- Pacote atual em `dist/work/1.3.0/win-unpacked` passou na comparação de todos os arquivos de saída, metadados e benchmark por SHA-256. Main em bytecode; preload isolado.
- Capturas revisadas e adicionadas em `docs/images`; nenhum áudio pessoal incluído.
- Build Windows no GitHub iniciado: execução 35205028871. Não confundir execução iniciada com validação concluída.
- Permanecem os testes específicos portable/atualizador e a publicação final 1.3 após o empacotamento terminar.
