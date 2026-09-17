import type { Job } from '../../../shared/types'
export const statusLabels: Record<Job['status'], string> = {
  queued: 'Na fila',
  running: 'Em andamento',
  complete: 'Concluído',
  cancelled: 'Cancelado',
  error: 'Falhou',
  interrupted: 'Interrompido'
}
/** Status derivado dos filhos; falhas parciais não escondem arquivos concluídos. */
export function requestStatus(jobs: Job[]): Job['status'] {
  if (jobs.some((j) => j.status === 'running')) return 'running'
  if (jobs.some((j) => j.status === 'queued')) return 'queued'
  if (jobs.some((j) => j.status === 'error')) return 'error'
  if (jobs.some((j) => j.status === 'interrupted')) return 'interrupted'
  if (jobs.some((j) => j.status === 'cancelled')) return 'cancelled'
  return 'complete'
}
