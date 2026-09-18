import { createModelHandler } from './model-manager'
import { dataDirectory, ensureWritable } from './data-paths'
import { UpdateManager } from './updater'
import { EngineProfiles } from './engine-profiles'
import { createEngineManager } from './engine-manager'
import { isLive } from '../shared/engines'
import { cudaManager } from './cuda-manager'
import type { UpdateCommand } from '../shared/updates'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join, basename } from 'node:path'
import { statSync, writeFileSync, readFileSync } from 'node:fs'
import { writeAtomic } from './atomic-file'
import { randomUUID } from 'node:crypto'
import { is } from '@electron-toolkit/utils'
import { Backend } from './backend'
import { JobStore } from './storage'
import { serializeTranscript } from './export'
import type { AudioFile, BackendEvent, Options, Segment, Snapshot } from '../shared/types'

app.setPath('userData', dataDirectory(app.getPath('appData'), process.env))
let directoryError: unknown
try {
  ensureWritable(app.getPath('userData'))
} catch (error) {
  directoryError = error
}
// Uma instância por diretório impede escritas concorrentes no mesmo histórico.
const primaryInstance = directoryError ? true : app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
app.on('second-instance', () => {
  window?.restore()
  window?.focus()
})
// Alternativa explícita para drivers com falha, sem desativar a GPU de toda instalação.
if (process.env.VOZTRA_DISABLE_GPU === '1') app.disableHardwareAcceleration()
const backend = new Backend()
let updates: UpdateManager
let window: BrowserWindow | null = null
let store: JobStore
let profiles: EngineProfiles
let active: string | undefined
const imported = new Map<string, AudioFile>()
const state: Snapshot = {
  ready: false,
  devices: [],
  threads: 1,
  jobs: [],
  requests: [],
  models: [],
  modelState: 'unloaded',
  observations: [],
  cpuName: 'Identificando…',
  totalRam: 0
}
let observationsPath: string
function publish(): void {
  if (profiles) state.engines = profiles.snapshot()
  state.activeJobId = active
  if (window && !window.isDestroyed())
    window.webContents.send('core:event', { type: 'state', snapshot: state })
}
function saveObservations(): void {
  // A troca atômica preserva a última medição íntegra se o processo for interrompido.
  writeAtomic(observationsPath, JSON.stringify(state.observations))
}
function resetCore(): void {
  backend.stop()
  state.ready = false
  state.modelState = 'unloaded'
  state.loaded = undefined
  saveObservations()
  publish()
  backend.start(receive, profiles?.activeId === 'whisper' ? 'whisper' : 'api')
}

/** Somente arquivos escolhidos ou soltos pelo usuário recebem identificadores válidos. */
function importFiles(paths: string[]): AudioFile[] {
  if (!Array.isArray(paths) || paths.length > 100) throw new Error('Seleção inválida.')
  return paths.map((path) => {
    if (typeof path !== 'string' || !statSync(path).isFile()) throw new Error('Arquivo inválido.')
    const file = { id: randomUUID(), name: basename(path), path }
    imported.set(file.id, file)
    return file
  })
}

function receive(event: BackendEvent): void {
  if (event.type === 'ready') {
    state.ready = true
    if (profiles.activeId === 'whisper') {
      state.devices = event.devices || []
      state.threads = event.threads || 1
      state.cpuName = event.cpuName || 'Não identificado'
      state.totalRam = event.totalRam || 0
      state.models = event.models || []
    }
    state.error = undefined
    publish()
  }
  if (event.type === 'fatal') {
    state.ready = false
    state.error = event.message
    state.loaded = undefined
    state.modelState = 'unloaded'
    state.operation = undefined
    state.operationId = undefined
    state.operationModel = undefined
    publish()
    event.jobId = active
  }
  if (event.type === 'metrics' && state.loaded && event.coreRam) {
    const options = state.loaded
    let record = state.observations.find(
      (o) =>
        o.model === options.model &&
        o.device === options.device &&
        o.computeType === options.computeType
    )
    if (!record) {
      record = {
        model: options.model,
        device: options.device,
        computeType: options.computeType,
        peakRam: 0,
        lastRam: 0,
        date: ''
      }
      state.observations.push(record)
    }
    record.lastRam = event.coreRam
    record.peakRam = Math.max(record.peakRam, event.coreRam)
    record.date = new Date().toISOString()
  }
  const job = store.jobs.find((item) => item.id === event.jobId)
  if (job) {
    if (event.usage) job.usage = event.usage
    if (event.segment) job.segments.push(event.segment)
    if (event.message) job.message = event.message
    if (['complete', 'cancelled', 'error', 'fatal'].includes(event.type)) {
      job.status =
        event.type === 'fatal' ? 'error' : (event.type as 'complete' | 'cancelled' | 'error')
      active = undefined
      if (event.type === 'fatal')
        store.jobs
          .filter((item) => item.status === 'queued')
          .forEach((item) => {
            item.status = 'interrupted'
          })
      publish()
      setImmediate(pumpQueue)
    }
    if (event.segment || job.status !== 'running') store.save()
  }
  if (window && !window.isDestroyed()) window.webContents.send('core:event', event)
}

