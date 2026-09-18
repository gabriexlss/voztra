# Motores, provedores e NVIDIA opcional

## Escolha e ciclo de vida

O seletor ao lado de CPU/RAM oferece troca rápida. A aba **Motores** concentra a
configuração completa. Somente um processo Python de motor fica ativo. Trocar
encerra o processo anterior antes de iniciar outro; Whisper volta descarregado.
Nenhuma troca é permitida com transcrição, lote ou operação em andamento.
Servidores externos, inclusive localhost, permanecem sob controle do usuário.

## Configurar uma API

Crie uma conexão com nome, URL base, chave opcional e protocolo. Salve e ative a
conexão; consulte modelos ou digite o identificador. A listagem não filtra modelos
por nome/modalidade. **Testar com áudio** envia a amostra sintética do Voztra e
exibe o resultado ou erro. Pode haver cobrança; o teste nunca é automático.

O provedor visual organiza o perfil; **o protocolo determina o formato enviado**:

| Protocolo                        | Corpo dos parâmetros JSON                   |
| -------------------------------- | ------------------------------------------- |
| OpenAI Transcrição               | Campos multipart de `/audio/transcriptions` |
| OpenAI Chat com áudio            | Corpo JSON de `/chat/completions`           |
| Gemini Generate Content          | Corpo de `models/<id>:generateContent`      |
| Gemini Interactions / Transcribe | Corpo de `/interactions`                    |
| OpenAI Realtime                  | Objeto `session` de `session.update`        |
| Gemini Live                      | Objeto `setup` inicial                      |

URL, credencial, identificador e áudio têm campos próprios. Objetos JSON são
mesclados recursivamente e têm precedência sobre controles equivalentes. Parâmetros
desconhecidos são enviados sem correção automática; erros retornam à interface.
Não existe seletor de tier nem fallback automático para modalidades mais caras.

Exemplo Gemini Transcribe (Interactions), conforme o contrato do provedor:

```json
{
  "generation_config": {
    "transcription_config": {
      "language_codes": ["pt-BR"],
      "custom_vocabulary": ["Voztra", "CTranslate2"]
    }
  }
}
```

Exemplo Gemini Live (formato WebSocket camelCase):

```json
{
  "inputAudioTranscription": {
    "languageCodes": ["pt-BR"],
    "mode": "VERBATIM"
  }
}
```

Exemplo OpenAI Realtime:

```json
{
  "audio": {
    "input": {
      "transcription": { "language": "pt" }
    }
  }
}
```

Suporte aos campos depende do modelo e da versão do servidor. Gemini 3.5 Transcribe
não suporta Flex/Priority. Transcritores dedicados não têm necessariamente system
prompt; Interactions/Live iniciam sem instruções base. Use contexto/vocabulário ou
ative a edição avançada conforme o protocolo aceitar. Instruções adicionais não
alteram as transcrições Whisper.

## Servidores locais e credenciais

Exemplo de URL base: `http://localhost:8000/v1`. HTTP/WS e ausência de chave são
permitidos para servidores que não exigem autenticação. O servidor precisa
implementar o protocolo escolhido; uma API somente textual não transcreve áudio.
A URL WebSocket pode ser definida separadamente. URLs não devem conter segredos.

Chaves persistidas usam `safeStorage` do Electron (proteção do sistema operacional).
No Linux, o fallback `basic_text` é recusado; use somente a sessão quando não houver
cofre. Copiar uma instalação portable para outra máquina pode exigir informar a
chave novamente. O renderer recebe apenas `hasKey`, nunca a chave salva. Segredos
não são incluídos no histórico, nos parâmetros exportados ou nas mensagens de erro.

## Arquivos, Live e limites

REST decodifica o áudio em blocos WAV mono de 16 kHz, com memória limitada por bloco.
É possível ajustar de 5 a 300 segundos; blocos pequenos podem cortar contexto entre
frases. Não há repetição automática de chamadas cobradas. Resultados sem texto
são apresentados como erro, inclusive HTTP 200 vazio.

Live usa PCM e WebSockets; arquivos são enviados no ritmo de áudio. O microfone
usa AudioWorklet e só abre após ação explícita. **Finalizar gravação** envia o fim
do áudio e aguarda o resultado; **Cancelar** interrompe o motor se necessário.
O provedor pode cobrar áudio já recebido. Previews não são salvos como texto final.
Sessões são divididas em até quatro minutos; blocos finais OpenAI são ordenados por
item. Falha de rede preserva os finais recebidos e não reenvia o áudio silenciosamente.

Os tempos de APIs representam limites aproximados dos blocos/turnos, não alinhamento
de palavras. SRT/VTT são exportáveis, mas precisam de revisão. Whisper mantém seus
timestamps atuais. A porcentagem REST avança após respostas; Live mostra atividade,
tempo e posição enviada, sem inventar porcentagem de processamento remoto.

## NVIDIA no Windows

Em **Motores → Suporte NVIDIA opcional**, ative Whisper e clique em instalar.
O download é de aproximadamente 1,24 GiB; reserve 4 GiB para extração. Bibliotecas
cuBLAS 12.8, cuDNN 9.10, CUDA Runtime 12.8 e NVRTC 12.8 vêm dos wheels oficiais
NVIDIA no PyPI, com SHA-256 fixo no manifesto. Não é necessário instalar o Toolkit.
É necessário ter uma GPU NVIDIA e um driver compatível.

DLLs e licenças ficam em `cuda/` na pasta de dados do app. A manutenção descarrega
o modelo e encerra o processo antes de alterar as DLLs. Remover suporte NVIDIA
preserva os modelos e o histórico. O instalador não altera PATH global nem System32.
Linux continua usando as bibliotecas CUDA do próprio ambiente.

A build padrão exclui as DLLs. Para uma distribuição especial com DLLs já incluídas,
o mantenedor pode usar `VOZTRA_BUNDLE_CUDA=1` em `npm run build:win`; essa opção tem
impacto significativo no tamanho. Os binários NVIDIA mantêm licenças próprias.

## Verificação

Testes locais de protocolo usam servidores HTTP/WebSocket simulados; não demonstram
acesso de uma conta real ao Gemini/OpenAI. O teste no app existe para essa validação.
GPU NVIDIA não disponível na máquina de desenvolvimento: integridade/extração das
DLLs e processamento efetivo na GPU são verificações diferentes.

Fontes: [Gemini Transcribe](https://ai.google.dev/gemini-api/docs/transcribe),
[Gemini Live](https://ai.google.dev/gemini-api/docs/live-api/live-transcribe),
[OpenAI Realtime](https://developers.openai.com/api/docs/guides/realtime-transcription),
[faster-whisper GPU](https://github.com/SYSTRAN/faster-whisper#gpu),
[NVIDIA CUDA](https://docs.nvidia.com/cuda/eula/index.html).
