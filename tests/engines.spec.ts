import { test, expect, _electron as electron } from '@playwright/test'
import { createServer } from 'node:http'
import { resolve, join } from 'node:path'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import { emptyProfile } from '../src/shared/engines'

/** Rede real em loopback: preserva CPU/Whisper e testa o caminho renderer/main/Python. */
test('motores, JSON, chave, fila e troca exclusiva com servidor local', async () => {
  const calls: string[] = []
  let delay = false
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ data: [{ id: 'texto-apenas' }, { id: 'modelo-novo' }] }))
      return
    }
    let body = ''
    for await (const chunk of req) body += chunk
    calls.push(body)
    if (delay) await new Promise((resolve) => setTimeout(resolve, 1500))
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ text: 'Transcrição pelo servidor local.', usage: { seconds: 1 } }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const directory = resolve('.cache', `engines-${Date.now()}`)
  mkdirSync(directory, { recursive: true })
  const env = { ...process.env, TRANSCREVEDOR_DATA_DIR: directory }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.TRANSCREVEDOR_EXECUTABLE
  const app = await electron.launch({ args: executablePath ? [] : ['.'], executablePath, env })
  try {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
      dialog.showMessageBoxSync = () => 1
    })
    const page = await app.firstWindow()
    const errors: string[] = []
    const diagnostics: string[] = []
    app.process().stderr?.on('data', (data) => diagnostics.push(String(data)))
    page.on('pageerror', (e) => errors.push(e.message))
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
    await page.evaluate(() => {
      ;(window as unknown as { coreErrors: string[] }).coreErrors = []
      window.api.onEvent((event) => {
        if (event.type === 'fatal')
          (window as unknown as { coreErrors: string[] }).coreErrors.push(event.message || '')
      })
    })
    await page.getByRole('button', { name: 'Motores', exact: true }).click()
    await page.getByRole('button', { name: 'Adicionar conexão' }).click()
    await page.getByLabel('Nome da conexão', { exact: true }).fill('Servidor de teste')
    await page.getByLabel('URL base HTTP', { exact: true }).fill(`http://127.0.0.1:${port}/v1`)
    await page.getByLabel('Chave de API', { exact: true }).fill('secret-e2e-session')
    await page.getByRole('button', { name: 'Editar opções avançadas' }).click()
    await page
      .getByLabel('Parâmetros JSON', { exact: true })
      .fill('{"temperature":0.6,"custom_parameter":"ok"}')
    await page.screenshot({ animations: 'disabled', path: '.cache/1.5-connection-dialog.png' })
    await page.getByRole('button', { name: 'Continuar em Modelos' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.screenshot({ animations: 'disabled', path: '.cache/1.5-switch-dialog.png' })
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Trocar motor', exact: true })
      .click()
    await expect
      .poll(async () =>
        page.evaluate(async () => (await window.api.snapshot()).engines?.profiles.length)
      )
      .toBe(1)
    const profile = (await page.evaluate(() => window.api.snapshot())).engines!.profiles[0]
    expect(readFileSync(join(directory, 'engines.json'), 'utf8')).not.toContain(
      'secret-e2e-session'
    )
    expect(JSON.stringify(profile)).not.toContain('secret-e2e-session')
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const s = await window.api.snapshot()
            return { ready: s.ready, error: s.error }
          }),
        { timeout: 60000 }
      )
      .toEqual({ ready: true, error: undefined })
    const snapshot = await page.evaluate(() => window.api.snapshot())
    expect(snapshot.loaded).toBeUndefined()
    expect(snapshot.engines?.activeId).toBe(profile.id)
    await expect(page.getByRole('heading', { name: 'Modelos do provedor' })).toBeVisible()
    await expect(page.getByRole('button', { name: /texto-apenas/ })).toBeVisible()
    expect(
      existsSync(join(directory, 'engines.json')) &&
        readFileSync(join(directory, 'engines.json'), 'utf8').includes('Servidor de teste')
    ).toBe(false)
    await page.getByRole('button', { name: /modelo-novo/ }).click()
    await page.getByRole('button', { name: 'Testar com áudio', exact: true }).click()
    await expect(page.getByText('Último teste concluído')).toBeVisible({ timeout: 30000 })
    await page.screenshot({ animations: 'disabled', path: '.cache/1.5-remote-models.png', fullPage: true })
    expect(
      calls.some((body) => body.includes('custom_parameter') && body.includes('0.6'))
    ).toBeTruthy()
    await expect(page.getByText('Suporte NVIDIA opcional')).toHaveCount(0)
    await expect(page.getByText('Carregar modelo', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Salvar conexão', exact: true }).click()
    await expect(page.getByText('Conexão salva', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'GPU', exact: true }).click()
    await expect(page.getByText('Suporte NVIDIA opcional')).toBeVisible()
    expect((await page.evaluate(() => window.api.snapshot())).engines?.activeId).toBe(profile.id)
    delay = true
    const fixture = resolve('backend/transcrevedor/assets/benchmark.wav')
    const files = await page.evaluate((path) => window.api.importPaths([path]), fixture)
    await page.evaluate(
      async ({ ids }) =>
        window.api.startRequest(ids, {
          model: 'ignored',
          device: 'cpu',
          computeType: 'auto',
          threads: 1,
          vad: true,
          language: 'pt'
        }),
      { ids: files.map((f) => f.id) }
    )
    const switchError = await page.evaluate(async () => {
      try {
        await window.api.switchEngine('whisper')
        return ''
      } catch (e) {
        return String(e)
      }
    })
    expect(switchError).toContain('Conclua ou cancele')
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.snapshot()).jobs[0].status), {
        timeout: 60000
      })
      .toBe('complete')
    const job = (await page.evaluate(() => window.api.snapshot())).jobs[0]
    expect(job.engine?.model).toBe('modelo-novo')
    expect(job.segments[0].timing).toBe('approximate')
    expect(readFileSync(join(directory, 'history/history-v2.json'), 'utf8')).not.toContain(
      'secret-e2e-session'
    )
    const switching = page.evaluate(() => window.api.switchEngine('whisper'))
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Trocar motor', exact: true })
      .click()
    await switching
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const s = await window.api.snapshot()
            return { ready: s.ready, error: s.error }
          }),
        { timeout: 60000 }
      )
      .toEqual({ ready: true, error: undefined })
    expect((await page.evaluate(() => window.api.snapshot())).modelState).toBe('unloaded')
    await page.screenshot({ path: '.cache/engines.png', fullPage: true })
    expect(errors).toEqual([])
    expect(
      await page.evaluate(() => (window as unknown as { coreErrors: string[] }).coreErrors),
      diagnostics.join('')
    ).toEqual([])
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {})
    await app.close().catch(() => {})
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('perfil de fábrica não fixa um modelo nem um tier', () => {
  const p = emptyProfile()
  expect(p.model).toBe('')
  expect(p.advanced).toEqual({})
})
