import type { JSX } from 'react'
import { AudioLines } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import type { Job } from '../../../shared/types'
const time = (seconds: number): string =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`
interface Props {
  job?: Job
  onEdit: (index: number, text: string) => void
  onExport: (format: string) => Promise<void>
}

/** Resultados parciais podem ser exportados; edição é liberada após a execução. */
export function TranscriptPanel({ job, onEdit, onExport }: Props): JSX.Element {
  return (
    <section className="panel transcript">
      <div className="section-heading">
        <div>
          <div className="eyebrow">RESULTADO</div>
          <h2>Transcrição</h2>
        </div>
        <div className="exports">
          {['txt', 'srt', 'vtt', 'json'].map((format) => (
            <Button
              variant="outline"
              size="sm"
              key={format}
              disabled={!job?.segments.length}
              onClick={() => onExport(format)}
            >
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
      {job && (
        <p className="transcript-name">
          {job.displayName || job.file.name}{' '}
          <span>
            · {job.options.model} · {job.options.device}
          </span>
        </p>
      )}
      {!job?.segments.length ? (
        <div className="empty">
          <AudioLines className="size-8 text-muted-foreground" />
          <h3>Seu áudio, em palavras.</h3>
          <p>Os trechos aparecerão aqui conforme forem transcritos.</p>
        </div>
      ) : (
        <div className="segments">
          {job.segments.map((segment, index) => (
            <div className="segment" key={index}>
              <span>{time(segment.start)}</span>
              <Textarea
                aria-label={`Trecho ${index + 1}`}
                readOnly={job.status === 'running'}
                value={segment.text}
                onChange={(e) => onEdit(index, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
      {!!job?.segments.length && (
        <small className="editor-note">
          Edições são salvas no histórico ao exportar.{' '}
          {job?.segments.some((s) => s.timing === 'approximate')
            ? 'Tempos aproximados pelos blocos de áudio; revise antes de usar como legenda.'
            : 'Timestamps se referem ao áudio original.'}
        </small>
      )}
    </section>
  )
}
