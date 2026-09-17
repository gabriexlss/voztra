import { useId, type JSX } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
/** Seleção acessível com descrição; itens incompatíveis continuam visíveis e explicados. */
export function Choice({
  label,
  value,
  onChange,
  items,
  disabled = false
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  items: { value: string; label: string; description?: string; disabled?: boolean }[]
}): JSX.Element {
  const id = useId()
  return (
    <div className="space-y-2 min-w-0">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select
        value={value || '__auto'}
        onValueChange={(v) => onChange(v === '__auto' ? '' : v)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-full bg-card">
          <SelectValue>
            {items.find((item) => item.value === value)?.label || 'Aguardando dispositivo…'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start" className="max-w-[min(460px,90vw)]">
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value || '__auto'}
              disabled={item.disabled}
              className="data-[disabled]:opacity-70"
              textValue={item.label}
              aria-label={item.label}
            >
              <span className="block py-1">
                <span className="block font-medium">{item.label}</span>
                {item.description && (
                  <span className="mt-1 block max-w-96 text-xs leading-relaxed text-muted-foreground whitespace-normal">
                    {item.description}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
