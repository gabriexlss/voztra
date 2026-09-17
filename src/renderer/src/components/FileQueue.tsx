import { useState, type JSX } from 'react'
import { Upload, FileAudio, X } from 'lucide-react'
import type { AudioFile } from '../../../shared/types'
import { Button } from './ui/button'
/** A área recebe apenas arquivos locais autorizados pelo seletor ou arraste. */
export function FileQueue({
  files,
  onAdd,
  onRemove
}: {
  files: AudioFile[]
  onAdd: (paths?: string[]) => Promise<void>
  onRemove: (id: string) => void
}): JSX.Element {
  const [dragging, setDragging] = useState(false)
  return (
    <div>
      <button
        className={`dropzone ${dragging ? 'border-primary bg-accent' : ''}`}
        onClick={() => onAdd()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onAdd(
            Array.from(e.dataTransfer.files)
              .map((f) => window.api.filePath(f))
              .filter(Boolean)
          )
        }}
      >
        <span className="rounded-xl border bg-card p-3">
          <Upload className="size-6 text-primary" />
        </span>
        <span className="font-medium mt-3">Adicionar arquivos de áudio</span>
        <span className="help mt-1">Arraste aqui ou clique para selecionar</span>
        <span className="text-[11px] text-muted-foreground mt-3">
          MP3, WAV, FLAC, M4A, OGG, OPUS e outros formatos de áudio e vídeo
        </span>
      </button>
      {!!files.length && (
        <div className="mt-4 max-h-56 overflow-auto divide-y">
          {files.map((file, index) => (
            <div key={file.id} className="flex items-center gap-3 py-2">
              <FileAudio className="size-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-sm truncate flex-1" title={file.path}>
                {file.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover ${file.name}`}
                onClick={() => onRemove(file.id)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
