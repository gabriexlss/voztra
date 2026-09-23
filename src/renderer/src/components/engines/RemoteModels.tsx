import { useEffect, useRef, useState, type JSX } from 'react'
import { RefreshCw, FlaskConical, Save, Settings2, LoaderCircle, Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import type { EngineProfile, RemoteModel } from '../../../../shared/engines'

/** Catálogo remoto consultado a cada montagem. Respostas de uma página antiga são descartadas. */
export function RemoteModels({
  profile,
  busy,
  onConfigure
}: {
  profile: EngineProfile
  busy: boolean
  onConfigure: () => void
}): JSX.Element {
  const [models, setModels] = useState<RemoteModel[]>([])
  const [filter, setFilter] = useState('')
  const [manual, setManual] = useState(profile.model)
  const [pending, setPending] = useState('models')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ fingerprint: string; text: string }>()
  const [remember, setRemember] = useState(false)
  const generation = useRef(0)
  const fingerprint = JSON.stringify(profile)
  const run = async (operation: string, action: () => Promise<void>): Promise<void> => {
    setPending(operation)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(String(e))
    } finally {
      setPending('')
    }
  }
  const refresh = async (): Promise<void> => {
    const request = ++generation.current
    setPending('models')
    setError('')
    try {
      const fetched = await window.api.engineModels(profile.id)
      if (request === generation.current) setModels(fetched)
    } catch (e) {
      if (request === generation.current) setError(String(e))
    } finally {
      if (request === generation.current) setPending('')
    }
  }
  useEffect(() => {
    const request = ++generation.current
    const timer = setTimeout(() => {
      void window.api
        .engineModels(profile.id)
        .then((fetched) => {
          if (request === generation.current) setModels(fetched)
        })
        .catch((e) => {
          if (request === generation.current) setError(String(e))
        })
        .finally(() => {
          if (request === generation.current) setPending('')
        })
    }, 0)
    return () => {
      clearTimeout(timer)
      generation.current += 1
    }
  }, [profile.id, profile.baseUrl, profile.protocol])
  const select = (model: string): Promise<void> =>
    run('select', async () => {
      await window.api.applyEngine({ ...profile, model })
      setManual(model)
    })
  const disabled = busy || !!pending
  const filtered = models.filter((m) =>
    `${m.id} ${m.name} ${m.description || ''}`.toLowerCase().includes(filter.toLowerCase())
  )
  return (
    <div className="space-y-6">
      <section className="panel flex justify-between items-center gap-4">
        <div>
          <h2 className="font-semibold">{profile.name}</h2>
          <p className="help mt-1 break-all">{profile.baseUrl}</p>
          <p className="help mt-2">
            {profile.temporary ? 'Configuração temporária · somente nesta sessão' : 'Conexão salva'}
          </p>
        </div>
        <Button variant="outline" disabled={disabled} onClick={onConfigure}>
          <Settings2 />
          Editar conexão
        </Button>
      </section>
      <div className="grid grid-cols-1 min-[1150px]:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
        <section className="panel space-y-4">
          <div className="flex justify-between items-center gap-3">
            <h2 className="font-semibold text-sm">Modelos do provedor</h2>
            <Button variant="outline" size="sm" disabled={disabled} onClick={refresh}>
              <RefreshCw />
              Atualizar
            </Button>
          </div>
          <Input
            aria-label="Buscar modelos"
            placeholder="Buscar por nome ou descrição"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <p className="help">
            Catálogo consultado no provedor, sem filtros de compatibilidade. Use o teste para
            verificar áudio.
          </p>
          {pending === 'models' && (
            <p role="status" className="text-sm flex gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              Buscando catálogo atualizado…
            </p>
          )}
          {!!error && (
            <p className="help">O catálogo anterior, se exibido, pode estar desatualizado.</p>
          )}
          <div
            role="list"
            aria-label="Modelos do provedor"
            className="max-h-[420px] overflow-auto divide-y rounded-lg border"
          >
            {filtered.map((m) => (
              <button
                key={m.id}
                disabled={disabled}
                className="w-full text-left p-4 hover:bg-accent disabled:opacity-50 flex gap-3"
                onClick={() => select(m.id)}
              >
                <div className="min-w-0 flex-1">
                  <span className="block font-medium text-sm break-words">{m.name}</span>
                  <span className="help block break-all">{m.id}</span>
                  {m.description && <p className="help mt-2">{m.description}</p>}
                </div>
                {profile.model === m.id && <Check className="size-4 text-primary shrink-0" />}
              </button>
            ))}
            {!filtered.length && pending !== 'models' && (
              <p className="p-4 help">
                Nenhum modelo listado. Você também pode informar o identificador abaixo.
              </p>
            )}
          </div>
        </section>
        <section className="panel space-y-4">
          <h2 className="font-semibold text-sm">Modelo selecionado</h2>
          <label className="block text-sm space-y-2">
            Identificador do modelo
            <Input
              value={manual}
              placeholder="Identificador informado pelo provedor"
              onChange={(e) => setManual(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={disabled || !manual.trim() || manual === profile.model}
            onClick={() => select(manual.trim())}
          >
            Usar identificador
          </Button>
          <p className="help">
            Instruções:{' '}
            {profile.instructionMode === 'none'
              ? 'não enviadas; texto preservado na conexão'
              : profile.instructionMode === 'system'
                ? 'campo de sistema'
                : 'texto do usuário / contexto'}
            .
          </p>
          <Button
            className="w-full"
            disabled={disabled || !profile.model}
            onClick={() =>
              run('test', async () => {
                const test = await window.api.testEngine(profile.id)
                if (!test.text?.trim())
                  throw new Error('O provedor não retornou texto de transcrição.')
                setResult({
                  fingerprint,
                  text: `${test.elapsed.toFixed(1)} s · ${test.model}\n${test.text}`
                })
              })
            }
          >
            <FlaskConical />
            Testar com áudio
          </Button>
          <p className="help">
            Envia uma amostra curta ao endereço configurado. Pode gerar cobrança. Não exige salvar a
            conexão.
          </p>
          {result && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="help mb-2">
                {result.fingerprint === fingerprint
                  ? 'Último teste concluído'
                  : 'Configuração alterada: teste anterior desatualizado'}
              </p>
              <pre className="whitespace-pre-wrap break-words">{result.text}</pre>
            </div>
          )}
          <div className="border-t pt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={remember} onCheckedChange={setRemember} />
              Guardar chave no cofre do sistema
            </label>
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() =>
                run('save', async () => {
                  await window.api.saveEngine(profile, undefined, remember)
                  toast.success('Conexão salva')
                })
              }
            >
              <Save />
              Salvar conexão
            </Button>
            {profile.temporary && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => run('discard', () => window.api.discardEngineDraft(profile.id))}
              >
                <Trash2 />
                Descartar rascunho
              </Button>
            )}
            {!profile.temporary && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => run('delete', () => window.api.deleteEngine(profile.id))}
              >
                <Trash2 />
                Excluir conexão
              </Button>
            )}
          </div>
        </section>
      </div>
      {pending && pending !== 'models' && (
        <p role="status" className="flex gap-2 text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          Aguardando operação…
        </p>
      )}
      {error && (
        <div role="alert" className="panel border-destructive/40 space-y-3">
          <p className="text-sm break-words">{error}</p>
          {/Developer instruction|system.instruction/i.test(error) && (
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() =>
                run('instructions', async () => {
                  await window.api.applyEngine({ ...profile, instructionMode: 'none' })
                  setResult(undefined)
                })
              }
            >
              Usar sem instruções e testar novamente manualmente
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
