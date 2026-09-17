import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { BackendEvent } from '../shared/types'
/** Gerencia um processo isolado. stderr nunca é interpretado como protocolo. */
export class Backend {
  private process?: ChildProcessWithoutNullStreams
  private stopping = false
  private generation = 0
  private requests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  request<T>(command: object): Promise<T> {
    const requestId = randomUUID()
    return new Promise<T>((resolve, reject) => {
      this.requests.set(requestId, { resolve: (value) => resolve(value as T), reject })
      try {
        this.send({ ...command, requestId })
      } catch (error) {
        this.requests.delete(requestId)
        reject(error)
      }
    })
  }
  private rejectRequests(message: string): void {
    for (const request of this.requests.values()) request.reject(new Error(message))
    this.requests.clear()
  }
  start(onEvent: (event: BackendEvent) => void): void {
    const generation = ++this.generation
    const root = app.getAppPath()
    const executable =
      process.platform === 'win32' ? 'transcrevedor-core.exe' : 'transcrevedor-core'
    const python =
      process.env.TRANSCREVEDOR_PYTHON ||
      join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    const bundled = join(process.resourcesPath, 'core', executable)
    const cache = join(app.getPath('userData'), 'models')
    mkdirSync(cache, { recursive: true })
    const command = app.isPackaged ? bundled : python
    if (!existsSync(command)) {
      onEvent({
        type: 'fatal',
        message: 'Core Python não encontrado. Execute npm run setup:python e reinicie o aplicativo.'
      })
      return
    }
    this.stopping = false
    this.process = spawn(
      command,
      app.isPackaged ? [cache] : ['-u', join(root, 'backend/entry.py'), cache],
      {
        windowsHide: true,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' }
      }
    )
    let diagnostic = ''
    this.process.stderr.on('data', (data) => {
      diagnostic = (diagnostic + data.toString()).slice(-3000)
    })
    createInterface({ input: this.process.stdout }).on('line', (line) => {
      try {
        if (generation !== this.generation) return
        const event = JSON.parse(line) as BackendEvent
        if (event.type === 'response' && event.requestId) {
          const pending = this.requests.get(event.requestId)
          this.requests.delete(event.requestId)
          if (event.ok) pending?.resolve(event.result)
          else pending?.reject(new Error(event.message || 'Falha no core.'))
        } else onEvent(event)
      } catch {
        onEvent({ type: 'fatal', message: 'O core enviou uma mensagem inválida.' })
      }
    })
    this.process.on('error', (error) => onEvent({ type: 'fatal', message: error.message }))
    this.process.on('exit', (code) => {
      this.rejectRequests('O core encerrou.')
      if (!this.stopping)
        onEvent({ type: 'fatal', message: `O core encerrou (${code}). ${diagnostic}` })
    })
  }
  send(command: object): void {
    if (!this.process?.stdin.writable) throw new Error('Core indisponível. Reinicie o aplicativo.')
    this.process.stdin.write(JSON.stringify(command) + '\n')
  }
  stop(): void {
    this.stopping = true
    this.generation += 1
    this.rejectRequests('Operação interrompida; o modelo está descarregado.')
    this.process?.removeAllListeners('exit')
    this.process?.removeAllListeners('error')
    this.process?.kill()
  }
}
