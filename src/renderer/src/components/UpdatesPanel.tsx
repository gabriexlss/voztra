import { useEffect, useState, type JSX } from 'react'
import { Download, ExternalLink, LoaderCircle, RefreshCw, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import type { UpdateCommand, UpdateState } from '../../../shared/updates'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Switch } from './ui/switch'

const labels = {
  idle: 'Pronto para verificar',
  checking: 'Consultando versões…',
  available: 'Nova versão disponível',
  current: 'Você está na versão mais recente',
  downloading: 'Baixando atualização…',
  downloaded: 'Atualização pronta para instalar',
  installing: 'Reiniciando para atualizar…',
  error: 'Não foi possível atualizar'
}

/** Preferências e progresso pertencem ao main; mudar de página não cancela o download. */
export function UpdatesPanel({ busy }: { busy: boolean }): JSX.Element {
  const [state, setState] = useState<UpdateState>()
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const unsubscribe = window.api.onUpdate(setState)
    void window.api
      .updatesSnapshot()
      .then(setState)
      .catch((error) => toast.error(String(error)))
    return unsubscribe
  }, [])
  async function command(value: UpdateCommand): Promise<void> {
    setPending(true)
    try {
      setState(await window.api.updateCommand(value))
    } catch (error) {
      toast.error(String(error))
    } finally {
      setPending(false)
    }
  }
  if (!state)
    return (
      <section className="panel" aria-busy="true">
        Carregando atualizações…
      </section>
    )
  const working = pending || ['checking', 'downloading', 'installing'].includes(state.status)
  return (
    <section className="panel space-y-5" aria-label="Atualizações do aplicativo">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h2 className="font-semibold">Sobre o Voztra</h2>
          <p className="help mt-2">
            Versão {state.version} ·{' '}
            {
              {
                installed: 'Instalado',
                portable: 'Portable',
                development: 'Desenvolvimento',
                manual: 'Linux'
              }[state.mode]
            }
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void command('release')}>
          <ExternalLink />
          GitHub
        </Button>
      </div>
      <div className="flex justify-between gap-5 border-y py-4">
        <label htmlFor="automatic-updates" className="text-sm">
          <span className="font-medium">Verificar atualizações automaticamente</span>
          <p className="help mt-1">
            Consulta o GitHub ao abrir e a cada seis horas. Você decide quando baixar e reiniciar.
          </p>
        </label>
        <Switch
          id="automatic-updates"
          checked={state.automatic}
          onCheckedChange={(value) => {
            void window.api
              .setAutomaticUpdates(value)
              .then(setState)
              .catch((error) => toast.error(String(error)))
          }}
        />
      </div>
      <div role="status" className="space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          {working && <LoaderCircle className="size-4 animate-spin" />}
          {labels[state.status]}
          {state.availableVersion && state.status !== 'current'
            ? ` · ${state.availableVersion}`
            : ''}
        </p>
        {state.status === 'downloading' && (
          <>
            <Progress aria-label="Download da atualização" value={state.percent || 0} />
            <p className="help">{(state.percent || 0).toFixed(1)}%</p>
          </>
        )}
        {state.message && <p className="help break-words">{state.message}</p>}
        {state.checkedAt && (
          <p className="help">
            Última consulta: {new Date(state.checkedAt).toLocaleString('pt-BR')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={working || state.status === 'downloaded'}
          onClick={() => void command('check')}
        >
          <RefreshCw />
          Verificar agora
        </Button>
        {state.status === 'available' && (
          <Button
            disabled={working}
            onClick={() => void command(state.mode === 'installed' ? 'download' : 'release')}
          >
            <Download />
            {state.mode === 'installed' ? 'Baixar atualização' : 'Abrir download da versão'}
          </Button>
        )}
        {state.status === 'downloaded' && (
          <Button disabled={working || busy} onClick={() => void command('install')}>
            <RotateCw />
            Reiniciar e instalar
          </Button>
        )}
      </div>
      {busy && state.status === 'downloaded' && (
        <p className="help">Conclua ou cancele a operação atual antes de instalar.</p>
      )}
      {state.mode === 'portable' && (
        <p className="help">
          Para atualizar o portable, feche o Voztra e substitua o executável pelo novo portable.
          Preserve a pasta data ao lado dele.
        </p>
      )}
      {state.mode === 'development' && (
        <p className="help">
          Instalação de atualizações disponível na distribuição Windows instalada.
        </p>
      )}
      <p className="help break-all">Dados locais: {state.dataPath}</p>
    </section>
  )
}
