import { useState, type JSX } from 'react'
import { Save, RefreshCw, FlaskConical, Trash2, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  BASE_PROMPT,
  type EngineProfile,
  type EngineState,
  type RemoteModel,
  type ApiProtocol
} from '../../../../shared/engines'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Choice } from '../Choice'

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
    description: 'Áudio com instrução de sistema'
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

/** O rascunho fica local até salvar. Teste e listagem usam somente a versão salva. */
export function EngineEditor({
  initial,
  state,
  busy,
  onSaved,
  onClose
}: {
  initial: EngineProfile
  state: EngineState
  busy: boolean
  onSaved: (p: EngineProfile) => void
  onClose: () => void
}): JSX.Element {
  const [profile, setProfile] = useState(initial)
  const [key, setKey] = useState<string>()
  const [remember, setRemember] = useState(state.secureStorage)
  const [json, setJson] = useState(JSON.stringify(initial.advanced, null, 2))
  const [unlock, setUnlock] = useState(false)
  const [models, setModels] = useState<RemoteModel[]>([])
  const [filter, setFilter] = useState('')
  const [pending, setPending] = useState('')
  const [result, setResult] = useState('')
  const [saved, setSaved] = useState(JSON.stringify(initial))
  const dirty =
    JSON.stringify(profile) !== saved ||
    json !== JSON.stringify(profile.advanced, null, 2) ||
    key !== undefined
  const active = !!profile.id && profile.id === state.activeId
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
    <section className="panel space-y-5" aria-label="Configurar conexão">
      <div className="flex justify-between items-center gap-3">
        <h2 className="font-semibold">{profile.id ? 'Configurar conexão' : 'Nova conexão'}</h2>
        <Button variant="ghost" onClick={onClose}>
          Fechar editor
        </Button>
      </div>
      <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-2 text-sm">
            Nome da conexão
            <Input value={profile.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <Choice
            label="Provedor"
            value={profile.provider}
            onChange={(value) =>
              update({
                provider: value as EngineProfile['provider'],
                baseUrl:
                  value === 'gemini'
                    ? 'https://generativelanguage.googleapis.com/v1beta'
                    : value === 'openai'
                      ? 'https://api.openai.com/v1'
                      : 'http://localhost:8000/v1',
                liveUrl: '',
                protocol: value === 'gemini' ? 'gemini-content' : 'openai-transcription'
              })
            }
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
              basePrompt: v === 'gemini-live' || v === 'gemini-interactions' ? '' : BASE_PROMPT
            })
          }
        />
        <label className="block space-y-2 text-sm">
          URL base HTTP
          <Input value={profile.baseUrl} onChange={(e) => update({ baseUrl: e.target.value })} />
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
        <label className="flex gap-3 items-center text-sm">
          <Switch
            checked={remember}
            disabled={!state.secureStorage}
            onCheckedChange={setRemember}
          />
          Salvar nova chave no cofre do sistema
        </label>
        <p className="help">
          {state.secureStorage
            ? 'A chave não entra no histórico nem nas exportações.'
            : 'Cofre indisponível: a chave será mantida somente nesta sessão.'}{' '}
          Para remover uma chave salva, preencha e depois apague o campo antes de salvar.
        </p>
        <div className="border-t pt-5 space-y-3">
          <label className="block space-y-2 text-sm">
            Identificador do modelo
            <Input
              value={profile.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="Selecione na consulta ou informe manualmente"
            />
          </label>
          <Button
            variant="outline"
            disabled={!active || dirty}
            onClick={() =>
              run('models', async () => {
                setModels(await window.api.engineModels(profile.id))
                setResult('Modelos consultados. Nenhum filtro de compatibilidade aplicado.')
              })
            }
          >
            <RefreshCw />
            Consultar modelos
          </Button>
          {!!models.length && (
            <>
              <Input
                aria-label="Buscar modelos"
                placeholder="Buscar por nome ou descrição"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div
                className="max-h-64 overflow-auto rounded-lg border"
                role="list"
                aria-label="Modelos do provedor"
              >
                {models
                  .filter((m) =>
                    (m.id + ' ' + m.description + ' ' + m.name)
                      .toLowerCase()
                      .includes(filter.toLowerCase())
                  )
                  .map((m) => (
                    <button
                      type="button"
                      role="listitem"
                      key={m.id}
                      className="block w-full p-3 text-left hover:bg-accent border-b last:border-0"
                      onClick={() => update({ model: m.id })}
                    >
                      <span className="block text-sm font-medium">{m.name}</span>
                      <span className="help block break-all">{m.id}</span>
                      {m.description && <span className="help block mt-1">{m.description}</span>}
                    </button>
                  ))}
              </div>
            </>
          )}
          <p className="help">
            Todos os modelos ficam disponíveis. O teste é opcional e verifica esta configuração com
            um áudio sintético curto.
          </p>
        </div>
        <label className="block space-y-2 text-sm">
          Instruções adicionais
          <Textarea
            value={profile.instructions}
            onChange={(e) => update({ instructions: e.target.value })}
            placeholder="Contexto, nomes próprios e vocabulário…"
          />
        </label>
        <p className="help">
          Transcritores dedicados podem aceitar apenas contexto ou vocabulário, sem system prompt.
          No Gemini Transcribe, configure custom_vocabulary no JSON quando necessário. O provedor
          informa parâmetros incompatíveis.
        </p>
        <details className="rounded-lg border p-4 space-y-4">
          <summary className="cursor-pointer text-sm font-medium">Configurações avançadas</summary>
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
                  update({ temperature: e.target.value === '' ? null : Number(e.target.value) })
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
            Blocos menores reduzem memória e limites por envio, mas podem cortar contexto entre
            frases. Live gerencia sessões separadamente.
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
                  profile.protocol === 'gemini-live' || profile.protocol === 'gemini-interactions'
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
            Os valores JSON prevalecem sobre controles equivalentes. Credenciais, modelo, URL e
            conteúdo de áudio têm campos próprios. Não há correção automática de parâmetros
            rejeitados.
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
        </details>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled}
          onClick={() =>
            run('save', async () => {
              const extra = JSON.parse(json)
              const p = await window.api.saveEngine({ ...profile, advanced: extra }, key, remember)
              setProfile(p)
              setJson(JSON.stringify(p.advanced, null, 2))
              setSaved(JSON.stringify(p))
              setKey(undefined)
              onSaved(p)
              toast.success('Conexão salva')
            })
          }
        >
          <Save />
          Salvar conexão
        </Button>
        <Button
          variant="outline"
          disabled={disabled || !profile.id || dirty || active}
          onClick={() => run('switch', () => window.api.switchEngine(profile.id))}
        >
          Usar este motor
        </Button>
        <Button
          variant="outline"
          disabled={disabled || !active || dirty || !profile.model}
          onClick={() =>
            run('test', async () => {
              const test = await window.api.testEngine(profile.id)
              setResult(
                `Teste concluído · ${test.elapsed.toFixed(1)} s · ${test.model}\n${test.text}${test.usage ? '\nConsumo informado: ' + JSON.stringify(test.usage) : ''}`
              )
            })
          }
        >
          <FlaskConical />
          Testar com áudio
        </Button>
        {!!profile.id && (
          <Button
            variant="ghost"
            disabled={disabled || active}
            onClick={() =>
              run('delete', async () => {
                await window.api.deleteEngine(profile.id)
                onClose()
              })
            }
          >
            <Trash2 />
            Excluir conexão
          </Button>
        )}
      </div>
      <p className="help">
        Salve e ative a conexão para consultar modelos ou testar. O teste envia nossa amostra ao
        endereço configurado e pode gerar cobrança.{' '}
        {dirty && 'Configuração alterada; salve antes de testar.'}
      </p>
      {pending && (
        <p role="status" className="flex gap-2 items-center text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Aguardando operação…
        </p>
      )}
      {result && (
        <pre
          role="status"
          className="rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap break-words max-h-64 overflow-auto"
        >
          {result}
        </pre>
      )}
    </section>
  )
}
