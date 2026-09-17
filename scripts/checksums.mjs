/** Checksums cobrem somente os artefatos distribuíveis da versão solicitada. */
import { readdirSync, writeFileSync, createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const directory = process.argv[2]
if (!directory) throw new Error('Informe a pasta da release.')
const files = readdirSync(directory)
  .filter((name) => /\.(exe|blockmap|yml|AppImage|deb|zip)$/.test(name))
  .sort()
const lines = []
for (const name of files) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(join(directory, name))) hash.update(chunk)
  lines.push(`${hash.digest('hex')}  ${name}`)
}
writeFileSync(join(directory, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
