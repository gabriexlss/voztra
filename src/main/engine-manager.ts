import { dialog, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Backend } from './backend'
import type { EngineProfiles } from './engine-profiles'
import type { BackendEvent, Snapshot } from '../shared/types'
import type { RemoteModel, EngineTest } from '../shared/engines'

interface Context {
  backend: Backend
  profiles: EngineProfiles
  state: Snapshot
  busy: () => boolean
  publish: () => void
  receive: (event: BackendEvent) => void
  window: () => BrowserWindow
}
/** Um único processo pesado: a transição só inicia o destino após o exit anterior. */
export function createEngineManager(c: Context): {
  switchTo: (id: string) => Promise<void>
  run: (id: string, action: 'api-test' | 'api-models') => Promise<EngineTest | RemoteModel[]>
} {
  const free = (): void => {
    if (c.busy() || c.state.operation)
      throw new Error('Conclua ou cancele a transcrição/operação antes de alterar o motor.')
  }
  return {
    async switchTo(id) {
      free()
      if (id !== 'whisper') c.profiles.get(id)
      if (id === c.profiles.activeId && c.state.ready) return
      const answer = await dialog.showMessageBox(c.window(), {
        type: 'question',
        buttons: ['Cancelar', 'Trocar motor'],
        defaultId: 1,
        cancelId: 0,
        message: 'Desativar o motor atual?',
        detail:
          'O processo atual será encerrado. Modelos carregados e conexões serão liberados; suas configurações permanecem salvas.'
      })
      if (answer.response !== 1) return
      free()
      c.state.operation = 'switch-engine'
      c.state.ready = false
      c.publish()
      try {
        await c.backend.shutdown()
        c.state.loaded = undefined
        c.state.modelState = 'unloaded'
        c.profiles.activeId = id
        c.profiles.persist()
        c.backend.start(c.receive, id === 'whisper' ? 'whisper' : 'api')
      } finally {
        c.state.operation = undefined
        c.publish()
      }
    },
    async run(id, action) {
      free()
      if (id !== c.profiles.activeId || id === 'whisper' || !c.state.ready)
        throw new Error('Ative esta conexão antes de consultar ou testar.')
      c.state.operation = action
      const operationId = randomUUID()
      c.state.operationId = operationId
      c.publish()
      try {
        return await c.backend.request<EngineTest | RemoteModel[]>({
          type: action,
          profile: c.profiles.credentials(id)
        })
      } finally {
        if (c.state.operationId === operationId) {
          c.state.operation = undefined
          c.state.operationId = undefined
          c.publish()
        }
      }
    }
  }
}
