import type { Segment } from '../shared/types'

/** Milissegundos inteiros evitam timestamps como 00:00:59,1000. */
function timestamp(seconds: number, separator: string): string {
  const ms = Math.max(0, Math.round(seconds * 1000))
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`
}
export function serializeTranscript(segments: Segment[], format: string): string {
  if (format === 'txt') return segments.map((s) => s.text).join('\n')
  if (format === 'json') return JSON.stringify(segments, null, 2)
  if (!['srt', 'vtt'].includes(format)) throw new Error('Formato inválido.')
  const body = segments
    .map(
      (s, i) =>
        `${format === 'srt' ? `${i + 1}\n` : ''}${timestamp(s.start, format === 'srt' ? ',' : '.')} --> ${timestamp(s.end, format === 'srt' ? ',' : '.')}\n${s.text}\n`
    )
    .join('\n')
  return format === 'vtt' ? `WEBVTT\n\n${body}` : body
}
