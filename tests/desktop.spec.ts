import { effectiveCompute } from '../src/renderer/src/lib/catalog'
import { compareCpu, detectCpu } from '../src/renderer/src/lib/requirements'
import { splitUsage } from '../src/renderer/src/lib/usage'
import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { serializeTranscript } from '../src/main/export'
import { JobStore } from '../src/main/storage'

/** O seletor é Radix/shadcn; as interações exercitam o menu acessível real. */
async function choose(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option }).click()
}

/** Exportações são verificadas sem depender da disponibilidade do modelo. */
test('timestamps e exportações preservam texto e arredondamento', () => {
  const segments = [{ start: 59.9996, end: 61.2, text: 'Olá, mundo!' }]
  expect(serializeTranscript(segments, 'srt')).toContain('00:01:00,000 --> 00:01:01,200')
  expect(serializeTranscript(segments, 'vtt')).toMatch(/^WEBVTT/)
  expect(JSON.parse(serializeTranscript(segments, 'json'))).toEqual(segments)
  expect(serializeTranscript(segments, 'txt')).toBe('Olá, mundo!')
  expect(() => serializeTranscript(segments, 'exe')).toThrow()
})

test('histórico recupera segmentos de uma execução interrompida', () => {
  const directory = resolve('.cache', `storage-test-${Date.now()}`)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'jobs.json'),
    JSON.stringify([
      { id: '1', status: 'running', segments: [{ start: 0, end: 1, text: 'Preservado' }] }
    ])
  )
  const store = new JobStore(directory)
  expect(store.jobs[0].status).toBe('interrupted')
  expect(store.jobs[0].segments[0].text).toBe('Preservado')
  store.save()
  expect(JSON.parse(readFileSync(join(directory, 'history-v2.json'), 'utf8')).jobs[0].status).toBe(
    'interrupted'
  )
  expect(store.requests).toHaveLength(1)
  expect(store.requests[0].jobIds).toEqual(['1'])
  expect(readFileSync(join(directory, 'jobs.json.backup'), 'utf8')).toBe(
    readFileSync(join(directory, 'jobs.json'), 'utf8')
  )
  const restored = new JobStore(directory)
  expect(restored.requests[0].id).toBe(store.requests[0].id)
  restored.jobs[0].status = 'queued'
  restored.jobs[0].displayName = 'Nome preservado'
  restored.requests[0].title = 'Solicitação preservada'
  restored.save()
  const recovered = new JobStore(directory)
  expect(recovered.jobs[0].status).toBe('interrupted')
  expect(recovered.jobs[0].displayName).toBe('Nome preservado')
  expect(recovered.requests[0].title).toBe('Solicitação preservada')
})

