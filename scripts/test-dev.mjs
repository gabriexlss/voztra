/** Verifica o servidor Vite real com a ponte Electron e encerra ambos ao final. */
import { createServer } from 'vite'
import { loadConfigFromFile } from 'electron-vite'
import { _electron as electron, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' })
const server = await createServer({
  ...loaded.config.renderer,
  configFile: false,
  root: resolve('src/renderer'),
  server: { host: '127.0.0.1', port: 0 }
})
await server.listen()
const directory = resolve('.cache/dev-test')
mkdirSync(directory, { recursive: true })
const env = {
  ...process.env,
  ELECTRON_RENDERER_URL: server.resolvedUrls.local[0],
  TRANSCREVEDOR_DATA_DIR: directory
}
delete env.ELECTRON_RUN_AS_NODE
let app
try {
  app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
  await expect(page.getByRole('heading', { name: 'Nova transcrição' })).toBeVisible()
  expect(errors).toEqual([])
  console.log('Desenvolvimento Vite + React + Electron validado.')
} finally {
  if (app) await app.close()
  await server.close()
}
