import { test, expect, _electron as electron } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { emptyProfile } from '../src/shared/engines'

/** Captura Chromium real com dispositivo sintético; só o provedor é simulado. */
test('microfone Live finaliza áudio, preserva navegação e libera captura', async () => {
  const python = resolve(
    '.venv',
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  )
  const server = spawn(python, ['-u', 'tests/fixtures/live_server.py'], { windowsHide: true })
  let frames = 0
  const lines = createInterface({ input: server.stdout })
  const port = await new Promise<number>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Servidor Live não iniciou.')), 15000)
    server.once('error', reject)
    lines.on('line', (line) => {
      if (line === 'audio') frames++
      else if (/^\d+$/.test(line)) {
        clearTimeout(timer)
        done(Number(line))
      }
    })
  })
  const env = { ...process.env, TRANSCREVEDOR_DATA_DIR: resolve('.cache', `mic-${Date.now()}`) }
  delete env.ELECTRON_RUN_AS_NODE
  const executablePath = process.env.TRANSCREVEDOR_EXECUTABLE
  const app = await electron.launch({
    executablePath,
    env,
    args: [
      ...(executablePath ? [] : ['.']),
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream'
    ]
  })
  try {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
      dialog.showMessageBoxSync = () => 1
    })
    const page = await app.firstWindow()
    await expect(page.getByText('Motor conectado', { exact: true })).toBeVisible({ timeout: 60000 })
    const profile = {
      ...emptyProfile(),
      name: 'Live local',
      protocol: 'openai-live' as const,
      provider: 'custom' as const,
      model: 'modelo-livre',
      baseUrl: `http://127.0.0.1:${port}`,
      liveUrl: `ws://127.0.0.1:${port}`
    }
    await page.evaluate(async (profile) => {
      const saved = await window.api.saveEngine(profile, '', false)
      await window.api.switchEngine(saved.id)
    }, profile)
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.snapshot()).ready), {
        timeout: 30000
      })
      .toBe(true)
    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints)
        ;(window as unknown as { testStream: MediaStream }).testStream = stream
        return stream
      }
    })
    await page.getByRole('button', { name: 'Iniciar microfone' }).click()
    await expect.poll(() => frames, { timeout: 30000 }).toBeGreaterThan(5)
    await page.getByRole('button', { name: 'Motores', exact: true }).click()
    expect(await page.evaluate(async () => !!(await window.api.snapshot()).activeJobId)).toBe(true)
    await page.getByRole('button', { name: 'Transcrição', exact: true }).click()
    await page.getByRole('button', { name: 'Finalizar gravação' }).click()
    await expect
      .poll(async () => page.evaluate(async () => (await window.api.snapshot()).jobs[0].status), {
        timeout: 30000
      })
      .toBe('complete')
    const job = (await page.evaluate(() => window.api.snapshot())).jobs[0]
    expect(job.microphone).toBe(true)
    expect(job.segments[0].text).toContain('Microfone recebido')
    expect(
      await page.evaluate(() =>
        (window as unknown as { testStream: MediaStream }).testStream
          .getTracks()
          .every((t) => t.readyState === 'ended')
      )
    ).toBe(true)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally {
    await app.close()
    lines.close()
    server.kill()
  }
})
