import { randomUUID } from 'node:crypto'
import { Backend } from './backend'
import type { BackendEvent, Snapshot } from '../shared/types'
import type { CudaStatus } from '../shared/engines'
import type { AskConfirmation } from '../shared/confirmation'

/** Serviço de manutenção independente: jamais usa o worker API para operar DLLs. */
export function cudaManager(c: {
  backend: Backend
  state: Snapshot
  busy: () => boolean
  publish: () => void
  receive: (e: BackendEvent) => void
  ask: AskConfirmation
}): { action: (action: unknown) => Promise<CudaStatus>; cancel: () => void; stop: () => void } {
  let statusRequest: Promise<CudaStatus> | undefined
  let pending = false
  let worker: Backend | undefined
  let cancelRequested = false
  let maintenanceReady = false
  const actionHandler = async (action: unknown): Promise<CudaStatus> => {
    if (!['status', 'install', 'remove'].includes(String(action)))
      throw new Error('Ação NVIDIA inválida.')
    const free = (): void => {
      if (c.busy() || c.state.operation || !c.state.ready || pending)
        throw new Error('Aguarde a operação atual.')
    }
    free()
    const mutate = action !== 'status'
    if (mutate) {
      if (process.platform !== 'win32')
        throw new Error('Instalação opcional disponível no Windows.')
      const accepted = await c.ask({
        title:
          action === 'install' ? 'Instalar bibliotecas NVIDIA?' : 'Remover bibliotecas NVIDIA?',
        action: action === 'install' ? 'Instalar' : 'Remover',
        description:
          'O modelo local será descarregado se estiver ativo. Download aproximado: 1,25 GiB; reserve 4 GiB livres. O driver da placa continua necessário. Licenças: docs.nvidia.com/cuda/eula e docs.nvidia.com/deeplearning/cudnn. Modelos e histórico serão preservados.'
      })
      if (!accepted) throw new Error('Operação cancelada.')
      free()
    }
    pending = true
    const maintenance = new Backend()
    maintenanceReady = false
    worker = maintenance
    cancelRequested = false
    const id = randomUUID()
    const local = c.state.engines?.activeId === 'whisper'
    let stopped = false
    if (mutate) {
      c.state.operationId = id
      c.state.operation = 'cuda-' + action
      c.publish()
    }
    try {
      if (mutate && local) {
        c.state.ready = false
        await c.backend.shutdown()
        stopped = true
        c.state.loaded = undefined
        c.state.modelState = 'unloaded'
        c.publish()
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Manutenção GPU não iniciou.')), 30000)
        maintenance.start((event) => {
          if (event.type === 'ready') {
            maintenanceReady = true
            clearTimeout(timer)
            resolve()
          } else if (event.type === 'fatal') {
            clearTimeout(timer)
            reject(new Error(event.message))
          } else if (mutate) c.receive(event)
        }, 'gpu')
      })
      if (cancelRequested) throw new Error('Instalação cancelada.')
      return await maintenance.request<CudaStatus>({ type: 'cuda-' + action })
    } finally {
      await maintenance.shutdown()
      maintenanceReady = false
      worker = undefined
      pending = false
      if (mutate && c.state.operationId === id) {
        c.state.operation = undefined
        c.state.operationId = undefined
        if (stopped) c.backend.start(c.receive, 'whisper')
        c.publish()
        if (cancelRequested)
          c.receive({ type: 'cancelled', message: 'Instalação de bibliotecas cancelada.' })
      }
    }
  }
  return {
    // Consultas simultâneas compartilham o mesmo worker; manutenção aguarda a leitura.
    action: async (action) => {
      if (action === 'status') {
        statusRequest ??= actionHandler(action).finally(() => {
          statusRequest = undefined
        })
        return statusRequest
      }
      await statusRequest?.catch(() => {})
      return actionHandler(action)
    },
    cancel: () => {
      if (c.state.operation !== 'cuda-install') return
      cancelRequested = true
      if (maintenanceReady) worker?.send({ type: 'cancel' })
    },
    stop: () => worker?.stop()
  }
}
