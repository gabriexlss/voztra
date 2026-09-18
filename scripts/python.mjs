/** Executa ferramentas Python com caminhos portáveis e propaga falhas ao npm. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const windows = process.platform === 'win32'
const python = resolve('.venv', windows ? 'Scripts/python.exe' : 'bin/python')
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', windowsHide: true })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
const action = process.argv[2]
if (action === 'setup') {
  if (!existsSync(python))
    run(process.env.TRANSCREVEDOR_PYTHON || (windows ? 'python' : 'python3'), [
      '-m',
      'venv',
      '.venv'
    ])
  run(python, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt'])
} else if (action === 'test') {
  run(python, ['-m', 'compileall', '-q', 'backend'])
  run(python, ['-m', 'unittest', 'discover', '-s', 'backend/tests', '-v'])
} else if (action === 'build') {
  if (windows && process.env.VOZTRA_BUNDLE_CUDA === '1') run(python, ['scripts/prepare-cuda.py'])
  run(python, [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--onedir',
    '--name',
    'transcrevedor-core',
    '--distpath',
    'release/core',
    '--workpath',
    'release/work',
    '--specpath',
    'release',
    '--paths',
    'backend',
    '--add-data',
    `${resolve('backend/transcrevedor/assets')}:transcrevedor/assets`,
    '--collect-all',
    'faster_whisper',
    '--collect-all',
    'ctranslate2',
    '--collect-all',
    'av',
    '--collect-all',
    'onnxruntime',
    '--collect-all',
    'tokenizers',
    '--collect-all',
    'huggingface_hub',
    '--collect-all',
    'websockets',
    '--collect-all',
    'httpx',
    'backend/entry.py'
  ])
  if (windows && process.env.VOZTRA_BUNDLE_CUDA === '1')
    run(python, ['scripts/prepare-cuda.py', '--copy'])
} else {
  console.error('Use setup, test ou build.')
  process.exit(1)
}