test('janela Electron, core real, métricas e validação IPC', async () => {
  if (process.env.REAL_TRANSCRIPTION === '1') test.setTimeout(240000)
  const data = resolve('.cache', 'e2e-data')
  mkdirSync(data, { recursive: true })
  const env = { ...process.env, TRANSCREVEDOR_DATA_DIR: data }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.TRANSCREVEDOR_EXECUTABLE
  const app = await electron.launch({ args: executablePath ? [] : ['.'], executablePath, env })
  try {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1
    })
    app.process().stderr?.on('data', (data) => {
      if (process.env.DEBUG_E2E) process.stderr.write(data)
    })
    const page = await app.firstWindow()
    const failures: string[] = []
    page.on('pageerror', (error) => failures.push(error.message))
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
    await expect(page.getByRole('combobox', { name: 'Modelo Whisper' })).toHaveText('Base')
    await expect(page.getByRole('combobox', { name: 'Compute type' })).toHaveText('Automático')
    await expect(page.getByText('Aguardando amostra', { exact: true })).toHaveCount(0, {
      timeout: 10000
    })
    const exposed = await page.evaluate(() => ({
      node: typeof (window as unknown as { require?: unknown }).require,
      methods: Object.keys(window.api)
    }))
    expect(exposed.node).toBe('undefined')
    expect(exposed.methods).not.toContain('send')
    const rejection = await page.evaluate(async () => {
      try {
        await window.api.start('inventado', {
          model: 'tiny',
          device: 'cpu',
          computeType: 'auto',
          language: 'en',
          threads: 1,
          vad: true
        })
        return false
      } catch {
        return true
      }
    })
    expect(rejection).toBe(true)
    await page.getByRole('combobox', { name: 'Compute type' }).click()
    await expect(page.getByRole('option', { name: 'FP16 · float16' })).toBeVisible()
    const caps = await page.evaluate(
      async () => (await window.api.snapshot()).devices.find((d) => d.id === 'cpu')?.computeTypes
    )
    if (!caps?.includes('float16'))
      await expect(page.getByRole('option', { name: 'FP16 · float16' })).toHaveAttribute(
        'data-disabled',
        ''
      )
    await page.screenshot({ path: '.cache/compute-menu.png', animations: 'disabled' })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Configurações', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Atualizações do aplicativo' })).toBeVisible()
    const automatic = page.getByRole('switch', { name: /Verificar atualizações automaticamente/ })
    // O switch confirma a gravação pelo IPC antes de refletir o novo estado.
    if (await automatic.isChecked()) await automatic.click()
    await expect(automatic).not.toBeChecked()
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.updatesSnapshot()).automatic))
      .toBe(false)
    await page.getByRole('button', { name: 'Novidades', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Olá, Voztra' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'A primeira versão do Transcrevedor' })
    ).toBeVisible()
    await page.screenshot({ path: '.cache/news.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: 'Configurações', exact: true }).click()
    await expect(automatic).not.toBeChecked()
    await page.getByRole('button', { name: 'Claro', exact: true }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.screenshot({
      path: '.cache/theme-light.png',
      fullPage: true,
      animations: 'disabled'
    })
    await page.getByRole('button', { name: 'Escuro', exact: true }).click()
    await page.reload()
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.screenshot({ path: '.cache/interface.png', fullPage: true, animations: 'disabled' })
    expect(await page.locator('select:visible').count()).toBe(0)
    await page.getByRole('button', { name: 'Modelos', exact: true }).click()
    await page.getByRole('tab', { name: 'Comparar modelos' }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await page.screenshot({ path: '.cache/comparison.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: 'Transcrição', exact: true }).click()

    if (process.env.REAL_TRANSCRIPTION === '1') {
      const fixture = resolve('.cache/test-data/speech.wav')
      expect(existsSync(fixture)).toBe(true)
      const previousRequests = await page.evaluate(
        async () => (await window.api.snapshot()).requests.length
      )
      const previousCount = await page.evaluate(
        async () => (await window.api.snapshot()).jobs.length
      )
      // O diálogo é substituído no processo principal; a interação seguinte é real.
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path, path] })
      }, fixture)
      await choose(page, 'Modelo Whisper', 'Tiny')
      await choose(page, 'Idioma do áudio', 'Português')
      await page.getByRole('button', { name: 'Carregar modelo', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Descarregar modelo', exact: true })
      ).toBeVisible({ timeout: 60000 })
      await page.getByRole('button', { name: /Adicionar arquivos de áudio/ }).click()
      await page.getByRole('button', { name: /Transcrever fila/ }).click()
      // Arquivos adicionados durante a execução não entram nesta solicitação.
      await page.getByRole('button', { name: /Adicionar arquivos de áudio/ }).click()
      // Dois áudios seguidos exercitam a liberação do worker e a reutilização da carga.
      await expect
        .poll(
          async () =>
            page.evaluate(async () => {
              const jobs = (await window.api.snapshot()).jobs
              return { count: jobs.length, statuses: jobs.slice(0, 2).map((j) => j.status) }
            }),
          { timeout: 90000 }
        )
        .toEqual({ count: previousCount + 2, statuses: ['complete', 'complete'] })
      await expect(page.getByText('Transcrição concluída', { exact: true })).toBeVisible({
        timeout: 90000
      })
      const grouped = await page.evaluate(() => window.api.snapshot())
      expect(grouped.requests.length).toBe(previousRequests + 1)
      expect(grouped.requests[0].jobIds).toHaveLength(2)
      expect(grouped.jobs.slice(0, 2).every((j) => j.requestId === grouped.requests[0].id)).toBe(
        true
      )
      await expect(page.getByRole('button', { name: /Remover speech.wav/ })).toHaveCount(2)
      await page
        .getByRole('button', { name: /Remover speech.wav/ })
        .first()
        .click()
      await page
        .getByRole('button', { name: /Remover speech.wav/ })
        .first()
        .click()
      await expect(page.getByLabel('Trecho 1', { exact: true })).not.toHaveValue('')
      const transcript = await page
        .locator('.segment textarea')
        .evaluateAll((elements) => elements.map((e) => (e as HTMLTextAreaElement).value).join(' '))
      expect(transcript.toLowerCase()).toContain('teste')
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
      }, resolve('.cache/transcript.srt'))
      await page.getByRole('button', { name: 'SRT', exact: true }).click()
      await expect.poll(() => existsSync('.cache/transcript.srt')).toBe(true)
      expect(readFileSync('.cache/transcript.srt', 'utf8')).toContain('-->')
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('button', { name: /CPU.*RAM/ }).click()
      await expect(page.getByRole('region', { name: 'Recursos do sistema' })).toBeVisible()
      await expect(page.locator('.segmented-bar')).not.toHaveCount(0)
      await page.screenshot({
        path: '.cache/transcription.png',
        fullPage: true,
        animations: 'disabled'
      })
      await page.getByRole('button', { name: 'Histórico', exact: true }).click()
      await page
        .getByRole('button', {
          name: `Renomear solicitação ${grouped.requests[0].title}`,
          exact: true
        })
        .first()
        .click()
      await page.getByRole('textbox', { name: 'Novo nome' }).fill('Entrevista de teste')
      await page.getByRole('button', { name: 'Salvar nome' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page
        .getByRole('button', { name: /Entrevista de teste.*áudios/ })
        .first()
        .click()
      await page.getByRole('button', { name: 'Renomear speech.wav', exact: true }).first().click()
      await page.getByRole('textbox', { name: 'Novo nome' }).fill('Parte inicial')
      await page.getByRole('button', { name: 'Salvar nome' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      const renamed = await page.evaluate(() => window.api.snapshot())
      expect(renamed.jobs[0].displayName).toBe('Parte inicial')
      expect(renamed.jobs[0].file.name).toBe('speech.wav')
      await page.screenshot({ path: '.cache/history.png', fullPage: true, animations: 'disabled' })
      // Alternar abas preserva modelo e resultado; o benchmark só roda por ação explícita.
      await page.getByRole('button', { name: 'Modelos', exact: true }).click()
      const tiny = page.getByRole('article', { name: 'Modelo tiny', exact: true })
      await tiny.getByText('Consumo observado neste computador', { exact: true }).click()
      const benchmarkButton = tiny.getByRole('button', {
        name: 'Testar desempenho neste computador'
      })
      await benchmarkButton.click()
      // Pode existir um resultado anterior salvo: aguarda a operação nova terminar.
      await expect(benchmarkButton).toBeDisabled()
      await expect(benchmarkButton).toBeEnabled({ timeout: 90000 })
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(tiny.getByText(/Teste local:/)).toBeVisible({ timeout: 60000 })
      await tiny.getByText('Requisitos e consumo estimados', { exact: true }).click()
      await expect(tiny.getByText('CPU mínima de referência', { exact: true })).toBeVisible()
      await choose(page, 'Estimar requisitos para', 'GPU NVIDIA (CUDA)')
      await expect(tiny.getByText('VRAM mínima / recomendada', { exact: true })).toBeVisible()
      await choose(page, 'Estimar requisitos para', 'CPU')
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: '.cache/settings.png', fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: 'Transcrição', exact: true }).click()
      await expect(page.getByLabel('Trecho 1', { exact: true })).not.toHaveValue('')
      // Reimportar após esvaziar a fila deve aguardar uma nova ação explícita.
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      }, fixture)
      await page.getByRole('button', { name: /Adicionar arquivos de áudio/ }).click()
      await expect(page.getByRole('button', { name: /Transcrever fila/ })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: /Remover speech.wav/ }).click()
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
      }, resolve('.cache/test-data/long.wav'))
      await page.getByRole('button', { name: /Adicionar arquivos de áudio/ }).click()
      await page.getByRole('button', { name: /Transcrever fila/ }).click()
      await expect(page.getByRole('img', { name: 'Processamento em andamento' })).toBeVisible()
      await expect(page.getByText('Tempo decorrido', { exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: 'Áudio processado' })).toBeVisible()
      // Confirma avanço medido em uma gravação longa, antes do término da tarefa.
      const audioProgress = page.getByRole('progressbar', { name: 'Áudio processado' })
      await expect
        .poll(async () => Number(await audioProgress.getAttribute('aria-valuenow')), {
          timeout: 60000
        })
        .toBeGreaterThan(0)
      expect(Number(await audioProgress.getAttribute('aria-valuenow'))).toBeLessThan(100)
      await page
        .locator('.transcription-progress')
        .screenshot({ path: '.cache/progress-active.png' })
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0, {
        timeout: 15000
      })
      await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({
        timeout: 30000
      })
      await expect
        .poll(async () => page.evaluate(async () => (await window.api.snapshot()).jobs[0].status))
        .toBe('cancelled')
    }
    if (process.env.REAL_TRANSCRIPTION === '1') {
      const state = await page.evaluate(() => window.api.snapshot())
      if (state.loaded)
        await page.getByRole('button', { name: 'Descarregar modelo', exact: true }).click()
      await expect(page.getByText('Descarregado', { exact: true })).toBeVisible({ timeout: 30000 })
      await expect(page.getByRole('button', { name: /Transcrever fila/ })).toBeDisabled()
      await expect
        .poll(async () => page.evaluate(async () => (await window.api.snapshot()).modelState))
        .toBe('unloaded')
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650))
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      )
      .toBe(true)
    expect(failures).toEqual([])
  } finally {
    // Uma falha durante transcrição não deve deixar o diálogo nativo de saída prendendo o teste.
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1
      })
      .catch(() => {})
    await app.close()
  }
})

