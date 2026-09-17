import type { JSX } from 'react'
import { MemoryStick, Info } from 'lucide-react'
import type { Options, Snapshot, Metrics } from '../../../shared/types'
import { estimate } from '../lib/requirements'
import { effectiveCompute, size } from '../lib/catalog'
/** Faixa orientativa do core, separada da telemetria real e da memória total do aplicativo. */
export function MemoryPreview({
  system,
  options,
  metrics
}: {
  system: Snapshot
  options: Options
  metrics?: Metrics
}): JSX.Element {
  const device = system.devices.find((d) => d.id === options.device)
  const compute = effectiveCompute(options.computeType, device)
  if (!compute)
    return (
      <p className="help flex gap-2">
        <Info className="size-4" />
        Aguardando capacidades compatíveis para estimar a memória.
      </p>
    )
  const gpu = options.device !== 'cpu'
  const r = estimate(options.model, gpu, compute)
  const observed = system.observations.find(
    (o) => o.model === options.model && o.device === options.device && o.computeType === compute
  )
  const available = metrics ? Math.max(0, metrics.totalRam - metrics.ram) / 1024 ** 3 : undefined
  const gpuMetrics = metrics?.gpus.find((g) => `cuda:${g.index}` === options.device)
  return (
    <div className="rounded-lg bg-muted/60 p-4 text-xs space-y-3" aria-label="Prévia de memória">
      <div className="flex items-center gap-2 font-medium">
        <MemoryStick className="size-4 text-primary" />
        Memória prevista{' '}
        <span className="ml-auto text-muted-foreground">
          {options.model} · {compute}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-muted-foreground">RAM do motor</span>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {r.core[0]}–{r.core[1]} GiB
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">RAM livre aproximada</span>
          <p className="mt-1 text-base font-semibold tabular-nums">
            {available == null ? 'Aguardando…' : `${available.toFixed(1)} GiB`}
          </p>
        </div>
      </div>
      {gpu && (
        <p>
          VRAM de referência: {r.vram[0]}–{r.vram[1]} GiB.
          {gpuMetrics
            ? ` Livre agora: ${size(Math.max(0, gpuMetrics.total - gpuMetrics.used))}.`
            : ' Medição da GPU indisponível.'}
        </p>
      )}
      {observed && (
        <p>
          Pico de RAM medido nesta configuração: <strong>{size(observed.peakRam)}</strong>.
        </p>
      )}
      <p className="text-muted-foreground leading-relaxed">
        {system.loaded
          ? 'O modelo já está carregado; a RAM livre não inclui a memória que ele ocupa.'
          : available == null
            ? 'Aguardando medição do sistema.'
            : available >= r.core[1] + 1
              ? 'Há margem de RAM para a faixa estimada.'
              : available < r.core[0]
                ? 'RAM livre abaixo da faixa estimada.'
                : 'Margem de RAM limitada para esta configuração.'}{' '}
        Faixa aproximada, incluindo runtime e buffers, para um áudio por vez. Duração, hardware e
        precisão alteram o pico; não é uma reserva nem garantia.
      </p>
    </div>
  )
}
