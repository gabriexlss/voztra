export type UpdateMode = 'installed' | 'portable' | 'manual' | 'development'
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'current'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
export interface UpdateState {
  version: string
  mode: UpdateMode
  dataPath: string
  automatic: boolean
  status: UpdateStatus
  availableVersion?: string
  percent?: number
  message?: string
  checkedAt?: string
}
export type UpdateCommand = 'check' | 'download' | 'install' | 'release'

/** Somente versões estáveis numéricas participam do canal público. */
export function newerVersion(candidate: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(candidate) || !/^\d+\.\d+\.\d+$/.test(current)) return false
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}
