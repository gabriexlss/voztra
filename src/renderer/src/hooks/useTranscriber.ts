import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  AudioFile,
  BackendEvent,
  Job,
  Metrics,
  Options,
  Snapshot,
  ModelAction,
  Segment
} from '../../../shared/types'

interface Controller {
  system: Snapshot
  jobs: Job[]
  files: AudioFile[]
  selected?: string
  setSelected: (id: string) => void
  metrics?: Metrics
  progress?: BackendEvent
  error: string
  clearError: () => void
  stage: string
  running: boolean
  starting: boolean
  cancelling: boolean
  options: Options
  setOptions: (options: Options) => void
  addFiles: (paths?: string[]) => Promise<void>
  start: () => Promise<void>
  cancel: () => Promise<void>
  edit: (index: number, text: string) => void
  exportJob: (format: string) => Promise<void>
  modelAction: (action: ModelAction, model?: string) => Promise<void>
  rename: (kind: 'request' | 'job', id: string, title: string) => Promise<void>
  remove: (id: string) => void
}

/** O processo principal possui a fila; o React mantém seleção, arquivos novos e rascunhos. */
export function useTranscriber(): Controller {
  const [system, setSystem] = useState<Snapshot>({
    requests: [],
    jobs: [],
    models: [],
    observations: [],
    modelState: 'unloaded',
    cpuName: 'Identificando…',
    totalRam: 0,
    ready: false,
    devices: [],
    threads: 1
  })
  const [jobs, setJobs] = useState<Job[]>([])
  const [files, setFiles] = useState<AudioFile[]>([])
  const [selected, setSelected] = useState<string>()
  const [metrics, setMetrics] = useState<Metrics>()
  const [progress, setProgress] = useState<BackendEvent>()
  const [error, setError] = useState('')
  const [stage, setStage] = useState('Iniciando motor Python…')
  const [cancelling, setCancelling] = useState(false)
  const [starting, setStarting] = useState(false)
  const startLock = useRef(false)
  const activeRef = useRef<string | undefined>(undefined)
  const drafts = useRef(new Map<string, Segment[]>())
  const [options, setOptions] = useState<Options>({
    model: 'base',
    device: 'cpu',
    computeType: 'auto',
    language: 'pt',
    threads: 4,
    vad: true
  })
  function accept(snapshot: Snapshot): void {
    setSystem(snapshot)
    setJobs(
      snapshot.jobs.map((job) => ({ ...job, segments: drafts.current.get(job.id) ?? job.segments }))
    )
    if (snapshot.activeJobId && snapshot.activeJobId !== activeRef.current) {
      const previousActive = activeRef.current
      activeRef.current = snapshot.activeJobId
      setProgress(undefined)
      // A execução seguinte não tira a seleção de quem consulta um resultado antigo.
      setSelected((current) =>
        !current || current === previousActive ? snapshot.activeJobId : current
      )
      setStage('Preparando áudio…')
    }
    if (snapshot.loaded)
      setOptions((o) => ({
        ...o,
        model: snapshot.loaded!.model,
        device: snapshot.loaded!.device,
        computeType: snapshot.loaded!.computeType,
        threads: snapshot.loaded!.threads
      }))
    else if (snapshot.ready)
      setOptions((o) => ({ ...o, threads: Math.min(o.threads, snapshot.threads) }))
    if (snapshot.error) setError(snapshot.error)
  }
  useEffect(() => {
    const unsubscribe = window.api.onEvent((event) => {
      if (event.type === 'state' && event.snapshot) accept(event.snapshot)
      if (event.type === 'metrics') {
        setMetrics(event as unknown as Metrics)
        // Mantém o pico visível sem enviar todo o histórico a cada amostra de telemetria.
        setSystem((s) => {
          if (!s.loaded || !event.coreRam) return s
          const o = s.loaded
          const records = s.observations.map((r) => ({ ...r }))
          let record = records.find(
            (r) => r.model === o.model && r.device === o.device && r.computeType === o.computeType
          )
          if (!record) {
            record = {
              model: o.model,
              device: o.device,
              computeType: o.computeType,
              peakRam: 0,
              lastRam: 0,
              date: ''
            }
            records.push(record)
          }
          record.lastRam = event.coreRam
          record.peakRam = Math.max(record.peakRam, event.coreRam)
          record.date = new Date().toISOString()
          return { ...s, observations: records }
        })
      }
      if (event.type === 'download') setProgress(event)
      if (event.type === 'stage') setStage(event.message || 'Processando…')
      if (event.type === 'progress') setProgress(event)
      if (event.type === 'segment')
        setJobs((list) =>
          list.map((job) =>
            job.id === event.jobId ? { ...job, segments: [...job.segments, event.segment!] } : job
          )
        )
      if (['complete', 'cancelled', 'error', 'fatal'].includes(event.type)) {
        setCancelling(false)
        setStage(
          event.type === 'complete'
            ? 'Transcrição concluída'
            : event.type === 'cancelled'
              ? 'Cancelado · resultado parcial preservado'
              : 'Não foi possível concluir'
        )
        if (event.type === 'complete') {
          setProgress((p) => ({ ...p, type: 'progress', percent: 100 }))
          toast.success('Áudio transcrito')
        }
        if (event.type === 'error' || event.type === 'fatal')
          setError(event.message || 'Erro no motor.')
      }
      if (event.type === 'restarting') setStage(event.message || 'Reiniciando motor…')
    })
    window.api
      .snapshot()
      .then((s) => {
        accept(s)
        setSelected(s.activeJobId ?? s.jobs[0]?.id)
      })
      .catch((e) => setError(String(e)))
    return unsubscribe
  }, [])
  async function addFiles(paths?: string[]): Promise<void> {
    try {
      const added = paths ? await window.api.importPaths(paths) : await window.api.selectFiles()
      setFiles((list) => [...list, ...added])
    } catch (e) {
      setError(String(e))
    }
  }
  async function start(): Promise<void> {
    if (startLock.current || !files.length) return
    startLock.current = true
    setStarting(true)
    setError('')
    const ids = files.map((file) => file.id)
    try {
      const snapshot = await window.api.startRequest(ids, options)
      accept(snapshot)
      setSelected(snapshot.activeJobId)
      setFiles((list) => list.filter((f) => !ids.includes(f.id)))
    } catch (e) {
      setError(String(e))
    } finally {
      startLock.current = false
      setStarting(false)
    }
  }
  async function cancel(): Promise<void> {
    setCancelling(true)
    try {
      await window.api.cancel()
    } catch (e) {
      setError(String(e))
      setCancelling(false)
    }
  }
  function edit(index: number, text: string): void {
    const job = jobs.find((j) => j.id === selected)
    if (!job || job.status === 'running' || job.status === 'queued') return
    const segments = job.segments.map((s, i) => (i === index ? { ...s, text } : s))
    drafts.current.set(job.id, segments)
    setJobs((list) => list.map((j) => (j.id === job.id ? { ...j, segments } : j)))
  }
  async function exportJob(format: string): Promise<void> {
    const job = jobs.find((j) => j.id === selected)
    if (!job) return
    try {
      if (await window.api.exportJob(job.id, format, job.segments)) {
        drafts.current.delete(job.id)
        toast.success('Transcrição exportada')
      }
    } catch (e) {
      setError(String(e))
    }
  }
  async function modelAction(action: ModelAction, model?: string): Promise<void> {
    setError('')
    if (action === 'download') setProgress(undefined)
    try {
      await window.api.modelAction(action, model, options)
    } catch (e) {
      setError(String(e))
    } finally {
      setCancelling(false)
    }
  }
  async function rename(kind: 'request' | 'job', id: string, title: string): Promise<void> {
    try {
      accept(await window.api.rename(kind, id, title))
      toast.success('Nome atualizado')
    } catch (e) {
      setError(String(e))
      throw e
    }
  }
  return {
    system,
    jobs,
    files,
    selected,
    setSelected,
    metrics,
    progress,
    error,
    clearError: () => setError(''),
    stage,
    running: !!system.activeJobId || system.jobs.some((j) => j.status === 'queued'),
    starting,
    cancelling,
    options,
    setOptions,
    addFiles,
    start,
    cancel,
    edit,
    exportJob,
    modelAction,
    rename,
    remove: (id: string) => setFiles((list) => list.filter((f) => f.id !== id))
  }
}
