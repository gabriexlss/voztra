import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import { emptyProfile } from '../src/shared/engines'

/** Regressão da migração e dos portais nas duas aparências, sem credenciais externas. */
test('perfil legado, catálogo renovado e modais em janela mínima', async () => {
  let fetches = 0
  const server = createServer((req, res) => {
    if (req.method === 'GET') fetches++
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ models: [{ name: 'models/livre', displayName: 'Modelo livre' }] }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  const directory = resolve('.cache', `interface15-${Date.now()}`)
  mkdirSync(directory, { recursive: true })
  const profile = {
    ...emptyProfile(),
    id: 'legado',
    name: 'Gemini legado',
    provider: 'gemini',
    protocol: 'gemini-interactions',
    baseUrl: `http://127.0.0.1:${port}`,
    basePrompt: 'Meu texto preservado',
    instructionMode: undefined
  }
  const original = JSON.stringify({ version: 1, activeId: 'legado', records: [{ profile }] })
  writeFileSync(join(directory, 'engines.json'), original)
  const env = { ...process.env, TRANSCREVEDOR_DATA_DIR: directory }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.TRANSCREVEDOR_EXECUTABLE
  const app = await electron.launch({ args: executablePath ? [] : ['.'], executablePath, env })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
    expect(readFileSync(join(directory, 'engines.json.v1.backup'), 'utf8')).toBe(original)
    const migrated = (await page.evaluate(() => window.api.snapshot())).engines!.profiles[0]
    expect(migrated.basePrompt).toBe('Meu texto preservado')
    expect(migrated.instructionMode).toBe('none')
    await page.getByRole('button', { name: 'Modelos', exact: true }).click()
    await expect(page.getByRole('button', { name: /Modelo livre/ })).toBeVisible()
    const firstFetches = fetches
    await page.getByRole('button', { name: 'Histórico', exact: true }).click()
    await page.getByRole('button', { name: 'Modelos', exact: true }).click()
    await expect.poll(() => fetches).toBeGreaterThan(firstFetches)
    await expect(page.getByText('Carregar modelo', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Suporte NVIDIA opcional')).toHaveCount(0)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650))
    for (const theme of ['Escuro', 'Claro']) {
      await page.getByRole('button', { name: 'Configurações', exact: true }).click()
      await page.getByRole('button', { name: theme, exact: true }).click()
      await page.getByRole('button', { name: 'Motores', exact: true }).click()
      await page.getByRole('button', { name: 'Configurar', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const box = (await dialog.boundingBox())!
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
      await expect(dialog.getByRole('button', { name: 'Continuar em Modelos' })).toBeInViewport()
      await page.screenshot({ animations: 'disabled', path: `.cache/1.5-modal-${theme}.png` })
      await page.getByLabel('Nome da conexão', { exact: true }).fill('Rascunho não salvo')
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Descartar', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect((await page.evaluate(() => window.api.snapshot())).engines!.profiles[0].name).toBe(
        'Gemini legado'
      )
    }
    await page.getByRole('button', { name: 'GPU', exact: true }).click()
    await expect(page.getByText('Suporte NVIDIA opcional')).toBeVisible()
    await expect(page.getByText('Carregar modelo', { exact: true })).toHaveCount(0)
    expect((await page.evaluate(() => window.api.snapshot())).engines!.activeId).toBe('legado')
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {})
    await app.close().catch(() => {})
    await new Promise<void>((done) => server.close(() => done()))
  }
})
