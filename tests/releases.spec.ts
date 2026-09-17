import { test, expect } from '@playwright/test'
import { dataDirectory, ensureWritable } from '../src/main/data-paths'
import { newerVersion } from '../src/shared/updates'
import { resolve, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

test('dados instalados preservam caminho antigo e portable tem armazenamento independente', () => {
  const root = resolve('.cache/path-tests')
  expect(dataDirectory(root, {})).toBe(join(root, 'transcrevedor'))
  expect(dataDirectory(root, { PORTABLE_EXECUTABLE_DIR: join(root, 'portable') })).toBe(
    join(root, 'portable', 'data')
  )
  expect(
    dataDirectory(root, {
      PORTABLE_EXECUTABLE_DIR: root,
      TRANSCREVEDOR_DATA_DIR: join(root, 'isolated')
    })
  ).toBe(join(root, 'isolated'))
  ensureWritable(join(root, 'valid'))
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'file'), 'não é uma pasta')
  expect(() => ensureWritable(join(root, 'file'))).toThrow()
})

test('canal estável não oferece downgrade nem pré-lançamentos', () => {
  expect(newerVersion('1.3.1', '1.3.0')).toBe(true)
  expect(newerVersion('1.10.0', '1.9.0')).toBe(true)
  expect(newerVersion('1.3.0', '1.3.0')).toBe(false)
  expect(newerVersion('1.2.0', '1.3.0')).toBe(false)
  expect(newerVersion('1.4.0-beta.1', '1.3.0')).toBe(false)
  expect(newerVersion('inválida', '1.3.0')).toBe(false)
})
