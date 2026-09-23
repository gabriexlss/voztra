import { useState, type JSX } from 'react'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { BASE_PROMPT, type EngineProfile, type ApiProtocol } from '../../../../shared/engines'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Choice } from '../Choice'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog'
import { AlertDialog } from 'radix-ui'

const protocols: { value: ApiProtocol; label: string; description: string }[] = [
  {
    value: 'openai-transcription',
    label: 'OpenAI · Transcrição de arquivos',
    description: '/audio/transcriptions · áudio multipart e contexto textual'
  },
  {
    value: 'openai-chat',
    label: 'OpenAI · Chat com áudio',
    description: '/chat/completions · entrada input_audio'
  },
  {
    value: 'gemini-content',
    label: 'Gemini · Generate Content',
    description: 'Áudio com instruções enviadas conforme o modo escolhido'
  },
  {
    value: 'gemini-interactions',
    label: 'Gemini · Interactions / Transcribe',
    description: 'Transcrição e parâmetros generation_config'
  },
  {
    value: 'openai-live',
    label: 'OpenAI · Realtime Transcription',
    description: 'Sessão WebSocket de transcrição, arquivos e microfone'
  },
  {
    value: 'gemini-live',
    label: 'Gemini · Live Transcription',
    description: 'Sessão WebSocket Gemini, arquivos e microfone'
  }
]

