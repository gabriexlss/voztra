import { useEffect, useState, type JSX } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '../ui/button'
import { Choice } from '../Choice'
import type { useMicrophone } from '../../hooks/useMicrophone'
export function MicrophonePanel({
  capture,
  busy
}: {
  capture: ReturnType<typeof useMicrophone>
  busy: boolean
}): JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [device, setDevice] = useState('')
  useEffect(() => {
    void navigator.mediaDevices
      .enumerateDevices()
      .then((list) => setDevices(list.filter((d) => d.kind === 'audioinput')))
      .catch(() => {})
  }, [capture.recording])
  return (
    <section className="panel mb-6 space-y-3">
      <h2 className="text-sm font-semibold">Microfone · transcrição Live</h2>
      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <Choice
            label="Dispositivo de entrada"
            value={device}
            disabled={busy || capture.starting}
            onChange={setDevice}
            items={[
              { value: '', label: 'Microfone padrão' },
              ...devices
                .filter((d) => d.deviceId && d.deviceId !== 'default')
                .map((d, i) => ({ value: d.deviceId, label: d.label || `Microfone ${i + 1}` }))
            ]}
          />
        </div>
        {capture.recording ? (
          <Button variant="outline" onClick={capture.finish}>
            <Square />
            Finalizar gravação
          </Button>
        ) : (
          <Button disabled={busy || capture.starting} onClick={() => capture.start(device)}>
            <Mic />
            {capture.starting ? 'Abrindo microfone…' : 'Iniciar microfone'}
          </Button>
        )}
      </div>
      <p className="help">
        A captura começa somente após sua ação e envia áudio ao servidor configurado. Finalizar
        aguarda os últimos resultados; Cancelar interrompe o processamento.
      </p>
    </section>
  )
}
