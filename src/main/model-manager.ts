import { dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Snapshot, Options, ModelEntry, ModelAction, BenchmarkResult } from '../shared/types'
import type { Backend } from './backend'
interface Context {
  state: Snapshot
  backend: Backend
  isTranscribing: () => boolean
  getWindow: () => BrowserWindow
  resetCore: () => void
  publish: () => void
  saveObservations: () => void
}
/** Serializa operações de modelos e mantém as transições da interface alinhadas ao core. */
export function createModelHandler({
  state,
  backend,
  isTranscribing,
  getWindow,
  resetCore,
  publish,
  saveObservations
}: Context): (actionInput: unknown, nameInput: unknown, optionsInput: unknown) => Promise<void> {
  return async (actionInput, nameInput, optionsInput) => {
    const action = actionInput as ModelAction
    const name = typeof nameInput === 'string' ? nameInput : undefined
    if (
      !['load', 'unload', 'download', 'delete', 'catalog', 'metadata', 'benchmark'].includes(action)
    )
      throw new Error('Operação inválida.')
    if (!state.ready || isTranscribing() || state.operation)
      throw new Error('Aguarde a operação atual terminar.')
    if (
      ['download', 'delete', 'metadata'].includes(action) &&
      !state.models.some((m) => m.name === name)
    )
      throw new Error('Modelo inválido.')
    if (action === 'load' && state.modelState !== 'unloaded')
      throw new Error('Descarregue o modelo atual.')
    if (action === 'benchmark' && !state.loaded)
      throw new Error('Carregue um modelo antes de testar.')
    if (action === 'delete') {
      const entry = state.models.find((m) => m.name === name)!
      const answer = await dialog.showMessageBox(getWindow(), {
        type: 'question',
        buttons: ['Cancelar', 'Excluir modelo'],
        defaultId: 0,
        cancelId: 0,
        message: `Excluir ${name}?`,
        detail: `Aproximadamente ${(entry.bytes / 1024 ** 2).toFixed(1)} MiB serão liberados. Transcrições serão preservadas.`
      })
      if (answer.response !== 1) return
      if (isTranscribing() || state.operation)
        throw new Error('O aplicativo ficou ocupado. Tente novamente.')
    }
    const operationId = randomUUID()
    state.operationId = operationId
    state.operation = action
    state.operationModel = name
    try {
      if (action === 'load') {
        const options = optionsInput as Options
        const device = state.devices.find((d) => d.id === options?.device)
        if (
          !device ||
          !state.models.some((m) => m.name === options.model && m.installed) ||
          !Number.isInteger(options.threads) ||
          options.threads < 1 ||
          options.threads > state.threads ||
          (options.computeType !== 'auto' && !device.computeTypes.includes(options.computeType))
        )
          throw new Error('Modelo não instalado ou configuração inválida.')
        state.modelState = 'loading'
        publish()
        state.loaded = await backend.request<Options>({ type: 'load', options })
        state.modelState = 'loaded'
      } else if (action === 'unload') {
        state.modelState = 'unloading'
        publish()
        resetCore()
      } else if (action === 'benchmark') {
        publish()
        const result = await backend.request<BenchmarkResult>({ type: 'benchmark' })
        const key = result.options
        let record = state.observations.find(
          (o) =>
            o.model === key.model && o.device === key.device && o.computeType === key.computeType
        )
        if (!record) {
          record = {
            model: key.model,
            device: key.device,
            computeType: key.computeType,
            peakRam: 0,
            lastRam: 0,
            date: ''
          }
          state.observations.push(record)
        }
        record.benchmark = result
        record.peakRam = Math.max(record.peakRam, result.peakRam)
        record.date = new Date().toISOString()
      } else if (action === 'metadata') {
        publish()
        const bytes = await backend.request<number>({ type: action, model: name })
        const entry = state.models.find((m) => m.name === name)!
        if (bytes > 0) {
          entry.downloadBytes = bytes
          entry.estimated = false
        }
      } else {
        if (action === 'delete' && state.loaded?.model === name) resetCore()
        publish()
        state.models = await backend.request<ModelEntry[]>({ type: action, model: name })
      }
    } catch (error) {
      if (action === 'load' && state.modelState === 'loading') resetCore()
      if (action === 'download' && state.ready) {
        try {
          state.models = await backend.request<ModelEntry[]>({ type: 'catalog' })
        } catch {
          /* O reinício atualizará o catálogo. */
        }
      }
      throw error
    } finally {
      // Uma resposta antiga não pode limpar uma operação iniciada após um reinício.
      if (state.operationId === operationId) {
        state.operation = undefined
        state.operationModel = undefined
        state.operationId = undefined
      }
      saveObservations()
      publish()
    }
  }
}
