# Histórico de versões

As datas originais das versões legadas não foram confirmadas.

## 1.5.0 — Motores isolados e conexões mais simples

- Whisper, APIs e manutenção GPU em processos separados; troca encerra o motor anterior e libera seus recursos.
- Nova conexão e edição em modais centralizados; confirmações integradas à interface shadcn.
- Catálogo remoto na aba Modelos, atualizado a cada entrada; seleção e teste antes de salvar a conexão.
- Correção do Gemini Transcribe: controle explícito das instruções e leitura da resposta REST Interactions.
- Aba GPU dedicada para instalar e remover bibliotecas NVIDIA; correção de concorrência nas consultas de status.
- Corrigido travamento na primeira transcrição API no Windows; perfis anteriores migrados preservando configurações.
- Validado com Gemini 3.5 Transcribe real, Whisper CPU e instalação/remoção de DLLs. Live e OpenAI com testes simulados; inferência NVIDIA, Live e OpenAI ainda sem validação real nesta versão.

## 1.4.0 — Motores e provedores

- Aba Motores e acesso rápido para alternar entre Whisper, Gemini, OpenAI e servidores locais ou personalizados.
- Modelos consultados livremente, teste explícito com áudio, instruções personalizadas e parâmetros JSON.
- Protocolos Live com arquivos e microfone; encerramento do motor anterior ao trocar e bloqueio durante transcrição.
- Credenciais protegidas pelo sistema ou mantidas somente na sessão; histórico identifica o motor utilizado.
- Suporte NVIDIA opcional no Windows: baixar e remover bibliotecas CUDA sem instalar o Toolkit.

## 1.3.0 — Olá, Voztra

- Nova identidade visual: nome Voztra, símbolo e ícones próprios.
- Windows com instalador e executável portable; dados portáteis ao lado do aplicativo.
- Atualizações pelo GitHub, com download e instalação controlados pelo usuário.
- Página Novidades com o histórico de versões disponível offline.
- Distribuição com ASAR, bytecode V8 no processo principal e checksums dos arquivos.

## 1.2.0 — Um novo espaço de trabalho

- Interface com Tailwind CSS, componentes shadcn e ícones Lucide.
- Temas claro, escuro e do sistema; seletores com descrições de compute types.
- Histórico por solicitação com vários áudios e nomes editáveis.
- Comparação dos modelos, indicadores de qualidade e velocidade e prévia de memória.

## 1.1.1 — Acompanhe cada transcrição

- Progresso baseado nos segmentos processados, com porcentagem, tempo e previsão de conclusão.
- Indicador de atividade e cancelamento durante o processamento.

## 1.1.0 — Controle do motor e dos modelos

- Carregamento e descarregamento manual dos modelos na memória.
- Biblioteca com download antecipado, exclusão, armazenamento e estimativas de requisitos.
- Comparação de processadores conhecidos e teste de desempenho local.
- Barras de recursos distinguindo o aplicativo do restante do sistema.

## 1.0.0 — A primeira versão do Transcrevedor

- Transcrição local com faster-whisper e Python, em uma interface Electron e React.
- Escolha de modelo, CPU ou GPU NVIDIA e precisão de cálculo.
- Importação de áudio, histórico local e exportação TXT, SRT, VTT e JSON.

