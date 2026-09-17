import type { JSX } from 'react'
import type { Options } from '../../../shared/types'
import { Choice } from './Choice'
import { Switch } from './ui/switch'
/** Opções de transcrição independem da precisão do modelo carregado. */
export function SettingsPanel({
  options,
  disabled,
  onChange
}: {
  options: Options
  disabled: boolean
  onChange: (options: Options) => void
}): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-6 border-t pt-5 mt-5">
      <Choice
        label="Idioma do áudio"
        value={options.language}
        disabled={disabled}
        onChange={(language) => onChange({ ...options, language })}
        items={[
          ['', 'Detectar automaticamente'],
          ['pt', 'Português'],
          ['en', 'Inglês'],
          ['es', 'Espanhol'],
          ['fr', 'Francês'],
          ['de', 'Alemão'],
          ['it', 'Italiano'],
          ['ja', 'Japonês'],
          ['zh', 'Chinês']
        ].map(([value, label]) => ({ value, label }))}
      />
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="vad" className="text-sm">
          Ignorar silêncio
          <span className="block text-xs text-muted-foreground mt-1">
            Detecta trechos de fala (VAD).
          </span>
        </label>
        <Switch
          id="vad"
          checked={options.vad}
          disabled={disabled}
          onCheckedChange={(vad) => onChange({ ...options, vad })}
        />
      </div>
    </div>
  )
}
