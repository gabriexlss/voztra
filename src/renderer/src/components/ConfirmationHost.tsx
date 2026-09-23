import { useEffect, useState, type JSX } from 'react'
import { AlertDialog } from 'radix-ui'
import { Button } from './ui/button'
import type { Confirmation } from '../../../shared/confirmation'

/** AlertDialog shadcn/Radix: portal central, foco contido e cancelamento por teclado. */
export function ConfirmationHost(): JSX.Element {
  const [request, setRequest] = useState<Confirmation>()
  useEffect(() => window.api.onConfirmation(setRequest), [])
  const answer = (accepted: boolean): void => {
    if (!request) return
    void window.api.answerConfirmation(request.id, accepted)
    setRequest(undefined)
  }
  return (
    <AlertDialog.Root
      open={!!request}
      onOpenChange={(open) => {
        if (!open) answer(false)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[70] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 shadow-xl space-y-4">
          <AlertDialog.Title className="text-lg font-semibold">{request?.title}</AlertDialog.Title>
          <AlertDialog.Description className="text-sm text-muted-foreground leading-relaxed">
            {request?.description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-2 pt-2">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" onClick={() => answer(false)}>
                Cancelar
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={() => answer(true)}>{request?.action}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
