# Reformulação 1.2 — checkpoint de implementação

Implementado no código (validação em andamento): Tailwind 4 + componentes oficiais shadcn/Radix, ícones Lucide, temas, navegação lateral, catálogo descritivo, comparação, seleção de precisão com incompatibilidades visíveis, prévia de RAM, histórico por solicitação.

## Fronteiras de responsabilidade
- `src/main/storage.ts`: migração de jobs.json para history-v2.json; mantém original e backup. Escrita atômica; execuções abertas viram interrompidas na retomada.
- `src/main/index.ts`: cria o lote todo antes de iniciar; executa uma tarefa por vez e valida comandos IPC. Arquivos adicionados depois aguardam novo envio.
- `src/renderer/src/hooks/useTranscriber.ts`: estado visual e rascunhos, sem controlar a execução do lote.
- `src/renderer/src/components/ui`: componentes oficiais shadcn editáveis localmente. `Choice.tsx` centraliza seletores com descrições.
- `src/renderer/src/lib/catalog.ts`: descrições de modelos/precisões e escalas editoriais, não medições.
- `src/renderer/src/lib/requirements.ts`: referências de CPU e faixas heurísticas de memória; medidas reais ficam separadas.
- `src/renderer/src/lib/theme.ts` e `assets/main.css`: inicialização do tema, tokens semânticos, espaçamento e movimento reduzido.

## Decisões de interface
Hierarquia por proximidade e escala de espaçamento de 4/8 pixels, baseada em https://fluent2.microsoft.design/layout . Detalhes técnicos sob expansão; fontes: https://www.nngroup.com/articles/progressive-disclosure/ . Controles acessíveis do shadcn: https://ui.shadcn.com/docs/components/radix/select . Ícones Lucide, sem emojis.

## Precisão e modelos
Descrições consultadas em https://github.com/openai/whisper , https://github.com/openai/whisper/discussions/2363 e https://opennmt.net/CTranslate2/quantization.html . Ratings são relativos e editoriais; velocidade depende de hardware, idioma e ruído. FP32 não garante texto melhor. Somente tipos reportados pelo motor podem ser escolhidos para executar. O modo automático seleciona precisão, nunca carrega modelos sozinho.

## Próxima etapa neste checkpoint
Executar typecheck/lint, testes de migração, lote real, tema, menus e comparação; inspecionar screenshots; corrigir achados; gerar instalador 1.2.0 em dist/v1.2.0 e validar o executável empacotado. Ainda não considerar a versão pronta para entrega.
