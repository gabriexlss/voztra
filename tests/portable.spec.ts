import { test, expect, chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

test('portable real mantém dados e preferências ao reabrir', async () => {
  test.skip(!process.env.TEST_PORTABLE, 'Requer o executável portable já empacotado.')
  test.setTimeout(300000)
  const folder = resolve('.cache/portable smoke')
  mkdirSync(folder, { recursive: true })
  const executable = join(folder, 'Voztra.exe')
  copyFileSync(process.env.TEST_PORTABLE!, executable)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.TRANSCREVEDOR_DATA_DIR
  for (let attempt = 0; attempt < 2; attempt++) {
    // O launcher NSIS não encaminha stderr ao Playwright: conectamos ao Chromium por porta local.
    const reservation = createServer()
    await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done))
    const port = (reservation.address() as { port: number }).port
    await new Promise<void>((done) => reservation.close(() => done()))
    const child = spawn(executable, [`--remote-debugging-port=${port}`], {
      env,
      stdio: 'ignore',
      windowsHide: true
    })
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok
          } catch {
            return false
          }
        },
        { timeout: 120000 }
      )
      .toBe(true)
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    const page = browser.contexts()[0].pages()[0]
    try {
      await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({
        timeout: 90000
      })
      const info = await page.evaluate(() => window.api.updatesSnapshot())
      expect(info.mode).toBe('portable')
      expect(info.dataPath).toBe(join(folder, 'data'))
      if (attempt === 0) {
        await page.getByRole('button', { name: 'Configurações', exact: true }).click()
        await page.getByRole('button', { name: 'Claro', exact: true }).click()
        await page.evaluate(() => window.api.setAutomaticUpdates(false))
        await page.screenshot({ path: '.cache/portable.png', fullPage: true })
      } else {
        expect(info.automatic).toBe(false)
        await expect(page.locator('html')).not.toHaveClass(/dark/)
      }
    } finally {
      await page.evaluate(() => window.close()).catch(() => {})
      await browser.close()
      await exited
    }
  }
  expect(existsSync(join(folder, 'data', 'updates.json'))).toBe(true)
})
