/** Compara o ASAR distribuído com a saída atual e exige bytecode no processo principal. */
import { extractFile } from '@electron/asar'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
const directory = process.argv[2]
if (!directory) throw new Error('Informe a pasta do aplicativo empacotado.')
const archive = `${directory}/resources/app.asar`
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
if (!existsSync('out/main/index.jsc')) throw new Error('Bytecode principal ausente.')
for (const file of files('out')) {
  const key = relative('.', file)
  if (hash(readFileSync(file)) !== hash(extractFile(archive, key)))
    throw new Error(`Build divergente: ${key}`)
}
const built = JSON.parse(extractFile(archive, 'package.json').toString())
const current = JSON.parse(readFileSync('package.json', 'utf8'))
for (const key of ['name', 'version', 'description', 'main'])
  if (built[key] !== current[key]) throw new Error(`Metadado divergente: ${key}`)
for (const name of ['benchmark.wav', 'cuda-packages.json']) {
  const asset = `transcrevedor/assets/${name}`
  if (
    hash(readFileSync(`backend/${asset}`)) !==
    hash(readFileSync(`${directory}/resources/core/_internal/${asset}`))
  )
    throw new Error(`Asset divergente: ${name}`)
}
console.log(
  'ASAR, bytecode, preload, renderer, metadados e assets do core verificados por SHA-256.'
)