/** Editor transitório: aplica em memória e encaminha a seleção para a aba Modelos. */
export function EngineEditor({
  initial,
  busy,
  onSaved,
  onClose
}: {
  initial: EngineProfile
  busy: boolean
  onSaved: (p: EngineProfile) => void
  onClose: () => void
}): JSX.Element {
  const [profile, setProfile] = useState(initial)
  const [key, setKey] = useState<string>()
  const [json, setJson] = useState(JSON.stringify(initial.advanced, null, 2))
  const [unlock, setUnlock] = useState(false)
  const [pending, setPending] = useState('')
  const [result, setResult] = useState('')
  const saved = JSON.stringify(initial)
  const [discard, setDiscard] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const dirty =
    JSON.stringify(profile) !== saved ||
    json !== JSON.stringify(profile.advanced, null, 2) ||
    key !== undefined
  const disabled = busy || !!pending
  const update = (patch: Partial<EngineProfile>): void => setProfile((p) => ({ ...p, ...patch }))
  const run = async (name: string, action: () => Promise<void>): Promise<void> => {
    setPending(name)
    try {
      await action()
    } catch (e) {
      toast.error(String(e))
      setResult(String(e))
    } finally {
      setPending('')
    }
  }
  return (
    <>
      <Dialog
        open={!discard && !pending}
        onOpenChange={(open) => {
          if (!open) {
            if (dirty) setDiscard(true)
            else onClose()
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{profile.id ? 'Configurar conexão' : 'Nova conexão'}</DialogTitle>
            <DialogDescription>
              Configure o provedor. Você poderá escolher e testar o modelo antes de salvar.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto min-h-0 pr-2">
            <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-2 text-sm">
                  Nome da conexão
                  <Input value={profile.name} onChange={(e) => update({ name: e.target.value })} />
                </label>
                <Choice
                  label="Provedor"
                  value={profile.provider}
                  onChange={(value) => {
                    setKey('')
                    update({
                      provider: value as EngineProfile['provider'],
                      baseUrl:
                        value === 'gemini'
                          ? 'https://generativelanguage.googleapis.com/v1beta'
                          : value === 'openai'
                            ? 'https://api.openai.com/v1'
                            : 'http://localhost:8000/v1',
                      liveUrl: '',
                      protocol: value === 'gemini' ? 'gemini-interactions' : 'openai-transcription',
                      instructionMode: value === 'gemini' ? 'none' : 'user',
                      model: ''
                    })
                  }}
                  items={[
                    { value: 'openai', label: 'OpenAI' },
                    { value: 'gemini', label: 'Google Gemini' },
                    { value: 'custom', label: 'Servidor personalizado / local' }
                  ]}
                />
              </div>
              <Choice
                label="Protocolo de áudio"
                value={profile.protocol}
                items={protocols}
                onChange={(v) =>
                  update({
                    protocol: v as ApiProtocol,
                    instructionMode:
                      v === 'gemini-live' || v === 'gemini-interactions' ? 'none' : 'user'
                  })
                }
              />
              <label className="block space-y-2 text-sm">
                URL base HTTP
                <Input
                  value={profile.baseUrl}
                  onChange={(e) => update({ baseUrl: e.target.value })}
                />
              </label>
              {profile.protocol.endsWith('live') && (
                <label className="block space-y-2 text-sm">
                  URL WebSocket personalizada (opcional)
                  <Input
                    value={profile.liveUrl}
                    placeholder="Vazia: derivar da URL base"
                    onChange={(e) => update({ liveUrl: e.target.value })}
                  />
                </label>
              )}
              <label className="block space-y-2 text-sm">
                Chave de API
                <Input
                  type="password"
                  autoComplete="off"
                  value={key ?? ''}
                  placeholder={
                    initial.hasKey
                      ? 'Chave já configurada; deixe intacto para manter'
                      : 'Opcional em servidores sem autenticação'
                  }
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <p className="help">
                A chave será usada somente em memória até você escolher salvar na aba Modelos.
              </p>
              <Choice
                label="Envio de instruções"
                value={profile.instructionMode || 'user'}
                onChange={(v) => update({ instructionMode: v as EngineProfile['instructionMode'] })}
                items={[
                  {
                    value: 'none',
                    label: 'Sem instruções',
                    description:
                      'Recomendado para Gemini Transcribe dedicado. Textos ficam preservados, mas não são enviados.'
                  },
                  {
                    value: 'user',
                    label: 'Texto do usuário / contexto',
                    description:
                      'Texto junto ao áudio em APIs multimodais; prompt de contexto na transcrição OpenAI.'
                  },
                  {
                    value: 'system',
                    label: 'Instrução de sistema',
                    description: 'Somente para protocolos e modelos que aceitam esse campo.'
                  }
                ]}
              />
              <label className="block space-y-2 text-sm">
                Instruções adicionais
                <Textarea
                  value={profile.instructions}
                  onChange={(e) => update({ instructions: e.target.value })}
                  placeholder="Contexto, nomes próprios e vocabulário…"
                />
              </label>
              <p className="help">
                Transcritores dedicados podem aceitar apenas contexto ou vocabulário, sem system
                prompt. No Gemini Transcribe, configure custom_vocabulary no JSON quando necessário.
                O provedor informa parâmetros incompatíveis.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                {advancedOpen ? 'Voltar aos dados da conexão' : 'Editar opções avançadas'}
              </Button>
              {advancedOpen && (
                <div className="rounded-lg border p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <label className="text-sm space-y-2">
                      Temperatura
                      <Input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Padrão do provedor"
                        value={profile.temperature ?? ''}
                        onChange={(e) =>
                          update({
                            temperature: e.target.value === '' ? null : Number(e.target.value)
                          })
                        }
                      />
                    </label>
                    <label className="text-sm space-y-2">
                      Bloco de arquivo REST (segundos)
                      <Input
                        type="number"
                        min="5"
                        max="300"
                        value={profile.chunkSeconds}
                        onChange={(e) => update({ chunkSeconds: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  <p className="help">
                    Blocos menores reduzem memória e limites por envio, mas podem cortar contexto
                    entre frases. Live gerencia sessões separadamente.
                  </p>
                  <label className="flex gap-3 text-sm items-center">
                    <Switch checked={unlock} onCheckedChange={setUnlock} />
                    Editar instruções base
                  </label>
                  <Textarea
                    aria-label="Instruções base"
                    readOnly={!unlock}
                    value={profile.basePrompt}
                    onChange={(e) => update({ basePrompt: e.target.value })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!unlock}
                    onClick={() =>
                      update({
                        basePrompt:
                          profile.protocol === 'gemini-live' ||
                          profile.protocol === 'gemini-interactions'
                            ? ''
                            : BASE_PROMPT
                      })
                    }
                  >
                    Restaurar instruções padrão
                  </Button>
                  <label className="block space-y-2 text-sm">
                    Parâmetros JSON
                    <Textarea
                      aria-label="Parâmetros JSON"
                      className="font-mono min-h-40"
                      value={json}
                      onChange={(e) => setJson(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <p className="help">
                    {profile.protocol.endsWith('live')
                      ? 'Objeto de configuração da sessão (sem o envelope setup/session).'
                      : 'Parâmetros do corpo da requisição; objetos aninhados são preservados.'}{' '}
                    Os valores JSON prevalecem sobre controles equivalentes. Credenciais, modelo,
                    URL e conteúdo de áudio têm campos próprios. Não há correção automática de
                    parâmetros rejeitados.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      try {
                        setJson(JSON.stringify(JSON.parse(json), null, 2))
                      } catch {
                        toast.error('JSON inválido.')
                      }
                    }}
                  >
                    Formatar JSON
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setJson('{}')}>
                    Restaurar JSON
                  </Button>
                  <details>
                    <summary className="text-sm cursor-pointer">Prévia das instruções</summary>
                    <pre className="text-xs whitespace-pre-wrap rounded-lg bg-muted p-3 mt-2">
                      {[profile.basePrompt, profile.instructions].filter(Boolean).join('\n\n') ||
                        'Sem instruções textuais.'}
                    </pre>
                  </details>
                </div>
              )}
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (dirty ? setDiscard(true) : onClose())}>
              Cancelar
            </Button>
            <Button
              disabled={disabled}
              onClick={() =>
                run('apply', async () => {
                  const applied = await window.api.applyEngine(
                    { ...profile, advanced: JSON.parse(json) },
                    key
                  )
                  if (applied) {
                    setKey(undefined)
                    onSaved(applied)
                  }
                })
              }
            >
              <ArrowRight />
              Continuar em Modelos
            </Button>
          </DialogFooter>
          {result && (
            <p role="alert" className="text-sm text-destructive break-words">
              {result}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog.Root open={discard} onOpenChange={setDiscard}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 space-y-4">
            <AlertDialog.Title className="font-semibold">Descartar alterações?</AlertDialog.Title>
            <AlertDialog.Description className="help">
              As alterações deste formulário ainda não foram aplicadas.
            </AlertDialog.Description>
            <div className="flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Continuar editando</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button onClick={onClose}>Descartar</Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {pending && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Aplicando configuração…
        </p>
      )}
    </>
  )
}
