/** Contratos comuns: a interface nunca acessa Node ou Python diretamente. */
export interface Options {
  model: string
  device: string
  computeType: string
  language: string
  threads: number
  vad: boolean
}
export interface Segment {
  timing?: 'approximate' | 'provider'
  start: number
  end: number
  text: string
}
export interface AudioFile {
  id: string
  name: string
  path: string
}
export interface Device {
  id: string
  name: string
  computeTypes: string[]
}
export interface Metrics {
  cpu: number
  appCpu: number
  ram: number
  totalRam: number
  appRam: number
  coreRam: number
  memoryKind: string
  gpus: {
    index: number
    usage: number
    used: number
    total: number
    appUsed: number | null
    appUsage: number | null
  }[]
}
export interface Job {
  engine?: import('./engines').EngineProfile
  usage?: unknown
  microphone?: boolean
  id: string
  requestId?: string
  displayName?: string
  file: AudioFile
  options: Options
  segments: Segment[]
  status: 'queued' | 'running' | 'complete' | 'cancelled' | 'error' | 'interrupted'
  createdAt: string
  message?: string
}
export interface ModelEntry {
  name: string
  bytes: number
  installed: boolean
  partial: boolean
  downloadBytes: number
  estimated: boolean
  error?: string
}
export interface Observation {
  model: string
  device: string
  computeType: string
  peakRam: number
  lastRam: number
  date: string
  benchmark?: BenchmarkResult
}
export interface BenchmarkResult {
  duration: number
  elapsed: number
  speed: number
  peakRam: number
  options: Options
}
export type ModelAction =
  'load' | 'unload' | 'download' | 'delete' | 'catalog' | 'metadata' | 'benchmark'
export interface BackendEvent {
  usage?: unknown
  type: string
  requestId?: string
  ok?: boolean
  result?: unknown
  snapshot?: Snapshot
  models?: ModelEntry[]
  model?: string
  cpuName?: string
  coreRam?: number
  jobId?: string
  message?: string
  devices?: Device[]
  threads?: number
  segment?: Segment
  percent?: number | null
  processed?: number
  duration?: number
  elapsed?: number
  speed?: number
  eta?: number | null
  computeType?: string
  cpu?: number
  appCpu?: number
  ram?: number
  totalRam?: number
  appRam?: number
  gpus?: Metrics['gpus']
}
export interface TranscriptionRequest {
  id: string
  title: string
  createdAt: string
  jobIds: string[]
}
export interface Snapshot {
  engines?: import('./engines').EngineState
  requests: TranscriptionRequest[]
  activeJobId?: string
  modelState: 'unloaded' | 'loading' | 'loaded' | 'unloading'
  loaded?: Options
  operation?: string
  operationId?: string
  operationModel?: string
  models: ModelEntry[]
  observations: Observation[]
  cpuName: string
  totalRam: number
  ready: boolean
  devices: Device[]
  threads: number
  jobs: Job[]
  error?: string
}
export interface DesktopAPI {
  cudaAction(action: 'status' | 'install' | 'remove'): Promise<import('./engines').CudaStatus>
  saveEngine(
    profile: import('./engines').EngineProfile,
    key?: string,
    remember?: boolean
  ): Promise<import('./engines').EngineProfile>
  deleteEngine(id: string): Promise<void>
  switchEngine(id: string): Promise<void>
  engineModels(id: string): Promise<import('./engines').RemoteModel[]>
  testEngine(id: string): Promise<import('./engines').EngineTest>
  startMicrophone(): Promise<string>
  microphoneFrame(jobId: string, audio: string): Promise<void>
  finishMicrophone(jobId: string): Promise<void>
  updatesSnapshot(): Promise<import('./updates').UpdateState>
  updateCommand(
    command: import('./updates').UpdateCommand
  ): Promise<import('./updates').UpdateState>
  setAutomaticUpdates(value: boolean): Promise<import('./updates').UpdateState>
  onUpdate(callback: (state: import('./updates').UpdateState) => void): () => void
  openReference(url: string): Promise<void>
  modelAction(action: ModelAction, model?: string, options?: Options): Promise<void>
  snapshot(): Promise<Snapshot>
  selectFiles(): Promise<AudioFile[]>
  importPaths(paths: string[]): Promise<AudioFile[]>
  filePath(file: File): string
  start(fileId: string, options: Options): Promise<Job>
  startRequest(fileIds: string[], options: Options): Promise<Snapshot>
  rename(kind: 'request' | 'job', id: string, title: string): Promise<Snapshot>
  cancel(): Promise<void>
  exportJob(jobId: string, format: string, segments: Segment[]): Promise<boolean>
  onEvent(callback: (event: BackendEvent) => void): () => void
}
