import { test, expect, _electron as electron } from '@playwright/test'
import { mkdirSync, linkSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'

/** Usa os wheels já verificados no cache: testa as DLLs reais sem repetir o download. */
test('instalação NVIDIA opcional reinicia o core e permite remover DLLs reais', async () => {
  test.skip(
    process.platform !== 'win32' || process.env.TEST_CUDA_RUNTIME !== '1',
    'Teste opcional com redistribuíveis NVIDIA em cache (~1,25 GiB).'
  )
  test.setTimeout(600000)
  const packages = JSON.parse(
    readFileSync('backend/transcrevedor/assets/cuda-packages.json', 'utf8')
  ) as { name: string; version: string }[]
  const directory = resolve('.cache', `cuda-e2e-${Date.now()}`)
  const staging = join(directory, 'cuda.staging')
  mkdirSync(staging, { recursive: true })
  for (const p of packages) {
    const name = `${p.name.replaceAll('-', '_')}-${p.version}-py3-none-win_amd64.whl`
    linkSync(resolve('.cache/cuda-wheels', name), join(staging, name))
  }
  mkdirSync(join(directory, 'models'))
  writeFileSync(join(directory, 'models/keep.txt'), 'preservar')
  const env = { ...process.env, TRANSCREVEDOR_DATA_DIR: directory }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.TRANSCREVEDOR_EXECUTABLE
  const app = await electron.launch({ args: executablePath ? [] : ['.'], executablePath, env })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
    await page.getByRole('button', { name: 'GPU', exact: true }).click()
    await page.getByRole('button', { name: 'Instalar suporte NVIDIA', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Instalar', exact: true })
      .click()
    await expect(page.getByText('Instalando suporte NVIDIA', { exact: false })).toBeVisible()
    await expect(page.getByText(/Instalado · .* GiB no disco/)).toBeVisible({ timeout: 480000 })
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.snapshot()).ready), {
        timeout: 30000
      })
      .toBe(true)
    expect((await page.evaluate(() => window.api.cudaAction('status'))).installed).toBe(true)
    expect(existsSync(join(directory, 'cuda/cublas64_12.dll'))).toBe(true)
    await page.getByRole('button', { name: 'Remover bibliotecas', exact: true }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Remover', exact: true })
      .click()
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.snapshot()).ready), {
        timeout: 30000
      })
      .toBe(true)
    await expect.poll(() => existsSync(join(directory, 'cuda')), { timeout: 30000 }).toBe(false)
    expect(existsSync(join(directory, 'models/keep.txt'))).toBe(true)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy()))
      .catch(() => {})
    await app.close().catch(() => {})
    // Pasta exclusiva criada por este teste: falhas não deixam gigabytes de DLLs.
    rmSync(join(directory, 'cuda'), { recursive: true, force: true })
  }
})
