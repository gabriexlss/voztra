import { useState, type JSX } from 'react'
import { Cpu, Cloud, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { EngineEditor } from './EngineEditor'
import { emptyProfile } from '../../../../shared/engines'
import { CudaPanel } from './CudaPanel'
import type { EngineProfile, EngineState } from '../../../../shared/engines'

export function EnginesPage({ state, busy }: { state?: EngineState; busy: boolean }): JSX.Element {
  const [editing, setEditing] = useState<EngineProfile>()
  if (!state) return <p>Carregando motores…</p>
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="help max-w-xl">
          Um motor ativo por vez. Whisper executa no computador; APIs enviam o áudio ao servidor
          configurado, inclusive servidores locais.
        </p>
        <Button disabled={busy} onClick={() => setEditing(emptyProfile())}>
          <Plus />
          Adicionar conexão
        </Button>
      </div>
      <div className="grid grid-cols-1 min-[1150px]:grid-cols-2 gap-4">
        {[
          { id: 'whisper', name: 'Whisper local', model: 'Carga manual · CPU / NVIDIA CUDA' },
          ...state.profiles
        ].map((p) => (
          <article
            key={p.id}
            className={`panel ${p.id === state.activeId ? 'border-primary/50' : ''}`}
          >
            <div className="flex gap-3 items-center mb-3">
              {p.id === 'whisper' ? (
                <Cpu className="size-5 text-primary" />
              ) : (
                <Cloud className="size-5 text-primary" />
              )}
              <h2 className="font-semibold flex-1 truncate">{p.name}</h2>
              <span className="help">{p.id === state.activeId ? 'Ativo' : 'Desativado'}</span>
            </div>
            <p className="help break-all mb-4">{p.model || 'Modelo ainda não escolhido'}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy || p.id === state.activeId}
                onClick={() => window.api.switchEngine(p.id).catch((e) => toast.error(String(e)))}
              >
                Usar este motor
              </Button>
              {p.id !== 'whisper' && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(p as EngineProfile)}
                >
                  <Settings2 />
                  Configurar
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      <CudaPanel busy={busy} active={state.activeId === 'whisper'} />
      {editing && (
        <EngineEditor
          key={editing.id || 'new'}
          initial={editing}
          state={state}
          busy={busy}
          onSaved={setEditing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  )
}
