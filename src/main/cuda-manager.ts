import { randomUUID } from 'node:crypto'
import { dialog, type BrowserWindow } from 'electron'
import type { Backend } from './backend'
import type { BackendEvent, Snapshot } from '../shared/types'
import type { CudaStatus } from '../shared/engines'

/** A manutenção roda sem CTranslate2 carregado, evitando DLLs bloqueadas no Windows. */
export function cudaManager(c: {
  backend: Backend
  state: Snapshot
  busy: () => boolean
  publish: () => void
  receive: (e: BackendEvent) => void
  window: () => BrowserWindow
}): (action: unknown) => Promise<CudaStatus> {
  return async (action) => {
    if (!['status', 'install', 'remove'].includes(String(action)))
      throw new Error('Ação NVIDIA inválida.')
    if (c.busy() || c.state.operation || !c.state.ready)
      throw new Error('Aguarde a operação atual.')
    if (action === 'status') return c.backend.request<CudaStatus>({ type: 'cuda-status' })
    if (process.platform !== 'win32') throw new Error('Instalação opcional disponível no Windows.')
    if (c.state.engines?.activeId !== 'whisper')
      throw new Error('Ative Whisper local para gerenciar o suporte NVIDIA.')
    const answer = await dialog.showMessageBox(c.window(), {
      type: 'question',
      buttons: [
        'Cancelar',
        action === 'install' ? 'Instalar suporte NVIDIA' : 'Remover suporte NVIDIA'
      ],
      defaultId: 0,
      cancelId: 0,
      message:
        action === 'install'
          ? 'Baixar bibliotecas NVIDIA oficiais?'
          : 'Remover as bibliotecas NVIDIA do Voztra?',
      detail:
        'O modelo será descarregado. Download aproximado: 1,25 GiB; reserve 4 GiB livres. Bibliotecas têm licença NVIDIA, disponível em docs.nvidia.com/cuda/eula e docs.nvidia.com/deeplearning/cudnn. O driver da placa continua necessário. Modelos e histórico serão preservados.'
    })
    if (answer.response !== 1) return c.backend.request<CudaStatus>({ type: 'cuda-status' })
    if (c.busy() || c.state.operation || !c.state.ready)
      throw new Error('O aplicativo ficou ocupado.')
    const id = randomUUID()
    c.state.operationId = id
    c.state.operation = 'cuda-' + action
    c.state.ready = false
    c.publish()
    try {
      await c.backend.shutdown()
      c.state.loaded = undefined
      c.state.modelState = 'unloaded'
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Motor de manutenção não iniciou.')), 30000)
        c.backend.start((e) => {
          if (e.type === 'ready') {
            clearTimeout(timer)
            resolve()
          } else if (e.type === 'fatal') {
            clearTimeout(timer)
            reject(new Error(e.message))
          } else c.receive(e)
        }, 'api')
      })
      return await c.backend.request<CudaStatus>({ type: 'cuda-' + action })
    } finally {
      // Se o cancelamento reiniciou o core, seu novo processo não deve ser encerrado aqui.
      if (c.state.operationId === id) {
        await c.backend.shutdown()
        c.state.operation = undefined
        c.state.operationId = undefined
        c.backend.start(c.receive, 'whisper')
        c.publish()
      }
    }
  }
}
