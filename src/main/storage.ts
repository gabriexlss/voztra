import { mkdirSync, readFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Job, TranscriptionRequest } from '../shared/types'
import { writeAtomic } from './atomic-file'

/** Histórico versionado e atômico. O arquivo anterior permanece intacto na migração. */
export class JobStore {
  readonly jobs: Job[]
  readonly requests: TranscriptionRequest[]
  private readonly path: string
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true })
    this.path = join(directory, 'history-v2.json')
    const legacy = join(directory, 'jobs.json')
    if (existsSync(this.path)) {
      // Falhar preserva arquivos corrompidos para recuperação, sem sobrescrever os dados.
      const saved = JSON.parse(readFileSync(this.path, 'utf8'))
      if (saved.version !== 2 || !Array.isArray(saved.jobs) || !Array.isArray(saved.requests))
        throw new Error('Histórico inválido. O arquivo original foi preservado.')
      this.jobs = saved.jobs
      this.requests = saved.requests
    } else {
      this.jobs = existsSync(legacy) ? JSON.parse(readFileSync(legacy, 'utf8')) : []
      if (!Array.isArray(this.jobs)) throw new Error('Histórico anterior inválido.')
      if (existsSync(legacy) && !existsSync(legacy + '.backup'))
        copyFileSync(legacy, legacy + '.backup')
      this.requests = this.jobs.map((job) => {
        const id = randomUUID()
        job.requestId = id
        return {
          id,
          title: job.file?.name || 'Transcrição importada',
          createdAt: job.createdAt || new Date().toISOString(),
          jobIds: [job.id]
        }
      })
    }
    this.jobs.forEach((job) => {
      if (job.status === 'running' || job.status === 'queued') job.status = 'interrupted'
    })
    this.save()
  }
  save(): void {
    writeAtomic(this.path, JSON.stringify({ version: 2, jobs: this.jobs, requests: this.requests }))
  }
}
