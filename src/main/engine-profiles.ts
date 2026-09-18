import { safeStorage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { writeAtomic } from './atomic-file'
import { randomUUID } from 'node:crypto'
import type { EngineProfile, EngineState } from '../shared/engines'

/** Arquivo atômico, chaves cifradas pelo SO e fallback explícito apenas em memória. */
export class EngineProfiles {
  private records: { profile: EngineProfile; encrypted?: string }[] = []
  private sessionKeys = new Map<string, string>()
  activeId = 'whisper'
  constructor(private path: string) {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8'))
      if (data.version !== 1 || !Array.isArray(data.records))
        throw new Error('Perfis de motores inválidos; arquivo preservado.')
      this.records = data.records
      this.activeId =
        data.activeId === 'whisper' || this.records.some((r) => r.profile.id === data.activeId)
          ? data.activeId
          : 'whisper'
    }
  }
  secure(): boolean {
    return (
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
    )
  }
  snapshot(): EngineState {
    return {
      activeId: this.activeId,
      secureStorage: this.secure(),
      profiles: this.records.map((r) => ({
        ...r.profile,
        hasKey: !!r.encrypted || !!this.sessionKeys.get(r.profile.id)
      }))
    }
  }
  get(id = this.activeId): EngineProfile {
    const record = this.records.find((r) => r.profile.id === id)
    if (!record) throw new Error('Conexão não encontrada.')
    return structuredClone(record.profile)
  }
  credentials(id = this.activeId): EngineProfile & { apiKey: string } {
    const record = this.records.find((r) => r.profile.id === id)
    if (!record) throw new Error('Conexão não encontrada.')
    let key = this.sessionKeys.get(id) || ''
    if (record.encrypted) {
      try {
        key = safeStorage.decryptString(Buffer.from(record.encrypted, 'base64'))
      } catch {
        throw new Error(
          'Não foi possível abrir a chave neste computador. Informe-a novamente em Motores.'
        )
      }
    }
    return { ...this.get(id), apiKey: key }
  }
  save(input: unknown, key: unknown, remember: unknown): EngineProfile {
    const p = input as EngineProfile
    if (
      !p ||
      !['openai', 'gemini', 'custom'].includes(p.provider) ||
      ![
        'openai-transcription',
        'openai-chat',
        'gemini-content',
        'gemini-interactions',
        'openai-live',
        'gemini-live'
      ].includes(p.protocol)
    )
      throw new Error('Provedor ou protocolo inválido.')
    for (const field of [
      'name',
      'baseUrl',
      'liveUrl',
      'model',
      'instructions',
      'basePrompt'
    ] as const)
      if (typeof p[field] !== 'string' || p[field].length > 16000)
        throw new Error('Campo inválido: ' + field)
    if (!p.name.trim()) throw new Error('Informe o nome da conexão.')
    const url = new URL(p.baseUrl)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('URL base inválida. Use o campo próprio para a chave.')
    if (p.liveUrl) {
      const live = new URL(p.liveUrl)
      if (
        !['ws:', 'wss:'].includes(live.protocol) ||
        live.username ||
        live.password ||
        [...live.searchParams.keys()].some((k) => /key|token|secret|authorization/i.test(k)) ||
        live.hash
      )
        throw new Error('URL Live inválida. Informe a chave no campo próprio.')
    }
    if (
      !p.advanced ||
      Array.isArray(p.advanced) ||
      typeof p.advanced !== 'object' ||
      JSON.stringify(p.advanced).length > 64000
    )
      throw new Error('Os parâmetros devem ser um objeto JSON de até 64 KB.')
    // Transporte, credenciais e conteúdo binário pertencem a campos próprios.
    const reserved =
      /^(api[_-]?key|authorization|headers|file|input|messages|contents|model|setup|url|base[_-]?url|stream)$/i
    const check = (value: Record<string, unknown>, top = true): void => {
      for (const [k, v] of Object.entries(value)) {
        if (
          (top && reserved.test(k)) ||
          /^(api[_-]?key|authorization|headers)$/i.test(k) ||
          ['__proto__', 'constructor', 'prototype'].includes(k)
        )
          throw new Error(`Use o campo próprio para ${k}.`)
        if (v && typeof v === 'object') check(v as Record<string, unknown>, false)
      }
    }
    check(p.advanced)
    if (p.temperature !== null && (!Number.isFinite(p.temperature) || p.temperature < 0))
      throw new Error('Temperatura inválida.')
    if (!Number.isInteger(p.chunkSeconds) || p.chunkSeconds < 5 || p.chunkSeconds > 300)
      throw new Error('Blocos devem ter de 5 a 300 segundos.')
    if (key !== undefined && (typeof key !== 'string' || key.length > 16000))
      throw new Error('Chave inválida.')
    const id = p.id || randomUUID()
    if (id === 'whisper' || (p.id && !this.records.some((r) => r.profile.id === p.id)))
      throw new Error('Identificador inválido.')
    const profile: EngineProfile = {
      id,
      name: p.name.trim(),
      provider: p.provider,
      baseUrl: url.href.replace(/\/$/, ''),
      liveUrl: p.liveUrl,
      protocol: p.protocol,
      model: p.model.trim(),
      instructions: p.instructions,
      basePrompt: p.basePrompt,
      advanced: structuredClone(p.advanced),
      temperature: p.temperature,
      chunkSeconds: p.chunkSeconds
    }
    const record = this.records.find((r) => r.profile.id === id) || { profile }
    if (typeof key === 'string') {
      if (remember && key && !this.secure())
        throw new Error(
          'Cofre do sistema indisponível. Desmarque Salvar chave para usá-la somente nesta sessão.'
        )
      record.encrypted =
        remember && key ? safeStorage.encryptString(key).toString('base64') : undefined
      this.sessionKeys.set(id, remember ? '' : key)
    }
    record.profile = profile
    if (!this.records.includes(record)) this.records.push(record)
    this.persist()
    return profile
  }
  delete(id: string): void {
    if (id === this.activeId) throw new Error('Troque de motor antes de excluir esta conexão.')
    this.records = this.records.filter((r) => r.profile.id !== id)
    this.sessionKeys.delete(id)
    this.persist()
  }
  persist(): void {
    writeAtomic(
      this.path,
      JSON.stringify({ version: 1, activeId: this.activeId, records: this.records })
    )
  }
}
