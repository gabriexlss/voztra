import { test, expect, _electron as electron } from '@playwright/test'
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'

test('atualizador baixa pacote real, preserva fila e só instala por ação explícita', async () => {
  test.skip(process.env.TEST_UPDATER !== '1', 'Requer distribuição e instalador reais.')
  test.setTimeout(300000)
  const directory = resolve('dist/releases/1.3.0')
  const server = createServer((request, response) => {
    const name = basename(new URL(request.url!, 'http://localhost').pathname)
    const path = join(directory, name)
    if (
      ![
        'latest.yml',
        'Voztra-1.3.0-win-x64-setup.exe',
        'Voztra-1.3.0-win-x64-setup.exe.blockmap'
      ].includes(name) ||
      !existsSync(path)
    ) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Length': statSync(path).size })
    createReadStream(path).pipe(response)
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const env = {
    ...process.env,
    TRANSCREVEDOR_DATA_DIR: resolve('.cache/e2e-data'),
    LOCALAPPDATA: resolve('.cache/update-download')
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: resolve('dist/work/1.3.0/win-unpacked/voztra.exe'),
    args: [],
    env
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 90000 })
    // Somente o teste altera a versão corrente e a origem; não há IPC de feed no produto.
    await app.evaluate((_electron, feed) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const engine = require('electron-updater').autoUpdater
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      engine.currentVersion = new (require('semver').SemVer)('1.2.99')
      engine.setFeedURL({ provider: 'generic', url: feed })
      engine.disableDifferentialDownload = true
      engine.quitAndInstall = (): void => {
        process.env.VOZTRA_TEST_INSTALL_CALLED = '1'
      }
    }, `http://127.0.0.1:${port}`)
    expect((await page.evaluate(() => window.api.updateCommand('check'))).status).toBe('available')
    expect((await page.evaluate(() => window.api.updateCommand('download'))).status).toBe(
      'downloaded'
    )
    expect(await app.evaluate(() => process.env.VOZTRA_TEST_INSTALL_CALLED)).toBeUndefined()

    const options = {
      model: 'tiny',
      device: 'cpu',
      computeType: 'auto',
      threads: 1,
      language: 'pt',
      vad: true
    }
    await page.evaluate((options) => window.api.modelAction('load', 'tiny', options), options)
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.snapshot()).modelState), {
        timeout: 60000
      })
      .toBe('loaded')
    const paths = await page.evaluate(
      (path) => window.api.importPaths([path]),
      resolve('.cache/test-data/long.wav')
    )
    await page.evaluate(({ ids, options }) => window.api.startRequest(ids, options), {
      ids: paths.map((file) => file.id),
      options
    })
    const error = await page.evaluate(async () => {
      try {
        await window.api.updateCommand('install')
        return ''
      } catch (error) {
        return String(error)
      }
    })
    expect(error).toContain('Conclua ou cancele')
    expect(await app.evaluate(() => process.env.VOZTRA_TEST_INSTALL_CALLED)).toBeUndefined()
    await page.evaluate(() => window.api.cancel())
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const state = await window.api.snapshot()
            return !!state.activeJobId || !!state.operation
          }),
        { timeout: 30000 }
      )
      .toBe(false)
    expect((await page.evaluate(() => window.api.updateCommand('install'))).status).toBe(
      'installing'
    )
    expect(await app.evaluate(() => process.env.VOZTRA_TEST_INSTALL_CALLED)).toBe('1')
  } finally {
    await app.close()
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done()))
    )
  }
})
