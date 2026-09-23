import type { AskConfirmation } from '../shared/confirmation'
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
  ask: AskConfirmation
}
/** Um único processo pesado: a transição só inicia o destino após o exit anterior. */
export function createEngineManager(c: Context): {
  switchTo: (id: string) => Promise<boolean>
  run: (id: string, action: 'api-test' | 'api-models') => Promise<EngineTest | RemoteModel[]>
} {
  const free = (allowRead = false): void => {
    if (c.busy() || (c.state.operation && !(allowRead && c.state.operation === 'api-models')))
      throw new Error('Conclua ou cancele a transcrição/operação antes de alterar o motor.')
  }
  return {
    async switchTo(id) {
      free(true)
      if (id !== 'whisper') c.profiles.get(id)
      if (id === c.profiles.activeId && c.state.ready) return true
      const origin = c.profiles.activeId
      const answer = await c.ask({
        title: 'Desativar o motor atual?',
        action: 'Trocar motor',
        description: `O processo atual será encerrado e sua memória será liberada. Destino: ${id === 'whisper' ? 'Whisper local' : c.profiles.get(id).name}. Perfis salvos permanecem; alterações temporárias do motor anterior serão descartadas.`
      })
      if (!answer) return false
      if (origin !== c.profiles.activeId) throw new Error('O motor mudou. Confirme novamente.')
      free(true)
      const operationId = randomUUID()
      c.state.operationId = operationId
      c.state.operation = 'switch-engine'
      c.state.ready = false
      c.publish()
      try {
        await c.backend.shutdown()
        c.state.devices = []
        c.state.models = []
        c.state.loaded = undefined
        c.state.modelState = 'unloaded'
        c.profiles.activeId = id
        c.profiles.persist()
        c.profiles.discard(origin)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('O motor não iniciou em 30 segundos.')),
            30000
          )
          c.backend.start(
            (event) => {
              c.receive(event)
              if (event.type === 'ready') {
                clearTimeout(timer)
                resolve()
              }
              if (event.type === 'fatal') {
                clearTimeout(timer)
                reject(new Error(event.message))
              }
            },
            id === 'whisper' ? 'whisper' : 'api'
          )
        })
        return true
      } finally {
        if (c.state.operationId === operationId) {
          c.state.operation = undefined
          c.state.operationId = undefined
        }
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
