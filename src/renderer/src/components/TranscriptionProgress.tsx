import { useEffect, useState, type JSX } from 'react'
import { LoaderCircle, Play, Square } from 'lucide-react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import type { BackendEvent, Job } from '../../../shared/types'

/** Formata duração sem transformar minutos longos em horários do relógio. */
function duration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(value / 60)
  return `${String(minutes).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

/** O relógio indica atividade; somente eventos reais do core avançam a porcentagem. */
export function TranscriptionProgress({
  running,
  cancelling,
  stage,
  progress,
  job,
  queued,
  canStart,
  onStart,
  onCancel
}: {
  running: boolean
  cancelling: boolean
  stage: string
  progress?: BackendEvent
  job?: Job
  queued: number
  canStart: boolean
  onStart: () => void
  onCancel: () => Promise<void>
}): JSX.Element {
  const [clock, setClock] = useState(0)
  const createdAt = job?.createdAt
  useEffect(() => {
    if (!running) return
    // createdAt mantém o relógio correto ao voltar da aba Configurações.
    const started = createdAt ? new Date(createdAt).getTime() : Date.now()
    const sample = (): void => setClock(Math.max(0, (Date.now() - started) / 1000))
    sample()
    const timer = window.setInterval(sample, 1000)
    return () => window.clearInterval(timer)
  }, [running, createdAt])
  const data = progress?.type === 'progress' ? progress : undefined
  const percent = data?.percent == null ? undefined : Math.min(100, Math.max(0, data.percent))
  const elapsed = running ? Math.max(clock, data?.elapsed ?? 0) : (data?.elapsed ?? 0)
  const processed = data?.processed ?? 0
  const total = data?.duration ?? 0
  return (
    <section
      className={`panel progress-panel transcription-progress ${running ? 'is-working' : ''}`}
      aria-label="Progresso da transcrição"
    >
      <div className="progress-heading">
        <div className="transcription-status">
          {running && (
            <LoaderCircle
              className="size-5 animate-spin text-primary"
              aria-label="Processamento em andamento"
              role="img"
            />
          )}
          <div>
            <strong aria-live="polite">{cancelling ? 'Cancelando transcrição…' : stage}</strong>
            <small>{running ? job?.file.name : `${queued} arquivo(s) na fila`}</small>
          </div>
        </div>
        {running ? (
          <Button variant="outline" disabled={cancelling} onClick={onCancel}>
            <Square />
            {cancelling ? 'Cancelando…' : 'Cancelar'}
          </Button>
        ) : (
          <Button disabled={!canStart} onClick={onStart}>
            <Play /> Transcrever fila
          </Button>
        )}
      </div>
      <div className="transcription-amount">
        <strong className="transcription-percent">
          {percent != null ? `${Math.floor(percent)}%` : running ? '…' : '0%'}
        </strong>
        <span>
          {total > 0
            ? `${duration(processed)} de ${duration(total)} processados`
            : data
              ? `${duration(processed)} processados · duração total indisponível`
              : running
                ? 'Preparando áudio e aguardando os primeiros trechos'
                : 'Progresso do áudio'}
        </span>
      </div>
      <Progress aria-label="Áudio processado" value={percent ?? (running ? null : 0)} />
      <div className="transcription-stats">
        <div>
          <span>Tempo decorrido</span>
          <strong>{duration(elapsed)}</strong>
        </div>
        <div>
          <span>Restante estimado</span>
          <strong>
            {running && data?.eta != null && processed > 0
              ? `~${duration(Math.ceil(data.eta))}`
              : running
                ? 'Calculando…'
                : '—'}
          </strong>
        </div>
        <div>
          <span>Velocidade</span>
          <strong>{data?.speed ? `${data.speed.toFixed(1)}× tempo real` : '—'}</strong>
        </div>
      </div>
      <small className="progress-explanation">
        {cancelling
          ? 'Os trechos concluídos serão preservados.'
          : running
            ? 'A porcentagem avança ao concluir trechos. O indicador gira enquanto o motor processa.'
            : 'A porcentagem representa o áudio processado; o tempo restante é uma estimativa.'}
      </small>
    </section>
  )
}