test('comparação de CPU preserva variantes e informa ausência de dados', () => {
  expect(detectCpu('11th Gen Intel(R) Core(TM) i3-1115G4 @ 3.00GHz')?.name).toBe(
    'Intel Core i3-1115G4'
  )
  expect(
    compareCpu('AMD Ryzen 5 7600 6-Core Processor', 'AMD Ryzen 5 3600', 'AMD Ryzen 5 5600')
  ).toBe('Acima do recomendado')
  expect(detectCpu('AMD Ryzen 5 7600X 6-Core Processor')?.name).toBe('AMD Ryzen 5 7600X')
  expect(detectCpu('AMD Ryzen 5 7600U')).toBeUndefined()
  expect(compareCpu('CPU desconhecida', 'AMD Ryzen 5 3600', 'AMD Ryzen 5 5600')).toBe(
    'Sem dados suficientes para comparar'
  )
  expect(compareCpu('Intel(R) Core(TM) i5-12400F', 'AMD Ryzen 5 3600', 'AMD Ryzen 5 5600')).toBe(
    'Atende ao recomendado'
  )
})

test('barras segmentadas não somam o app duas vezes', () => {
  expect(splitUsage(100, 70, 20)).toEqual({ app: 20, other: 50, free: 30 })
  expect(splitUsage(100, 70, null)).toEqual({ app: 0, other: 70, free: 30 })
  expect(splitUsage(100, 20, 40)).toEqual({ app: 20, other: 0, free: 80 })
  expect(splitUsage(0, 1, 1)).toEqual({ app: 0, other: 0, free: 100 })
})

