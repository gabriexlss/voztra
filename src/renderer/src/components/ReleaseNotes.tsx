import type { JSX } from 'react'
import { ExternalLink } from 'lucide-react'
import releases from '../../../shared/releases.json'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { toast } from 'sonner'

/** A mesma fonte gera esta página offline, o CHANGELOG e as notas das releases. */
export function ReleaseNotes(): JSX.Element {
  return (
    <div className="space-y-5">
      {releases.map((release, index) => (
        <article key={release.version} className="panel">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-mono text-muted-foreground">v{release.version}</span>
            {index === 0 && <Badge variant="secondary">Esta versão</Badge>}
          </div>
          <h2 className="text-lg font-semibold">{release.title}</h2>
          <ul className="list-disc pl-5 my-4 space-y-2 text-sm text-muted-foreground">
            {release.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void window.api
                .openReference(
                  `https://github.com/gabriexlss/voztra/releases/tag/v${release.version}`
                )
                .catch((error) => toast.error(String(error)))
            }}
          >
            <ExternalLink />
            Ver publicação no GitHub
          </Button>
        </article>
      ))}
      <p className="help">
        As versões 1.0–1.2 usavam o nome Transcrevedor. As notas antigas foram reconstruídas a
        partir da documentação e dos instaladores preservados; não há datas de lançamento originais
        confirmadas.
      </p>
    </div>
  )
}
