import { app, net, shell } from 'electron'
import updater from 'electron-updater'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { newerVersion, type UpdateCommand, type UpdateState } from '../shared/updates'

const releasesUrl = 'https://github.com/gabriexlss/voztra/releases'

/** O main controla rede, persistência e instalação; o renderer recebe apenas estado tipado. */
export class UpdateManager {
  state: UpdateState
  private preferencesPath: string
  private actionRunning = false
  private timer?: NodeJS.Timeout
  private interval?: NodeJS.Timeout
  private readonly engine = updater.autoUpdater

  constructor(
    private emit: (state: UpdateState) => void,
    private busy: () => boolean
  ) {
    this.preferencesPath = join(app.getPath('userData'), 'updates.json')
    let automatic = true
    try {
      automatic = JSON.parse(readFileSync(this.preferencesPath, 'utf8')).automatic !== false
    } catch {
      /* Primeira execução. */
    }
    this.state = {
      version: app.getVersion(),
      dataPath: app.getPath('userData'),
      automatic,
      status: 'idle',
      mode: !app.isPackaged
        ? 'development'
        : process.env.PORTABLE_EXECUTABLE_DIR
          ? 'portable'
          : process.platform === 'win32'
            ? 'installed'
            : 'manual'
    }
    this.engine.autoDownload = false
    // Nenhuma saída normal do app deve disparar instalação durante trabalho em andamento.
    this.engine.autoInstallOnAppQuit = false
    this.engine.allowPrerelease = false
    this.engine.allowDowngrade = false
    this.engine.on('update-available', (info) =>
      this.change({ status: 'available', availableVersion: info.version })
    )
    this.engine.on('update-not-available', () =>
      this.change({ status: 'current', availableVersion: undefined })
    )
    this.engine.on('download-progress', (info) =>
      this.change({ status: 'downloading', percent: info.percent })
    )
    this.engine.on('update-downloaded', (info) =>
      this.change({ status: 'downloaded', availableVersion: info.version, percent: 100 })
    )
    this.engine.on('error', (error) => this.change({ status: 'error', message: error.message }))
  }

  private change(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.state)
  }

  start(): void {
    const check = (): void => {
      if (
        this.state.automatic &&
        this.state.mode !== 'development' &&
        !process.env.TRANSCREVEDOR_DATA_DIR &&
        !this.busy()
      )
        void this.command('check').catch(() => {
          /* Estado de erro já enviado à interface. */
        })
    }
    this.timer = setTimeout(check, 10000)
    this.interval = setInterval(check, 6 * 60 * 60 * 1000)
    this.timer.unref()
    this.interval.unref()
  }

  stop(): void {
    clearTimeout(this.timer)
    clearInterval(this.interval)
  }

  setAutomatic(value: unknown): UpdateState {
    if (typeof value !== 'boolean') throw new Error('Preferência inválida.')
    writeFileSync(this.preferencesPath + '.tmp', JSON.stringify({ automatic: value }))
    renameSync(this.preferencesPath + '.tmp', this.preferencesPath)
    this.change({ automatic: value })
    return this.state
  }

  async command(command: UpdateCommand): Promise<UpdateState> {
    if (!['check', 'download', 'install', 'release'].includes(command))
      throw new Error('Ação inválida.')
    if (command === 'release') {
      await shell.openExternal(releasesUrl)
      return this.state
    }
    if (this.actionRunning || this.state.status === 'installing')
      throw new Error('Aguarde a operação de atualização.')
    if (command === 'check' && this.state.status === 'downloaded') return this.state
    if (command === 'install') {
      if (this.state.mode !== 'installed' || this.state.status !== 'downloaded')
        throw new Error('Nenhuma atualização pronta para instalar.')
      if (this.busy())
        throw new Error('Conclua ou cancele a fila e as operações do modelo antes de reiniciar.')
      this.change({ status: 'installing', message: undefined })
      this.engine.quitAndInstall(false, true)
      return this.state
    }
    this.actionRunning = true
    try {
      if (command === 'download') {
        if (this.state.status !== 'available' || this.state.mode !== 'installed')
          throw new Error('Consulte uma atualização instalável primeiro.')
        this.change({ status: 'downloading', percent: 0, message: undefined })
        await this.engine.downloadUpdate()
      } else {
        this.change({
          status: 'checking',
          message: undefined,
          percent: undefined,
          checkedAt: new Date().toISOString()
        })
        if (this.state.mode === 'installed') await this.engine.checkForUpdates()
        else {
          // Portable não usa a instalação NSIS. Consulta o mesmo canal e oferece download manual.
          const response = await net.fetch(
            'https://api.github.com/repos/gabriexlss/voztra/releases/latest',
            {
              headers: { Accept: 'application/vnd.github+json' },
              signal: AbortSignal.timeout(20000)
            }
          )
          if (response.status === 404) throw new Error('Nenhuma versão pública disponível ainda.')
          if (!response.ok)
            throw new Error(`GitHub indisponível (${response.status}). Tente novamente mais tarde.`)
          const release = (await response.json()) as { tag_name?: string }
          const version = String(release.tag_name || '').replace(/^v/, '')
          if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Versão publicada inválida.')
          this.change({
            status: newerVersion(version, this.state.version) ? 'available' : 'current',
            availableVersion: version
          })
        }
      }
    } catch (error) {
      this.change({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      this.actionRunning = false
    }
    return this.state
  }
}
