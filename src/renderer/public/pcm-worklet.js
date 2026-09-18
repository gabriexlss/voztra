/* eslint-disable @typescript-eslint/explicit-function-return-type -- AudioWorklet nativo, sem compilação TypeScript. */
/** PCM mono em blocos de 100 ms; AudioContext faz a conversão nativa para 16 kHz. */
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Int16Array(1600)
    this.offset = 0
    this.port.onmessage = () => {
      if (this.offset) this.port.postMessage(this.buffer.slice(0, this.offset).buffer)
      this.offset = 0
      this.port.postMessage('flushed')
    }
  }
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel)
      for (const sample of channel) {
        this.buffer[this.offset++] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
        if (this.offset === this.buffer.length) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer])
          this.buffer = new Int16Array(1600)
          this.offset = 0
        }
      }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
