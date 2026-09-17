/** Separa os arquivos para download dos intermediários usados para depuração e testes. */
import { mkdirSync, readdirSync, renameSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const source = `dist/work/${version}`
const target = `dist/releases/${version}`
mkdirSync(target, { recursive: true })
for (const name of readdirSync(source)) {
  if (/\.(exe|blockmap|AppImage|deb)$/.test(name) || /^latest.*\.yml$/.test(name))
    renameSync(join(source, name), join(target, name))
}
const result = spawnSync(process.execPath, ['scripts/checksums.mjs', target], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status || 1)
