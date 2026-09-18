# Checkpoint — Motores e APIs (1.4)

Escopo aprovado: aba Motores, seletor rápido, Whisper local, Gemini/OpenAI/custom,
listagem livre e teste explícito de áudio, JSON avançado, prompts, protocolos Live,
microfone, desligamento do processo anterior ao trocar e bibliotecas CUDA no Windows.

## Etapas

- [x] Contratos, perfis e credenciais protegidas; ciclo de vida exclusivo do motor.
- [x] Core Python: descoberta, REST e Live; testes com servidores simulados.
- [x] Interface shadcn: gestão, troca rápida, teste, parâmetros e microfone.
- [x] Histórico, cancelamento, progresso e exportações por capacidade do resultado.
- [x] Redistribuíveis CUDA oficiais opcionais, licenças, instalação/remoção e diagnóstico.
- [x] Verificações TypeScript/Python/Electron, build Windows e workflow Linux.

As chaves reais não foram fornecidas. Testes automatizados de protocolo não são
equivalentes à homologação de contas reais dos provedores. GPU NVIDIA indisponível
no computador de desenvolvimento; registrar separadamente a verificação das DLLs.

## Decisões

- Modelos nunca são bloqueados por catálogo local: o usuário escolhe e testa.
- Não há seletor de prioridade. JSON complementa os parâmetros do protocolo.
- Cada motor usa o processo Python isolado; a troca aguarda o encerramento anterior.
- Servidores externos (inclusive localhost) não são encerrados pelo Voztra.
- Correção aprovada: build padrão SEM DLLs NVIDIA. Instalação/remoção opcional na aba Motores, diretório privado, hashes fixos e progresso. `VOZTRA_BUNDLE_CUDA=1` é opção de build especial, não o padrão.
- HTTP/WS locais são permitidos; credenciais não são propagadas em redirects.
- Sem chamadas pagas automáticas e sem retry automático de transcrição.

## Fontes

- https://github.com/SYSTRAN/faster-whisper#gpu
- https://docs.nvidia.com/cuda/eula/index.html
- https://ai.google.dev/gemini-api/docs/transcribe
- https://ai.google.dev/gemini-api/docs/live-api/live-transcribe
- https://developers.openai.com/api/docs/guides/realtime-transcription

## Validação registrada em 17/09/2026

- TypeScript e ESLint passaram. 27 testes Python passaram.
- Regressão Electron: 12 aprovados e 3 optativos não executados nessa rodada.
- Transcrição real Whisper em CPU, fila, cancelamento, histórico e exportação validados.
- HTTP/WebSocket locais, captura Chromium com dispositivo sintético e liberação do microfone validados.
- Instalação/remoção de DLLs NVIDIA reais pelo aplicativo passou em 59 segundos, usando wheels oficiais em cache.
- cuBLAS, cuDNN, CUDA Runtime e NVRTC carregaram via WinDLL sem instalar Toolkit; não houve inferência em GPU por ausência de hardware NVIDIA.
- Correção de gravação atômica: arquivo temporário único e repetição limitada para bloqueios transitórios Windows.
- Build Windows final: setup e portable em `dist/releases/1.4.0/`, aproximadamente 183 MiB cada.
- Pacote Windows final: 13 testes passaram, incluindo transcrição real CPU, APIs, microfone, reabertura do portable e atualizador. Dois testes optativos ficaram desativados nessa rodada; o runtime NVIDIA real já havia sido validado separadamente.
- ASAR, bytecode V8, preload, renderer, metadados e assets do core conferidos por SHA-256.
- Windows e Linux aprovados no [workflow 35292833725](https://github.com/gabriexlss/voztra/actions/runs/35292833725), commit `236c155`. Linux inclui AppImage e deb.
- Código salvo na branch `codex/motores-api-nvidia`.
- Sem release pública 1.4.0 publicada até este checkpoint.
