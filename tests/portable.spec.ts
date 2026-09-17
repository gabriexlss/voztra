import { test, expect, _electron as electron } from '@playwright/test'
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
    const app = await electron.launch({
      executablePath: executable,
      args: [],
      env,
      timeout: 120000
    })
    try {
      const page = await app.firstWindow()
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
      await app.close()
    }
  }
  expect(existsSync(join(folder, 'data', 'updates.json'))).toBe(true)
})
