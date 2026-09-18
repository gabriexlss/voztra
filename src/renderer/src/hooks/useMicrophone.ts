import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

/** Captura pertence ao App, não à página; navegar mantém a sessão em andamento. */
export function useMicrophone(): {
  recording: boolean
  starting: boolean
  start: (device: string) => Promise<void>
  finish: () => Promise<void>
} {
  const [recording, setRecording] = useState(false)
  const [starting, setStarting] = useState(false)
  const current = useRef<{
    stream: MediaStream
    context: AudioContext
    source: MediaStreamAudioSourceNode
    worklet: AudioWorkletNode
    job: string
    pending: Promise<void>
    stopping: boolean
    flushed?: () => void
  }>(undefined)
  const cleanup = async (): Promise<void> => {
    const c = current.current
    if (!c) return
    current.current = undefined
    c.worklet.disconnect()
    c.source.disconnect()
    c.stream.getTracks().forEach((t) => t.stop())
    await c.context.close().catch(() => {})
    setRecording(false)
  }
  useEffect(() => {
    const unsubscribe = window.api.onEvent((e) => {
      if (
        ['complete', 'error', 'cancelled', 'fatal'].includes(e.type) &&
        current.current &&
        (!e.jobId || e.jobId === current.current.job)
      )
        void cleanup()
    })
    return () => {
      unsubscribe()
      void cleanup()
    }
  }, [])
  async function start(device: string): Promise<void> {
    if (current.current) return
    setStarting(true)
    let stream: MediaStream | undefined
    let context: AudioContext | undefined
    let job: string | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: device ? { exact: device } : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false
        }
      })
      context = new AudioContext({ sampleRate: 16000 })
      await context.audioWorklet.addModule(new URL('pcm-worklet.js', document.baseURI).href)
      await context.resume()
      const source = context.createMediaStreamSource(stream)
      const worklet = new AudioWorkletNode(context, 'pcm-capture')
      job = await window.api.startMicrophone()
      const c = {
        stream,
        context,
        source,
        worklet,
        job,
        pending: Promise.resolve(),
        stopping: false,
        flushed: undefined as (() => void) | undefined
      }
      current.current = c
      let queued = 0
      worklet.port.onmessage = (e) => {
        if (e.data === 'flushed') {
          c.flushed?.()
          return
        }
        if (current.current !== c) return
        const bytes = new Uint8Array(e.data as ArrayBuffer)
        const audio = btoa(String.fromCharCode(...bytes))
        if (++queued > 100) {
          toast.error('Envio do microfone não acompanha a captura.')
          void window.api.cancel()
          void cleanup()
          return
        }
        c.pending = c.pending
          .then(() => window.api.microphoneFrame(c.job, audio))
          .catch((error) => {
            if (current.current === c) {
              toast.error(String(error))
              void window.api.cancel()
              void cleanup()
            }
          })
          .finally(() => {
            queued--
          })
      }
      source.connect(worklet)
      const silent = context.createGain()
      silent.gain.value = 0
      worklet.connect(silent)
      silent.connect(context.destination)
      setRecording(true)
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop())
      await context?.close().catch(() => {})
      if (job) await window.api.cancel()
      toast.error(String(error))
    } finally {
      setStarting(false)
    }
  }
  async function finish(): Promise<void> {
    const c = current.current
    if (!c || c.stopping) return
    c.stopping = true
    c.source.disconnect()
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000)
      c.flushed = () => {
        clearTimeout(timer)
        resolve()
      }
      c.worklet.port.postMessage('flush')
    })
    await c.pending
    await window.api.finishMicrophone(c.job).catch((e) => toast.error(String(e)))
    await cleanup()
  }
  return { recording, starting, start, finish }
}
