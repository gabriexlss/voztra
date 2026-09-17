import { defineConfig } from '@playwright/test'
/** Testes abrem a distribuição local em uma pasta de dados exclusiva. */
export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  workers: 1,
  use: { trace: 'retain-on-failure' },
  reporter: 'list'
})
