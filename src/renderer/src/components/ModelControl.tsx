import { useState, type JSX } from 'react'
import { Box, ChevronDown, LoaderCircle, Power, Settings2 } from 'lucide-react'
import type { Options, Snapshot, ModelAction, Metrics } from '../../../shared/types'
import { Choice } from './Choice'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { computeInfo, modelInfo } from '../lib/catalog'
import { MemoryPreview } from './MemoryPreview'
/** Alterar seletores não inicia download ou carregamento; o botão Carregar é obrigatório. */
export function ModelControl({
  system,
  options,
  running,
  metrics,
  compact = false,
  onChange,
  onAction,
  onSettings,
  onConfigure
}: {
  system: Snapshot
  compact?: boolean
  options: Options
  running: boolean
  metrics?: Metrics
  onChange: (options: Options) => void
  onAction: (action: ModelAction, name?: string) => Promise<void>
  onSettings: () => void
  onConfigure: () => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const locked = system.modelState !== 'unloaded' || !!system.operation || running || !system.ready
  const device = system.devices.find((d) => d.id === options.device)
  const installed = system.models.find((m) => m.name === options.model)?.installed
  const update = (value: Partial<Options>): void => onChange({ ...options, ...value })
  const loading = ['loading', 'unloading'].includes(system.modelState) || !system.ready
  const labels = {
    unloaded: 'Descarregado',
    loading: 'Carregando…',
    loaded: running ? 'Em uso' : 'Pronto',
    unloading: 'Descarregando…'
  }
  return (
    <section className="panel" aria-label="Modelo ativo">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-lg border p-2.5">
          {loading ? (
            <LoaderCircle className="size-5 animate-spin text-primary" />
          ) : (
            <Box className="size-5 text-primary" />
          )}
        </div>
        <div className="mr-auto">
          <p className="text-xs text-muted-foreground">Modelo ativo</p>
          <h2 className="font-semibold">
            {system.loaded
              ? modelInfo[system.loaded.model]?.title
              : 'Carregue um modelo para começar'}
          </h2>
        </div>
        <Badge variant="secondary">
          {!system.ready ? 'Iniciando motor…' : labels[system.modelState]}
        </Badge>
        {system.modelState === 'loaded' ? (
          <Button
            variant="outline"
            disabled={running || !!system.operation}
            onClick={() => onAction('unload')}
          >
            <Power />
            Descarregar modelo
          </Button>
        ) : (
          <Button
            disabled={!installed || locked}
            onClick={async () => {
              await onAction('load')
              setExpanded(false)
            }}
          >
            <Power />
            Carregar modelo
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ajustar modelo"
          aria-expanded={expanded && !compact}
          onClick={() => (compact ? onConfigure() : setExpanded(!expanded))}
        >
          <ChevronDown className={expanded && !compact ? 'rotate-180' : ''} />
        </Button>
      </div>
      {expanded && !compact && (
        <div className="mt-5 space-y-4 animate-in fade-in-0 duration-150">
          <div className="grid grid-cols-2 min-[1100px]:grid-cols-[1fr_1.2fr_1fr_110px] gap-4">
            <Choice
              label="Modelo Whisper"
              value={options.model}
              disabled={locked}
              onChange={(model) => update({ model })}
              items={Object.entries(modelInfo).map(([value, m]) => ({
                value,
                label: m.title,
                description: system.models.find((s) => s.name === value)?.installed
                  ? 'Instalado no computador'
                  : 'Baixe primeiro na biblioteca'
              }))}
            />
            <Choice
              label="Dispositivo"
              value={options.device}
              disabled={locked}
              onChange={(value) => update({ device: value, computeType: 'auto' })}
              items={system.devices.map((d) => ({
                value: d.id,
                label: d.id === 'cpu' ? 'CPU' : d.name,
                description: d.name
              }))}
            />
            <Choice
              label="Compute type"
              value={options.computeType}
              disabled={locked}
              onChange={(computeType) => update({ computeType })}
              items={computeInfo.map((c) => ({
                ...c,
                label: `${c.label}${c.value === 'auto' ? '' : ` · ${c.value}`}`,
                disabled: c.value !== 'auto' && !device?.computeTypes.includes(c.value),
                description: `${c.description}${c.value !== 'auto' && !device?.computeTypes.includes(c.value) ? ' Indisponível neste dispositivo pelo motor atual.' : ''}`
              }))}
            />
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium" htmlFor="threads">
                Threads de CPU
              </label>
              <Input
                id="threads"
                type="number"
                min={1}
                max={system.threads}
                value={options.threads}
                disabled={locked}
                onChange={(e) => update({ threads: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="help">
            {computeInfo.find((c) => c.value === options.computeType)?.description}
          </p>
          <MemoryPreview system={system} options={options} metrics={metrics} />
          <div className="flex items-center justify-between gap-4">
            <p className="help">
              {system.loaded
                ? `Precisão efetiva: ${system.loaded.computeType}. O modelo permanece na memória após transcrever.`
                : 'Baixar ocupa disco. Carregar prepara a RAM/VRAM, sempre manualmente.'}
            </p>
            <Button variant="ghost" size="sm" onClick={onSettings}>
              <Settings2 />
              Gerenciar modelos
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
