import { join, resolve } from 'node:path'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'

/** A identidade visual muda; o caminho instalado permanece compatível com a versão antiga. */
export function dataDirectory(appData: string, env: NodeJS.ProcessEnv): string {
  if (env.TRANSCREVEDOR_DATA_DIR) return resolve(env.TRANSCREVEDOR_DATA_DIR)
  if (env.PORTABLE_EXECUTABLE_DIR) return join(env.PORTABLE_EXECUTABLE_DIR, 'data')
  return join(appData, 'transcrevedor')
}

/** Falha explícita em mídia somente leitura evita salvar dados fora do portable sem avisar. */
export function ensureWritable(directory: string): void {
  mkdirSync(directory, { recursive: true })
  const probe = join(directory, `.voztra-write-${process.pid}`)
  writeFileSync(probe, '', { flag: 'wx' })
  unlinkSync(probe)
}