test('download explícito sem áudio, carga, exclusão e bloqueio sem modelo', async () => {
  test.skip(
    process.env.TEST_DOWNLOAD !== '1',
    'Download de rede optativo (~75 MB), usa cache isolado.'
  )
  const data = resolve('.cache', `management-${process.pid}`)
  mkdirSync(data, { recursive: true })
  const env = { ...process.env, TRANSCREVEDOR_DATA_DIR: data }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.TRANSCREVEDOR_EXECUTABLE
  const app = await electron.launch({ args: executablePath ? [] : ['.'], executablePath, env })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
    await page.getByRole('button', { name: 'Modelos', exact: true }).click()
    const tiny = page.getByRole('article', { name: 'Modelo tiny', exact: true })
    await tiny.getByRole('button', { name: 'Consultar tamanho online' }).click()
    await expect(tiny.getByText(/Download consultado:/)).toBeVisible({ timeout: 30000 })
    await tiny.getByRole('button', { name: 'Baixar modelo', exact: true }).click()
    await expect(tiny.getByText('Instalado', { exact: true })).toBeVisible({ timeout: 90000 })
    expect(await page.evaluate(async () => (await window.api.snapshot()).modelState)).toBe(
      'unloaded'
    )
    await page.getByRole('button', { name: 'Transcrição', exact: true }).click()
    await choose(page, 'Modelo Whisper', 'Tiny')
    await page.getByRole('button', { name: 'Carregar modelo', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Descarregar modelo', exact: true })).toBeVisible(
      { timeout: 60000 }
    )
    await page.getByRole('button', { name: 'Ajustar modelo', exact: true }).click()
    await expect(page.getByLabel('Modelo Whisper')).toBeDisabled()
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    })
    await page.getByRole('button', { name: 'Modelos', exact: true }).click()
    await tiny.getByRole('button', { name: 'Excluir', exact: true }).click()
    await expect(tiny.getByText('Não instalado', { exact: true })).toBeVisible({ timeout: 30000 })
    expect(await page.evaluate(async () => (await window.api.snapshot()).modelState)).toBe(
      'unloaded'
    )
    const removed = await page.evaluate(async () =>
      (await window.api.snapshot()).models.find((m) => m.name === 'tiny')
    )
    expect(removed?.bytes).toBe(0)
  } finally {
    await app.close()
  }
})

test('prévia automática acompanha a ordem de preferência do motor', () => {
  expect(effectiveCompute('auto', { id: 'cpu', computeTypes: ['float32', 'int8'] })).toBe('int8')
  expect(
    effectiveCompute('float16', { id: 'cpu', computeTypes: ['float32', 'int8'] })
  ).toBeUndefined()
  expect(
    effectiveCompute('auto', { id: 'cuda:0', computeTypes: ['float32', 'int8_float16'] })
  ).toBe('int8_float16')
  expect(effectiveCompute('auto', { id: 'cuda:0', computeTypes: ['float32', 'float16'] })).toBe(
    'float16'
  )
})
