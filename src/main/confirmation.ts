import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AskConfirmation } from '../shared/confirmation'

/** Mantém a decisão no main e apresenta somente sua UI no portal React. */
export function confirmations(window: () => BrowserWindow | null): {
  ask: AskConfirmation
  answer: (id: unknown, accepted: unknown) => void
} {
  let pending: { id: string; resolve: (value: boolean) => void } | undefined
  const answer = (id: unknown, accepted: unknown): void => {
    if (pending?.id !== id) return
    const current = pending!
    pending = undefined
    current.resolve(accepted === true)
  }
  return {
    answer,
    ask: (input) => {
      const target = window()
      if (!target || target.isDestroyed() || pending) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        const id = randomUUID()
        const closed = (): void => answer(id, false)
        pending = {
          id,
          resolve: (value) => {
            target.removeListener('closed', closed)
            resolve(value)
          }
        }
        target.once('closed', closed)
        target.webContents.send('confirmation:event', { ...input, id })
      })
    }
  }
}
