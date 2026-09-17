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
