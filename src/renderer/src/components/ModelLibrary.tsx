import { useState, type JSX } from 'react'
import {
  Download,
  Trash2,
  RefreshCw,
  ExternalLink,
  Check,
  Gauge,
  GitCompareArrows
} from 'lucide-react'
import type { Snapshot, Metrics, ModelAction } from '../../../shared/types'
import {
  estimate,
  compareCpu,
  cpuSource,
  referenceDate,
  detectCpu,
  cpus
} from '../lib/requirements'
import { computeInfo, modelInfo, size } from '../lib/catalog'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Choice } from './Choice'

/** Escala editorial de cinco níveis; o texto acessível evita depender apenas das cores. */
function Rating({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1" role="img" aria-label={`${label}: ${value} de 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-5 rounded-sm ${i < value ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
        <span className="ml-2 tabular-nums">{value}/5</span>
      </span>
    </div>
  )
}
function Requirements({
  name,
  mode,
  compute,
  system
}: {
  name: string
  mode: string
  compute: string
  system: Snapshot
}): JSX.Element {
  const r = estimate(name, mode === 'gpu', compute)
  return (
    <>
      <dl className="requirements">
        <dt>CPU mínima de referência</dt>
        <dd>{r.minimum}</dd>
        <dt>CPU recomendada</dt>
        <dd>{r.recommended}</dd>
        <dt>Sua CPU</dt>
        <dd>{compareCpu(system.cpuName, r.minimum, r.recommended)}</dd>
        <dt>RAM total mínima / recomendada</dt>
        <dd>
          {r.ram[0]} / {r.ram[1]} GiB
        </dd>
        <dt>RAM estimada do motor ativo</dt>
        <dd>
          {r.core[0]}–{r.core[1]} GiB (inclui runtime)
        </dd>
        {mode === 'gpu' && (
          <>
            <dt>GPU mínima / recomendada</dt>
            <dd>
              NVIDIA {r.gpu[0]} / {r.gpu[1]}
            </dd>
            <dt>VRAM mínima / recomendada</dt>
            <dd>
              {r.vram[0]} / {r.vram[1]} GiB
            </dd>
            <dt>Compatibilidade</dt>
            <dd>
              {system.devices.some((d) => d.id.startsWith('cuda:'))
                ? 'CUDA detectada. Confirme a precisão disponível para a placa.'
                : 'Nenhuma GPU CUDA utilizável detectada.'}
            </dd>
          </>
        )}
      </dl>
      <Button
        variant="link"
        size="sm"
        className="px-0"
        onClick={() => window.api.openReference(cpuSource(r.recommended))}
      >
        Fonte da referência de CPU
        <ExternalLink />
      </Button>
    </>
  )
}
/** Gerenciamento não troca o modelo ativo; comparar também não inicia downloads. */
export function ModelLibrary({
  system,
  metrics,
  running,
  onAction
}: {
  system: Snapshot
  metrics?: Metrics
  running: boolean
  onAction: (action: ModelAction, name?: string) => Promise<void>
}): JSX.Element {
  const [mode, setMode] = useState('cpu')
  const [compute, setCompute] = useState('auto')
  const [comparison, setComparison] = useState<string[]>(['small', 'large-v3', 'turbo'])
  const [tab, setTab] = useState('library')
  const busy = !!system.operation || running || !system.ready
  const actual = detectCpu(system.cpuName)
  const toggle = (name: string): void =>
    setComparison((list) =>
      list.includes(name)
        ? list.filter((n) => n !== name)
        : list.length < 3
          ? [...list, name]
          : list
    )
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="help">
          {system.models.filter((m) => m.installed).length} modelos instalados ·{' '}
          {size(system.models.reduce((sum, m) => sum + m.bytes, 0))} no armazenamento
        </p>
        <Button variant="outline" disabled={busy} onClick={() => onAction('catalog')}>
          <RefreshCw />
          Atualizar armazenamento
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="library">Biblioteca</TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompareArrows className="size-4" />
            Comparar modelos
          </TabsTrigger>
        </TabsList>
        <div className="panel mt-5 space-y-4">
          <div className="flex justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{system.cpuName}</p>
              <p className="help mt-1">
                {system.threads} threads · {size(system.totalRam)} de RAM total
              </p>
            </div>
            {actual && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.api.openReference(cpuSource(actual.name))}
              >
                Fonte da CPU
                <ExternalLink />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Choice
              label="Estimar requisitos para"
              value={mode}
              onChange={setMode}
              items={[
                { value: 'cpu', label: 'CPU' },
                { value: 'gpu', label: 'GPU NVIDIA (CUDA)' }
              ]}
            />
            <Choice
              label="Precisão da estimativa"
              value={compute}
              onChange={setCompute}
              items={computeInfo.map((c) => ({
                ...c,
                label: c.value === 'auto' ? 'Referência: CPU INT8 / GPU FP16' : c.label
              }))}
            />
          </div>
          <p className="help">
            Estimativas do projeto para um áudio por vez, em blocos de 30 s. CPU comparada por
            Geekbench 6 multicore ({referenceDate}; {cpus.length} referências); isso não prevê a
            velocidade do Whisper. {actual ? '' : 'Seu processador está fora da base comparativa.'}{' '}
            A simulação não habilita precisões incompatíveis.
          </p>
        </div>
        <TabsContent value="library" className="mt-5">
          <div className="grid grid-cols-1 min-[1150px]:grid-cols-2 gap-5">
            {Object.entries(modelInfo).map(([name, info]) => {
              const model = system.models.find((m) => m.name === name)
              const loaded = system.loaded?.model === name
              const records = system.observations.filter((o) => o.model === name)
              return (
                <article key={name} className="panel flex flex-col" aria-label={`Modelo ${name}`}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{info.title}</h2>
                    <Badge variant={loaded ? 'default' : 'secondary'}>
                      {loaded
                        ? 'Na memória'
                        : model?.installed
                          ? 'Instalado'
                          : model?.partial
                            ? 'Download parcial'
                            : 'Não instalado'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3 min-h-16">
                    {info.description}
                  </p>
                  <p className="text-xs mt-3 mb-4">{info.use}</p>
                  <div className="space-y-2 mb-5">
                    <Rating label="Qualidade relativa" value={info.quality} />
                    <Rating label="Velocidade relativa" value={info.speed} />
                  </div>
                  <div className="border-y py-3 text-sm flex justify-between gap-4">
                    <span>
                      <strong>{size(model?.bytes ?? 0)}</strong> no disco
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Download {model?.estimated ? 'estimado' : 'consultado'}:{' '}
                      {model ? size(model.downloadBytes) : 'aguardando…'}
                    </span>
                  </div>
                  {model?.error && (
                    <p role="alert" className="text-destructive text-sm">
                      {model.error}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 my-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || model?.installed || !!model?.error}
                      onClick={() => onAction('download', name)}
                    >
                      <Download />
                      {model?.partial ? 'Retomar download' : 'Baixar modelo'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || !model?.bytes || !!model?.error}
                      onClick={() => onAction('delete', name)}
                    >
                      <Trash2 />
                      Excluir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-pressed={comparison.includes(name)}
                      disabled={!comparison.includes(name) && comparison.length === 3}
                      onClick={() => toggle(name)}
                    >
                      {comparison.includes(name) ? <Check /> : <GitCompareArrows />}Comparar
                    </Button>
                  </div>
                  <details>
                    <summary>Requisitos e consumo estimados</summary>
                    <Requirements name={name} mode={mode} compute={compute} system={system} />
                  </details>
                  <details>
                    <summary>Consumo observado neste computador</summary>
                    <div className="space-y-3 py-3">
                      {loaded && (
                        <p className="text-sm">
                          Motor agora: {metrics ? size(metrics.coreRam) : 'aguardando amostra'}
                        </p>
                      )}
                      {records.length ? (
                        records.map((o) => (
                          <div key={`${o.device}:${o.computeType}`} className="text-xs space-y-1">
                            <strong>
                              {o.device} · {o.computeType}
                            </strong>
                            <p>
                              Pico de RAM: {size(o.peakRam)} ·{' '}
                              {new Date(o.date).toLocaleString('pt-BR')}
                            </p>
                            {o.benchmark && (
                              <p>
                                Teste local: {o.benchmark.duration.toFixed(1)}s de fala em{' '}
                                {o.benchmark.elapsed.toFixed(1)}s · {o.benchmark.speed.toFixed(2)}×
                                tempo real · pico {size(o.benchmark.peakRam)}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="help">Ainda sem medições salvas para este modelo.</p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!loaded || busy}
                        onClick={() => onAction('benchmark')}
                      >
                        <Gauge />
                        Testar desempenho neste computador
                      </Button>
                      <p className="help">
                        Fala sintética curta em português incluída no app. Exige carga manual e
                        mantém o modelo na memória.
                      </p>
                    </div>
                  </details>
                  <Button
                    variant="link"
                    size="sm"
                    className="self-start px-0 mt-2"
                    disabled={busy}
                    onClick={() => onAction('metadata', name)}
                  >
                    Consultar tamanho online
                    <ExternalLink />
                  </Button>
                </article>
              )
            })}
          </div>
        </TabsContent>
        <TabsContent value="compare" className="mt-5 space-y-5">
          <div className="panel space-y-4">
            <p className="text-sm">Selecione até três modelos para comparar lado a lado.</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(modelInfo).map(([name, m]) => (
                <Button
                  key={name}
                  variant={comparison.includes(name) ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={comparison.includes(name)}
                  disabled={!comparison.includes(name) && comparison.length >= 3}
                  onClick={() => toggle(name)}
                >
                  {m.title}
                </Button>
              ))}
            </div>
          </div>
          {comparison.length ? (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Característica</th>
                    {comparison.map((n) => (
                      <th key={n}>{modelInfo[n].title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Descrição</th>
                    {comparison.map((n) => (
                      <td key={n}>{modelInfo[n].description}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Qualidade relativa</th>
                    {comparison.map((n) => (
                      <td key={n}>
                        <Rating label="Qualidade" value={modelInfo[n].quality} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Velocidade relativa</th>
                    {comparison.map((n) => (
                      <td key={n}>
                        <Rating label="Velocidade" value={modelInfo[n].speed} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Armazenamento local</th>
                    {comparison.map((n) => (
                      <td key={n}>{size(system.models.find((m) => m.name === n)?.bytes ?? 0)}</td>
                    ))}
                  </tr>
                  <tr>
                    <th>Requisitos estimados</th>
                    {comparison.map((n) => (
                      <td key={n}>
                        <Requirements name={n} mode={mode} compute={compute} system={system} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th>Picos medidos</th>
                    {comparison.map((n) => (
                      <td key={n}>
                        {system.observations
                          .filter((o) => o.model === n)
                          .map((o) => (
                            <p key={`${o.device}:${o.computeType}`}>
                              {o.device} · {o.computeType}: {size(o.peakRam)}
                            </p>
                          ))}
                        {!system.observations.some((o) => o.model === n) && 'Sem medições'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel help">Escolha os modelos acima.</p>
          )}
        </TabsContent>
      </Tabs>
      <div className="text-xs text-muted-foreground leading-relaxed space-y-2">
        <p>
          As escalas de cinco níveis são orientativas dentro da família Whisper, não notas de
          benchmark. Idioma, ruído, hardware e configuração mudam o resultado. Requisitos são
          referências práticas, não mínimos oficiais.
        </p>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          onClick={() => window.api.openReference('https://github.com/openai/whisper')}
        >
          Documentação Whisper
          <ExternalLink />
        </Button>
        <Button
          variant="link"
          size="sm"
          onClick={() =>
            window.api.openReference('https://github.com/SYSTRAN/faster-whisper#benchmark')
          }
        >
          Memória e desempenho
          <ExternalLink />
        </Button>
      </div>
    </div>
  )
}
