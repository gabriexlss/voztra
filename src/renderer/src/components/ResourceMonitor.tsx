import type { JSX } from 'react'
import type { Metrics } from '../../../shared/types'
import { ResourceBar } from './ResourceBar'
/** Valores brutos permanecem na legenda; a barra limita diferenças entre amostras. */
export function ResourceMonitor({
  metrics,
  device
}: {
  metrics?: Metrics
  device: string
}): JSX.Element {
  const gpu = metrics?.gpus.find((g) => `cuda:${g.index}` === device)
  return (
    <section className="resources" aria-label="Recursos do sistema">
      <div className="panel resource">
        <span>CPU · sistema</span>
        <strong>{metrics ? `${metrics.cpu.toFixed(0)}%` : '—'}</strong>
        {metrics ? (
          <ResourceBar total={100} used={metrics.cpu} app={metrics.appCpu} />
        ) : (
          <small>Aguardando amostra</small>
        )}
      </div>
      <div className="panel resource">
        <span>RAM · sistema</span>
        <strong>
          {metrics
            ? `${(metrics.ram / 1024 ** 3).toFixed(1)} / ${(metrics.totalRam / 1024 ** 3).toFixed(1)} GiB`
            : '—'}
        </strong>
        {metrics ? (
          <>
            <ResourceBar
              total={metrics.totalRam}
              used={metrics.ram}
              app={metrics.appRam}
              unit="bytes"
            />
            <small>
              App:{' '}
              {metrics.memoryKind === 'private'
                ? 'memória privada'
                : 'RSS aproximada, inclui compartilhamento'}
            </small>
          </>
        ) : (
          <small>Aguardando amostra</small>
        )}
      </div>
      <div className="panel resource">
        <span>GPU · placa selecionada</span>
        <strong>{gpu ? `${gpu.usage}%` : '—'}</strong>
        {gpu ? (
          <>
            <ResourceBar total={100} used={gpu.usage} app={gpu.appUsage} />
            <small>
              VRAM · {(gpu.used / 1024 ** 3).toFixed(1)} / {(gpu.total / 1024 ** 3).toFixed(1)} GiB
            </small>
            <ResourceBar total={gpu.total} used={gpu.used} app={gpu.appUsed} unit="bytes" />
          </>
        ) : (
          <small>{device === 'cpu' ? 'Modelo configurado para CPU' : 'Métrica indisponível'}</small>
        )}
      </div>
    </section>
  )
}
