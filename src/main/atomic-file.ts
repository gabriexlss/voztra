import { writeFileSync, renameSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

/** Mantém o destino íntegro e tolera bloqueios transitórios de arquivos no Windows. */
export function writeAtomic(path: string, content: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, content, 'utf8')
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(temporary, path)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (
          process.platform !== 'win32' ||
          !['EPERM', 'EACCES', 'EBUSY'].includes(code || '') ||
          attempt >= 10
        )
          throw error
        // Espera limitada a um segundo no caso excepcional; nunca remove o destino.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
      }
    }
  } finally {
    rmSync(temporary, { force: true })
  }
}
