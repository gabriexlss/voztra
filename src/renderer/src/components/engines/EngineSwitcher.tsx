import { useState, type JSX } from 'react'
import { Popover } from 'radix-ui'
import { Cpu, ChevronDown, Check, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import type { EngineState } from '../../../../shared/engines'

/** Atalho compacto; a confirmação e o bloqueio de corrida são feitos no main. */
export function EngineSwitcher({
  state,
  busy,
  onManage
}: {
  state?: EngineState
  busy: boolean
  onManage: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const items = [{ id: 'whisper', name: 'Whisper local' }, ...(state?.profiles || [])]
  const selected = items.find((p) => p.id === state?.activeId) || items[0]
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="outline" aria-label="Trocar motor">
          <Cpu />
          <span className="max-w-40 truncate">{selected.name}</span>
          <ChevronDown />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg"
        >
          <p className="px-2 py-2 text-xs text-muted-foreground">Motor de transcrição</p>
          {items.map((item) => (
            <Button
              className="w-full justify-between"
              variant="ghost"
              key={item.id}
              disabled={busy || switching}
              onClick={async () => {
                setSwitching(true)
                try {
                  await window.api.switchEngine(item.id)
                  setOpen(false)
                } catch (e) {
                  toast.error(String(e))
                } finally {
                  setSwitching(false)
                }
              }}
            >
              <span className="truncate">{item.name}</span>
              {item.id === selected.id && <Check className="text-primary" />}
            </Button>
          ))}
          {busy && <p className="help px-2 py-2">Conclua ou cancele a operação para trocar.</p>}
          <div className="border-t mt-2 pt-2">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setOpen(false)
                onManage()
              }}
            >
              <Settings2 />
              Gerenciar motores
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
