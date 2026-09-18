import { useEffect, useState, type JSX } from 'react'
import { Download, Trash2, RefreshCw, Cpu } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import type { CudaStatus } from '../../../../shared/engines'

/** Instalação opcional: CPU e APIs não baixam nem carregam as bibliotecas CUDA. */
export function CudaPanel({ busy, active }: { busy: boolean; active: boolean }): JSX.Element {
  const [status, setStatus] = useState<CudaStatus>()
  const [pending, setPending] = useState(false)
  async function refresh(): Promise<void> {
    try {
      setStatus(await window.api.cudaAction('status'))
    } catch {
      /* O core pode estar iniciando; a consulta manual permanece disponível. */
    }
  }
  useEffect(() => {
    let alive = true
    if (!busy)
      void window.api
        .cudaAction('status')
        .then((value) => {
          if (alive) setStatus(value)
        })
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [busy, active])
  async function action(value: 'install' | 'remove'): Promise<void> {
    setPending(true)
    try {
      setStatus(await window.api.cudaAction(value))
      toast.success('Estado do suporte NVIDIA atualizado')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="panel space-y-4">
      <div className="flex items-center gap-3">
        <Cpu className="size-5 text-primary" />
        <div className="flex-1">
          <h2 className="font-semibold text-sm">Suporte NVIDIA opcional</h2>
          <p className="help mt-1">Bibliotecas CUDA 12.8 e cuDNN 9 · Windows x64</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Atualizar suporte NVIDIA"
          disabled={busy || pending}
          onClick={refresh}
        >
          <RefreshCw />
        </Button>
      </div>
      <p className="help">
        A build padrão não inclui estas DLLs. Instale somente se usar Whisper com uma GPU NVIDIA. O
        driver da placa continua necessário; não é preciso instalar o CUDA Toolkit.
      </p>
      <p className="text-sm">
        {status?.installed
          ? `Instalado · ${(status.bytes / 1024 ** 3).toFixed(2)} GiB no disco`
          : `Download: ~${((status?.downloadBytes || 1335067632) / 1024 ** 3).toFixed(2)} GiB · reserve 4 GiB livres`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={busy || pending || !active || !status?.supported || status.installed}
          onClick={() => action('install')}
        >
          <Download />
          Instalar suporte NVIDIA
        </Button>
        <Button
          variant="ghost"
          disabled={busy || pending || !active || !status?.bytes}
          onClick={() => action('remove')}
        >
          <Trash2 />
          Remover bibliotecas
        </Button>
      </div>
      <p className="help">
        {!active ? 'Ative Whisper local para instalar ou remover. ' : ''}
        {status && !status.supported
          ? 'O instalador opcional de DLLs está disponível no Windows. '
          : ''}
        Os arquivos ficam na pasta de dados do Voztra e mantêm suas licenças NVIDIA. A operação
        descarrega o modelo, preservando modelos baixados e histórico.
      </p>
    </section>
  )
}
