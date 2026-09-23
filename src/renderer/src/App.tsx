import { useEffect, useState, lazy, Suspense, type JSX } from 'react'
import {
  AudioLines,
  Library,
  History,
  Settings,
  LoaderCircle,
  ShieldCheck,
  Activity,
  ChevronDown,
  X,
  Monitor,
  Sun,
  Moon,
  NotebookText
} from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useTranscriber } from './hooks/useTranscriber'
const ModelControl = lazy(() =>
  import('./components/ModelControl').then((m) => ({ default: m.ModelControl }))
)
const ModelLibrary = lazy(() =>
  import('./components/ModelLibrary').then((m) => ({ default: m.ModelLibrary }))
)
import { FileQueue } from './components/FileQueue'
import { SettingsPanel } from './components/SettingsPanel'
import { TranscriptPanel } from './components/TranscriptPanel'
import { TranscriptionProgress } from './components/TranscriptionProgress'
import { ResourceMonitor } from './components/ResourceMonitor'
import { HistoryPage } from './components/HistoryPage'
import { Button } from './components/ui/button'
import { Progress } from './components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip'
import { applyTheme, readTheme, type Theme } from './lib/theme'
import { statusLabels } from './lib/history'
import { UpdatesPanel } from './components/UpdatesPanel'
import { ReleaseNotes } from './components/ReleaseNotes'
import releases from '../../shared/releases.json'
import brandIcon from './assets/brand/icon.png'
import { ConfirmationHost } from './components/ConfirmationHost'
const CudaPanel = lazy(() =>
  import('./components/engines/CudaPanel').then((m) => ({ default: m.CudaPanel }))
)
const RemoteModels = lazy(() =>
  import('./components/engines/RemoteModels').then((m) => ({ default: m.RemoteModels }))
)
const EnginesPage = lazy(() =>
  import('./components/engines/EnginesPage').then((m) => ({ default: m.EnginesPage }))
)
import { EngineSwitcher } from './components/engines/EngineSwitcher'
const MicrophonePanel = lazy(() =>
  import('./components/engines/MicrophonePanel').then((m) => ({ default: m.MicrophonePanel }))
)
import { useMicrophone } from './hooks/useMicrophone'
import { isLive } from '../../shared/engines'
const pages = [
  {
    id: 'transcription',
    label: 'Transcrição',
    icon: AudioLines,
    description: 'Transforme seus áudios em texto com o motor de sua escolha.'
  },
  {
    id: 'engines',
    label: 'Motores',
    icon: Settings,
    description: 'Whisper local, provedores de API e servidores personalizados.'
  },
  {
    id: 'models',
    label: 'Modelos',
    icon: Library,
    description: 'Escolha e teste os modelos do motor ativo.'
  },
  {
    id: 'gpu',
    label: 'GPU',
    icon: Monitor,
    description: 'Bibliotecas de aceleração local e compatibilidade de hardware.'
  },
  {
    id: 'history',
    label: 'Histórico',
    icon: History,
    description: 'Solicitações, arquivos e resultados em um só lugar.'
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    description: 'Ajuste o aplicativo ao seu ambiente de trabalho.'
  },
  {
    id: 'news',
    label: 'Novidades',
    icon: NotebookText,
    description: 'A evolução do Voztra, versão por versão.'
  }
]
const operationLabels: Record<string, string> = {
  'cuda-install': 'Instalando suporte NVIDIA',
  'cuda-remove': 'Removendo suporte NVIDIA',
  'switch-engine': 'Encerrando motor anterior',
  'api-test': 'Testando com áudio sintético',
  'api-models': 'Consultando modelos do provedor',
  load: 'Carregando modelo na memória',
  unload: 'Liberando memória',
  download: 'Baixando modelo',
  delete: 'Excluindo modelo',
  metadata: 'Consultando tamanho online',
  catalog: 'Lendo armazenamento',
  benchmark: 'Testando desempenho'
}
/** Estrutura persistente: trocar páginas não desmonta o controlador nem interrompe o motor. */
export default function App(): JSX.Element {
  const c = useTranscriber()
  const capture = useMicrophone()
  const remote = !!c.system.engines && c.system.engines.activeId !== 'whisper'
  const connection = c.system.engines?.profiles.find((p) => p.id === c.system.engines?.activeId)
  const [page, setPage] = useState('transcription')
  useEffect(
    () =>
      window.api.onUpdate((update) => {
        if (update.status === 'available' || update.status === 'downloaded') {
          toast(
            update.status === 'available'
              ? `Voztra ${update.availableVersion} disponível`
              : 'Atualização pronta para instalar',
            {
              id: 'app-update',
              action: { label: 'Ver', onClick: () => setPage('settings') }
            }
          )
        }
      }),
    []
  )
  const [resources, setResources] = useState(false)
  const [theme, setTheme] = useState<Theme>(readTheme)
  const current = pages.find((p) => p.id === page)!
  const job = c.jobs.find((j) => j.id === c.selected)
  const activeJob = c.jobs.find((j) => j.id === c.system.activeJobId)
  const latestRequest = c.system.requests[0]
  const requestJobs = latestRequest ? c.jobs.filter((j) => latestRequest.jobIds.includes(j.id)) : []
  return (
    <TooltipProvider>
      <ConfirmationHost />
      <Suspense fallback={<p className="p-6">Carregando interface…</p>}>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="flex items-center gap-3 px-3 py-6">
              <img src={brandIcon} alt="" className="size-10" />
              <div>
                <p className="font-semibold tracking-tight text-lg">Voztra</p>
                <p className="text-[11px] text-muted-foreground">Áudio para texto</p>
              </div>
            </div>
            <nav aria-label="Navegação principal" className="space-y-1 mt-5">
              {pages.map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  className={`nav-item justify-start ${page === p.id ? 'nav-active' : ''}`}
                  aria-current={page === p.id ? 'page' : undefined}
                  onClick={() => setPage(p.id)}
                >
                  <p.icon />
                  {p.label}
                </Button>
              ))}
            </nav>
            <div className="mt-auto p-3 text-xs text-muted-foreground space-y-3">
              <div className="flex items-center gap-2">
                {c.system.ready ? (
                  <ShieldCheck className="size-4 text-primary" />
                ) : (
                  <LoaderCircle className="size-4 animate-spin" />
                )}
                <span>{c.system.ready ? 'Motor conectado' : 'Iniciando motor…'}</span>
              </div>
              <p className="leading-relaxed">
                {remote ? 'Processamento por API.' : 'Processamento local.'}
                <br />
                {remote ? 'Áudio enviado ao servidor configurado.' : 'Seu áudio permanece aqui.'}
              </p>
              <p className="text-[10px]">
                {remote ? connection?.name : 'Whisper · CTranslate2'} · {releases[0].version}
              </p>
            </div>
          </aside>
          <div className="min-w-0 flex flex-col">
            <header className="app-header">
              <div>
                <span className="text-sm font-medium">{current.label}</span>
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <EngineSwitcher
                  state={c.system.engines}
                  busy={
                    c.running ||
                    (!!c.system.operation && c.system.operation !== 'api-models') ||
                    !c.system.ready ||
                    capture.starting
                  }
                  onManage={() => setPage('engines')}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={resources}
                      onClick={() => setResources(!resources)}
                    >
                      <Activity className="size-4" />
                      <span className="tabular-nums text-xs">
                        CPU {c.metrics ? `${c.metrics.cpu.toFixed(0)}%` : '—'}
                        <span className="mx-3 text-border">|</span>RAM{' '}
                        {c.metrics ? `${(c.metrics.ram / 1024 ** 3).toFixed(1)} GiB` : '—'}
                      </span>
                      <ChevronDown className={resources ? 'rotate-180' : ''} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Uso do sistema e do aplicativo</TooltipContent>
                </Tooltip>
              </div>
            </header>
            {resources && (
              <div className="px-7 py-5 border-b bg-card">
                <ResourceMonitor metrics={c.metrics} device={c.options.device} />
              </div>
            )}
            <main className="page-content">
              <div className="mb-7">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {current.label === 'Transcrição' ? 'Nova transcrição' : current.label}
                </h1>
                <p className="text-sm text-muted-foreground mt-2">{current.description}</p>
              </div>
              {c.error && (
                <div
                  role="alert"
                  className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm flex items-start gap-4"
                >
                  <span className="flex-1 break-words">{c.error}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Dispensar erro"
                    onClick={c.clearError}
                  >
                    <X />
                  </Button>
                </div>
              )}
              {!remote && ['transcription', 'models'].includes(page) && (
                <div className="mb-6">
                  <ModelControl
                    compact={page !== 'transcription'}
                    system={c.system}
                    options={c.options}
                    metrics={c.metrics}
                    running={c.running}
                    onChange={c.setOptions}
                    onAction={c.modelAction}
                    onSettings={() => setPage('models')}
                    onConfigure={() => setPage('transcription')}
                  />
                </div>
              )}
              {remote && page === 'transcription' && (
                <div className="panel mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {connection?.name} · {connection?.model || 'Escolha um modelo'}
                    </p>
                    <p className="help break-all mt-1">Destino: {connection?.baseUrl}</p>
                  </div>
                  <Button variant="outline" onClick={() => setPage('engines')}>
                    Configurar motor
                  </Button>
                </div>
              )}
              {c.system.operation && (
                <div className="panel mb-6 space-y-3" role="status">
                  <div className="flex items-center gap-3">
                    <LoaderCircle className="size-4 animate-spin text-primary" />
                    <strong className="text-sm flex-1">
                      {operationLabels[c.system.operation]} · {c.system.operationModel}
                    </strong>
                    {['load', 'download', 'benchmark', 'api-test', 'api-models'].includes(
                      c.system.operation
                    ) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={c.cancelling}
                        onClick={c.cancel}
                      >
                        Cancelar operação
                      </Button>
                    )}
                  </div>
                  {['download', 'cuda-install'].includes(c.system.operation) && (
                    <>
                      <Progress
                        aria-label="Download do modelo"
                        value={c.progress?.type === 'download' ? c.progress.percent : null}
                      />
                      <p className="help">
                        {c.progress?.type === 'download'
                          ? c.progress.message
                          : 'Conectando ao repositório…'}{' '}
                        {c.system.operation === 'download'
                          ? ' · progresso por arquivos, não bytes.'
                          : ' · download, verificação e extração das DLLs.'}
                      </p>
                    </>
                  )}
                </div>
              )}
              <div key={page} className="animate-in fade-in-0 duration-150">
                {page === 'engines' && (
                  <EnginesPage
                    state={c.system.engines}
                    onModels={() => setPage('models')}
                    busy={c.running || !!c.system.operation || !c.system.ready || capture.starting}
                  />
                )}
                {page === 'transcription' && isLive(connection?.protocol) && (
                  <MicrophonePanel
                    capture={capture}
                    busy={c.running || !!c.system.operation || !c.system.ready}
                  />
                )}
                {page === 'news' && <ReleaseNotes />}
                {page === 'transcription' && (
                  <div className="grid grid-cols-1 min-[1150px]:grid-cols-[0.8fr_1.2fr] items-start gap-6">
                    <section className="panel">
                      <div className="flex justify-between mb-4">
                        <h2 className="font-semibold text-sm">Arquivos da próxima solicitação</h2>
                        <span className="help">{c.files.length} selecionado(s)</span>
                      </div>
                      <FileQueue files={c.files} onAdd={c.addFiles} onRemove={c.remove} />
                      {!remote && (
                        <SettingsPanel
                          options={c.options}
                          disabled={c.running}
                          onChange={c.setOptions}
                        />
                      )}
                      {c.running && !!c.files.length && (
                        <p className="help mt-4">
                          Estes novos arquivos ficam para o próximo envio.
                        </p>
                      )}
                    </section>
                    <div className="min-w-0 space-y-6">
                      <TranscriptionProgress
                        running={c.running}
                        cancelling={c.cancelling}
                        stage={
                          c.running
                            ? c.stage
                            : (remote ? !!connection?.model : c.system.modelState === 'loaded')
                              ? c.progress?.percent === 100
                                ? 'Transcrição concluída'
                                : 'Pronto para transcrever'
                              : remote
                                ? 'Escolha um modelo na aba Modelos'
                                : 'Carregue um modelo para transcrever'
                        }
                        progress={c.progress}
                        job={activeJob || job}
                        queued={c.files.length}
                        canStart={
                          !!c.files.length &&
                          c.system.ready &&
                          (remote ? !!connection?.model : c.system.modelState === 'loaded') &&
                          !capture.starting &&
                          !c.system.operation &&
                          !c.starting
                        }
                        onStart={c.start}
                        onCancel={c.cancel}
                      />
                      {!!requestJobs.length && (
                        <div className="panel">
                          <div className="flex items-center justify-between gap-4 mb-3">
                            <h2 className="text-sm font-semibold truncate">
                              {latestRequest?.title}
                            </h2>
                            <Button variant="ghost" size="sm" onClick={() => setPage('history')}>
                              Abrir histórico
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {requestJobs.map((j) => (
                              <Button
                                key={j.id}
                                variant={j.id === c.selected ? 'secondary' : 'ghost'}
                                size="sm"
                                className="max-w-full"
                                onClick={() => c.setSelected(j.id)}
                              >
                                <span className="truncate">{j.displayName || j.file.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {statusLabels[j.status]}
                                </span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!c.partial && (
                        <div role="status" className="panel text-sm text-muted-foreground">
                          <p className="help mb-2">Prévia Live · pode mudar até a confirmação</p>
                          {c.partial}
                        </div>
                      )}
                      <TranscriptPanel job={job} onEdit={c.edit} onExport={c.exportJob} />
                    </div>
                  </div>
                )}
                {page === 'gpu' && (
                  <CudaPanel busy={c.running || !!c.system.operation || !c.system.ready} />
                )}
                {page === 'models' && remote && connection && (
                  <RemoteModels
                    key={connection.id}
                    profile={connection}
                    busy={c.running || !!c.system.operation || !c.system.ready}
                    onConfigure={() => setPage('engines')}
                  />
                )}
                {page === 'models' && !remote && (
                  <ModelLibrary
                    system={c.system}
                    metrics={c.metrics}
                    running={c.running || remote}
                    onAction={c.modelAction}
                  />
                )}
                {page === 'history' && (
                  <HistoryPage
                    requests={c.system.requests}
                    jobs={c.jobs}
                    selected={c.selected}
                    onSelect={c.setSelected}
                    onRename={c.rename}
                    onEdit={c.edit}
                    onExport={c.exportJob}
                  />
                )}
                {page === 'settings' && (
                  <div className="space-y-6">
                    <section className="panel">
                      <h2 className="font-semibold">Aparência</h2>
                      <p className="help mt-2 mb-5">
                        Escolha o tema. A preferência fica salva neste computador.
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        {(
                          [
                            { id: 'light', label: 'Claro', icon: Sun },
                            { id: 'dark', label: 'Escuro', icon: Moon },
                            { id: 'system', label: 'Acompanhar sistema', icon: Monitor }
                          ] as const
                        ).map((t) => (
                          <Button
                            key={t.id}
                            variant={theme === t.id ? 'default' : 'outline'}
                            className="h-24 flex-col gap-3"
                            aria-pressed={theme === t.id}
                            onClick={() => {
                              setTheme(t.id)
                              localStorage.setItem('appearance', t.id)
                              applyTheme(t.id)
                            }}
                          >
                            <t.icon className="size-5" />
                            {t.label}
                          </Button>
                        ))}
                      </div>
                      <div className="border-t mt-6 pt-5 space-y-2">
                        <h3 className="text-sm font-medium">Movimento e acessibilidade</h3>
                        <p className="help">
                          Animações respeitam a opção de reduzir movimento do sistema. Os controles
                          podem ser usados pelo teclado.
                        </p>
                        <h3 className="text-sm font-medium pt-3">Processamento local</h3>
                        <p className="help">
                          O modelo só entra na memória quando você clica em Carregar modelo.
                          Downloads e consultas de tamanho usam a internet. Com Whisper, a
                          transcrição ocorre no computador; motores de API enviam o áudio ao
                          servidor escolhido.
                        </p>
                      </div>
                    </section>
                    <UpdatesPanel busy={c.running || !!c.system.operation} />
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
        <Toaster
          theme={theme}
          closeButton
          position="bottom-right"
          containerAriaLabel="Notificações"
          toastOptions={{ closeButtonAriaLabel: 'Fechar notificação' }}
        />
      </Suspense>
    </TooltipProvider>
  )
}
