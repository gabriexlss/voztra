import { useState, type JSX } from 'react'
import { Search, Pencil, FileAudio, FolderOpen, ArrowLeft } from 'lucide-react'
import type { Job, TranscriptionRequest } from '../../../shared/types'
import { statusLabels, requestStatus } from '../lib/history'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from './ui/dialog'
import { Choice } from './Choice'
import { TranscriptPanel } from './TranscriptPanel'
/** Nomes são apenas rótulos locais; renomear nunca altera o arquivo de áudio original. */
export function HistoryPage({
  requests,
  jobs,
  selected,
  onSelect,
  onRename,
  onEdit,
  onExport
}: {
  requests: TranscriptionRequest[]
  jobs: Job[]
  selected?: string
  onSelect: (id: string) => void
  onRename: (kind: 'request' | 'job', id: string, name: string) => Promise<void>
  onEdit: (i: number, text: string) => void
  onExport: (format: string) => Promise<void>
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [now] = useState(() => Date.now())
  const [status, setStatus] = useState('all')
  const [period, setPeriod] = useState('all')
  const [opened, setOpened] = useState<string>()
  const [rename, setRename] = useState<{ kind: 'request' | 'job'; id: string; title: string }>()
  const [saving, setSaving] = useState(false)
  const request = requests.find((r) => r.id === opened)
  const children =
    request?.jobIds.map((id) => jobs.find((j) => j.id === id)).filter((j): j is Job => !!j) ?? []
  const selectedJob = children.find((j) => j.id === selected)
  const visible = requests.filter((r) => {
    const items = jobs.filter((j) => r.jobIds.includes(j.id))
    const match = [r.title, ...items.map((j) => `${j.displayName ?? ''} ${j.file.name}`)]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase())
    const age = now - new Date(r.createdAt).getTime()
    return (
      match &&
      (status === 'all' || requestStatus(items) === status) &&
      (period === 'all' || age <= Number(period) * 86400000)
    )
  })
  return (
    <div className="space-y-5">
      {request ? (
        <>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Voltar às solicitações"
              onClick={() => setOpened(undefined)}
            >
              <ArrowLeft />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold truncate" title={request.title}>
                {request.title}
              </h2>
              <p className="help">
                {new Date(request.createdAt).toLocaleString('pt-BR')} · {children.length} áudio(s)
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setRename({ kind: 'request', id: request.id, title: request.title })}
            >
              <Pencil />
              Renomear solicitação
            </Button>
          </div>
          <div className="panel divide-y">
            {children.map((job) => (
              <div
                key={job.id}
                className={`flex items-center gap-3 py-3 ${selected === job.id ? 'text-primary' : ''}`}
              >
                <Button
                  variant="ghost"
                  className="flex-1 min-w-0 justify-start"
                  onClick={() => onSelect(job.id)}
                >
                  <FileAudio />
                  <span className="truncate">{job.displayName || job.file.name}</span>
                </Button>
                <Badge variant="secondary">{statusLabels[job.status]}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Renomear ${job.displayName || job.file.name}`}
                  onClick={() =>
                    setRename({ kind: 'job', id: job.id, title: job.displayName || job.file.name })
                  }
                >
                  <Pencil />
                </Button>
              </div>
            ))}
          </div>
          {selectedJob && (
            <>
              <p className="help break-all">
                Arquivo original: {selectedJob.file.name} · {selectedJob.options.model} ·{' '}
                {selectedJob.options.device} · {selectedJob.options.computeType}
                {selectedJob.message ? ` · ${selectedJob.message}` : ''}
              </p>
              <TranscriptPanel job={selectedJob} onEdit={onEdit} onExport={onExport} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_170px_170px] items-end gap-4">
            <div className="space-y-2">
              <label htmlFor="history-search" className="text-xs text-muted-foreground">
                Buscar solicitação ou áudio
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  id="history-search"
                  className="pl-9"
                  placeholder="Nome da solicitação ou arquivo…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <Choice
              label="Status"
              value={status}
              onChange={setStatus}
              items={[
                { value: 'all', label: 'Todos os status' },
                ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))
              ]}
            />
            <Choice
              label="Período"
              value={period}
              onChange={setPeriod}
              items={[
                { value: 'all', label: 'Todo o período' },
                { value: '1', label: 'Últimas 24 horas' },
                { value: '7', label: 'Últimos 7 dias' },
                { value: '30', label: 'Últimos 30 dias' }
              ]}
            />
          </div>
          <p className="help">
            {visible.length} solicitação(ões) · cada envio mantém seus áudios reunidos.
          </p>
          <div className="rounded-xl border bg-card divide-y">
            {visible.map((r) => {
              const items = jobs.filter((j) => r.jobIds.includes(j.id))
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
                >
                  <FolderOpen className="size-5 text-muted-foreground shrink-0" />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setOpened(r.id)
                      if (items[0]) onSelect(items[0].id)
                    }}
                  >
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block text-xs text-muted-foreground mt-1">
                      {new Date(r.createdAt).toLocaleString('pt-BR')} · {items.length} áudios ·{' '}
                      {items.filter((j) => j.status === 'complete').length} concluídos ·{' '}
                      {items.filter((j) => ['error', 'interrupted'].includes(j.status)).length}{' '}
                      falhas/interrupções
                    </span>
                  </button>
                  <Badge variant="secondary">{statusLabels[requestStatus(items)]}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Renomear solicitação ${r.title}`}
                    onClick={() => setRename({ kind: 'request', id: r.id, title: r.title })}
                  >
                    <Pencil />
                  </Button>
                </div>
              )
            })}
            {!visible.length && (
              <div className="empty">
                <FolderOpen className="size-8" />
                <h3>Nenhuma solicitação encontrada</h3>
                <p>
                  {requests.length
                    ? 'Ajuste a busca ou os filtros.'
                    : 'Suas transcrições serão salvas aqui automaticamente.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
      <Dialog
        open={!!rename}
        onOpenChange={(open) => {
          if (!open && !saving) setRename(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear {rename?.kind === 'job' ? 'áudio' : 'solicitação'}</DialogTitle>
            <DialogDescription>
              Altera somente o nome exibido no histórico. O arquivo original é preservado.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!rename) return
              setSaving(true)
              try {
                await onRename(rename.kind, rename.id, rename.title)
                setRename(undefined)
              } catch {
                /* O controlador apresenta a mensagem. */
              } finally {
                setSaving(false)
              }
            }}
          >
            <Input
              aria-label="Novo nome"
              autoFocus
              maxLength={160}
              value={rename?.title || ''}
              onChange={(e) => setRename((r) => (r ? { ...r, title: e.target.value } : r))}
            />
            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setRename(undefined)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !rename?.title.trim()}>
                Salvar nome
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