/** A fila pertence ao processo principal; navegar entre abas não altera a solicitação. */
function pumpQueue(): void {
  if (
    active ||
    !state.ready ||
    (profiles.activeId === 'whisper' && !state.loaded) ||
    state.operation
  )
    return
  const job = store.jobs.find((item) => item.status === 'queued')
  if (!job) return
  active = job.id
  job.status = 'running'
  job.createdAt = new Date().toISOString()
  store.save()
  publish()
  try {
    const profile = job.engine
      ? { ...job.engine, apiKey: profiles.credentials(job.engine.id).apiKey }
      : undefined
    backend.send({
      type: 'start',
      jobId: job.id,
      path: job.file.path,
      options: job.options,
      profile,
      microphone: job.microphone
    })
  } catch (error) {
    receive({ type: 'error', jobId: job.id, message: String(error) })
  }
}

function createWindow(): void {
  window = new BrowserWindow({
    show: false,
    title: 'Voztra',
    icon: join(__dirname, '../renderer/icon.png'),
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: '#1C2025',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  window.once('ready-to-show', () => window?.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  if (is.dev && process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else window.loadFile(join(__dirname, '../renderer/index.html'))
  window.on('close', (event) => {
    if (
      active &&
      dialog.showMessageBoxSync(window!, {
        type: 'question',
        buttons: ['Continuar transcrevendo', 'Encerrar'],
        defaultId: 0,
        cancelId: 0,
        message: 'Encerrar a transcrição? Os segmentos concluídos já foram salvos.'
      }) === 0
    )
      event.preventDefault()
  })
}

app.whenReady().then(() => {
  if (!primaryInstance) return
  try {
    if (directoryError) throw directoryError
    ensureWritable(app.getPath('userData'))
    store = new JobStore(join(app.getPath('userData'), 'history'))
    profiles = new EngineProfiles(join(app.getPath('userData'), 'engines.json'))
  } catch (error) {
    dialog.showErrorBox(
      'Não foi possível abrir os dados do Voztra',
      `Escolha uma pasta com permissão de escrita. No portable, mova o executável e sua pasta data juntos.\n${String(error)}`
    )
    app.quit()
    return
  }
  state.jobs = store.jobs
  state.requests = store.requests
  observationsPath = join(app.getPath('userData'), 'observations.json')
  try {
    const saved = JSON.parse(readFileSync(observationsPath, 'utf8'))
    if (!Array.isArray(saved)) throw new Error('Medições inválidas.')
    state.observations = saved.filter(
      (record) =>
        record &&
        typeof record.model === 'string' &&
        typeof record.device === 'string' &&
        typeof record.computeType === 'string' &&
        Number.isFinite(record.peakRam) &&
        Number.isFinite(record.lastRam) &&
        typeof record.date === 'string' &&
        (!record.benchmark ||
          ['duration', 'elapsed', 'speed', 'peakRam'].every((key) =>
            Number.isFinite(record.benchmark[key])
          ))
    )
  } catch {
    state.observations = []
  }

  // Centraliza a validação de origem para todos os comandos privilegiados.
  const handle = (channel: string, callback: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame !== window?.webContents.mainFrame
      )
        throw new Error('Origem não autorizada.')
      if (
        updates?.state.status === 'installing' &&
        [
          'start-request',
          'start',
          'model-action',
          'engine-save',
          'engine-switch',
          'engine-test',
          'cuda-action',
          'microphone-start'
        ].includes(channel)
      )
        throw new Error('O Voztra está reiniciando para atualizar.')
      return callback(...args)
    })
  }
  handle('open-reference', async (value) => {
    const url = new URL(String(value))
    if (
      url.protocol !== 'https:' ||
      !['browser.geekbench.com', 'github.com'].includes(url.hostname)
    )
      throw new Error('Fonte inválida.')
    await shell.openExternal(url.href)
  })
  handle('snapshot', () => state)
  state.engines = profiles.snapshot()
  const engineBusy = (): boolean => !!active || store.jobs.some((j) => j.status === 'queued')
  const engines = createEngineManager({
    backend,
    profiles,
    state,
    busy: engineBusy,
    publish,
    receive,
    window: () => window!
  })
  handle('engine-switch', (id) => engines.switchTo(String(id)))
  handle(
    'cuda-action',
    cudaManager({ backend, state, busy: engineBusy, publish, receive, window: () => window! })
  )
  handle('engine-save', (profile, key, remember) => {
    if (engineBusy() || state.operation) throw new Error('Aguarde a operação atual.')
    const result = profiles.save(profile, key, remember)
    publish()
    return result
  })
  handle('engine-delete', (id) => {
    if (engineBusy() || state.operation) throw new Error('Aguarde a operação atual.')
    profiles.delete(String(id))
    publish()
  })
  handle('engine-models', (id) => engines.run(String(id), 'api-models'))
  handle('engine-test', (id) => engines.run(String(id), 'api-test'))
  updates = new UpdateManager(
    (value) => {
      if (window && !window.isDestroyed()) window.webContents.send('updates:event', value)
    },
    () => !!active || !!state.operation || store.jobs.some((job) => job.status === 'queued')
  )
  handle('updates-snapshot', () => updates.state)
  handle('updates-command', (command) => updates.command(command as UpdateCommand))
  handle('updates-automatic', (value) => updates.setAutomatic(value))
  handle(
    'model-action',
    createModelHandler({
      state,
      backend,
      isTranscribing: () => profiles.activeId !== 'whisper' || engineBusy(),
      getWindow: () => window!,
      resetCore,
      publish,
      saveObservations
    })
  )
  handle('select-files', async () => {
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Áudio e vídeo',
          extensions: [
            'mp3',
            'wav',
            'flac',
            'm4a',
            'aac',
            'ogg',
            'opus',
            'wma',
            'aiff',
            'aif',
            'mp4',
            'mkv',
            'webm'
          ]
        },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    })
    return importFiles(result.filePaths)
  })
  handle('import-paths', (paths) => importFiles(paths as string[]))
  const startRequest = (ids: unknown, input: unknown): Snapshot => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
      throw new Error('Solicitação inválida.')
    const files = ids.map((id) => imported.get(String(id)))
    const file = files[0]
    const profile = profiles.activeId === 'whisper' ? undefined : profiles.get()
    const options = profile
      ? {
          model: profile.model,
          device: 'api',
          computeType: 'api',
          language: '',
          threads: 1,
          vad: false
        }
      : (input as Options)
    const device = state.devices.find((d) => d.id === options?.device)
    if (
      active ||
      !state.ready ||
      !file ||
      files.some((item) => !item) ||
      store.jobs.some((item) => item.status === 'queued') ||
      state.operation ||
      (!profile && (!state.loaded || state.modelState !== 'loaded'))
    )
      throw new Error('Não é possível iniciar esta transcrição.')
    if (profile && !profile.model.trim()) throw new Error('Informe um modelo na aba Motores.')
    if (
      !profile &&
      (!device ||
        !['tiny', 'base', 'small', 'medium', 'large-v1', 'large-v2', 'large-v3', 'turbo'].includes(
          options.model
        ) ||
        (options.computeType !== 'auto' && !device.computeTypes.includes(options.computeType)) ||
        !Number.isInteger(options.threads) ||
        options.threads < 1 ||
        options.threads > state.threads ||
        typeof options.language !== 'string' ||
        options.language.length > 8 ||
        typeof options.vad !== 'boolean')
    )
      throw new Error('Configuração inválida.')
    if (
      !profile &&
      (!state.loaded ||
        ['model', 'device', 'threads'].some(
          (field) => options[field as keyof Options] !== state.loaded![field as keyof Options]
        ) ||
        !['auto', state.loaded.computeType].includes(options.computeType))
    )
      throw new Error('Use a configuração do modelo carregado.')
    const requestId = randomUUID()
    const createdAt = new Date().toISOString()
    const jobs = files.map((file) => ({
      id: randomUUID(),
      requestId,
      file: file!,
      options: { ...options },
      engine: profile,
      microphone: file?.path === '',
      segments: [],
      status: 'queued' as const,
      createdAt
    }))
    store.requests.unshift({
      id: requestId,
      title:
        files[0]!.name +
        (files.length > 1
          ? ` + ${files.length - 1} ${files.length === 2 ? 'áudio' : 'áudios'}`
          : ''),
      createdAt,
      jobIds: jobs.map((job) => job.id)
    })
    store.jobs.unshift(...jobs)
    store.save()
    pumpQueue()
    return state
  }
  handle('start-request', startRequest)
  handle('start', (id, input) => startRequest([id], input).jobs[0])
  handle('microphone-start', () => {
    if (profiles.activeId === 'whisper' || !isLive(profiles.get().protocol))
      throw new Error('Selecione um protocolo Live para usar o microfone.')
    const id = randomUUID()
    imported.set(id, { id, name: 'Microfone · ' + new Date().toLocaleString('pt-BR'), path: '' })
    try {
      return startRequest([id], {}).activeJobId
    } finally {
      imported.delete(id)
    }
  })
  handle('microphone-frame', (id, audio) => {
    if (active !== id || !store.jobs.find((j) => j.id === id)?.microphone)
      throw new Error('Sessão de microfone inativa.')
    if (typeof audio !== 'string' || audio.length > 12800 || !/^[A-Za-z0-9+/]*={0,2}$/.test(audio))
      throw new Error('Bloco PCM inválido.')
    backend.send({ type: 'live-frame', jobId: id, audio })
  })
  handle('microphone-end', (id) => {
    if (active !== id || !store.jobs.find((j) => j.id === id)?.microphone) return
    backend.send({ type: 'live-end', jobId: id })
  })
  handle('rename', (kind, id, title) => {
    if (
      !['request', 'job'].includes(String(kind)) ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 160
    )
      throw new Error('Nome inválido (1 a 160 caracteres).')
    if (kind === 'request') {
      const request = store.requests.find((item) => item.id === id)
      if (!request) throw new Error('Solicitação não encontrada.')
      request.title = title.trim()
    } else {
      const job = store.jobs.find((item) => item.id === id)
      if (!job) throw new Error('Áudio não encontrado.')
      job.displayName = title.trim()
    }
    store.save()
    publish()
    return state
  })
  handle('cancel', () => {
    if (!active && !state.operation) return
    // O cancelamento inclui os arquivos ainda não iniciados da solicitação.
    store.jobs
      .filter((job) => job.status === 'queued')
      .forEach((job) => {
        job.status = 'cancelled'
      })
    store.save()
    publish()
    const cancelledId = active
    backend.send({ type: 'cancel' })
    const operationId = state.operationId
    const timer = setTimeout(() => {
      if (cancelledId ? active !== cancelledId : !operationId || state.operationId !== operationId)
        return
      if (cancelledId) receive({ type: 'cancelled', jobId: cancelledId })
      state.operation = undefined
      state.operationId = undefined
      state.operationModel = undefined
      resetCore()
      receive({
        type: 'restarting',
        message:
          profiles.activeId === 'whisper'
            ? 'Modelo descarregado após cancelamento. Carregue-o novamente para transcrever.'
            : 'Conexão encerrada após cancelamento. O provedor pode cobrar áudio já recebido.'
      })
    }, 2000)
    timer.unref()
  })
  handle('export', async (id, format, input) => {
    const job = store.jobs.find((item) => item.id === id)
    const segments = input as Segment[]
    if (
      !job ||
      !Array.isArray(segments) ||
      !segments.every(
        (s) =>
          Number.isFinite(s.start) &&
          s.start >= 0 &&
          Number.isFinite(s.end) &&
          s.end >= s.start &&
          typeof s.text === 'string'
      ) ||
      !['txt', 'srt', 'vtt', 'json'].includes(String(format))
    )
      throw new Error('Exportação inválida.')
    const editingAllowed = job.status !== 'running'
    const result = await dialog.showSaveDialog(window!, {
      defaultPath: `${job.file.name.replace(/\.[^.]+$/, '')}.${format}`,
      filters: [{ name: String(format).toUpperCase(), extensions: [String(format)] }]
    })
    if (result.canceled || !result.filePath) return false
    writeFileSync(result.filePath, serializeTranscript(segments, String(format)), 'utf8')
    // Exportar um parcial não pode substituir segmentos recebidos durante o diálogo.
    if (editingAllowed) {
      job.segments = segments
      store.save()
    }
    return true
  })
  createWindow()
  updates.start()
  backend.start(receive, profiles.activeId === 'whisper' ? 'whisper' : 'api')
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  updates?.stop()
  if (observationsPath) saveObservations()
  backend.stop()
})
