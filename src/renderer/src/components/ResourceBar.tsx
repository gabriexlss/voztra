import type { JSX } from 'react'
/** Segmentos sem dupla contagem: aplicativo + demais processos + livre = capacidade. */
import { splitUsage } from '../lib/usage'
export function ResourceBar({
  total,
  used,
  app,
  unit = '%'
}: {
  total: number
  used: number
  app?: number | null
  unit?: string
}): JSX.Element {
  const parts = splitUsage(total, used, app)
  const value = (n: number): string =>
    unit === '%' ? `${n.toFixed(1)}%` : `${(n / 1024 ** 3).toFixed(2)} GiB`
  return (
    <div>
      <div
        className="segmented-bar"
        role="img"
        aria-label={`Total usado ${value(used)}; aplicativo ${app == null ? 'indisponível' : value(app)}; capacidade ${value(total)}`}
      >
        <i className="usage-app" style={{ width: `${parts.app}%` }} />
        <i className="usage-other" style={{ width: `${parts.other}%` }} />
        <i className="usage-free" style={{ width: `${parts.free}%` }} />
      </div>
      <div className="bar-legend">
        <span>
          <b className="usage-app" />
          App {app == null ? 'N/D' : value(app)}
        </span>
        <span>
          <b className="usage-other" />
          {app == null ? 'Total usado' : 'Outros'}{' '}
          {value(Math.max(0, used - Math.min(used, app ?? 0)))}
        </span>
        <span>
          <b className="usage-free" />
          Livre {value(Math.max(0, total - used))}
        </span>
      </div>
    </div>
  )
}
