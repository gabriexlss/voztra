/** Referências estimadas do projeto; pontuações são fatos públicos, não medições Whisper. */
export const referenceDate = '14/09/2026'
const source = 'https://browser.geekbench.com/processors/'
export const cpus = [
  { name: 'Intel Core i3-1115G4', score: 2437, slug: 'intel-core-i3-1115g4' },
  { name: 'AMD Ryzen 5 3600', score: 7358, slug: 'amd-ryzen-5-3600' },
  { name: 'AMD Ryzen 5 5600', score: 9178, slug: 'amd-ryzen-5-5600' },
  { name: 'AMD Ryzen 5 7600', score: 13189, slug: 'amd-ryzen-5-7600' },
  { name: 'AMD Ryzen 9 5950X', score: 15297, slug: 'amd-ryzen-9-5950x' },
  { name: 'Intel Core i3-12100', score: 6983, slug: 'intel-core-i5-12400' },
  { name: 'Intel Core i5-12400', score: 8641, slug: 'intel-core-i5-12400' },
  { name: 'Intel Core i5-12400F', score: 9435, slug: 'intel-core-i5-12400' },
  { name: 'Intel Core i7-12700K', score: 15497, slug: 'intel-core-i5-12400' },
  { name: 'AMD Ryzen 7 5700X', score: 10727, slug: 'amd-ryzen-5-5600' },
  { name: 'AMD Ryzen 5 5600X', score: 9249, slug: 'amd-ryzen-5-5600' },
  { name: 'AMD Ryzen 5 7600X', score: 13668, slug: 'amd-ryzen-5-7600' },
  { name: 'AMD Ryzen 7 7700', score: 15250, slug: 'amd-ryzen-5-7600' }
]
export function detectCpu(name: string): (typeof cpus)[number] | undefined {
  const cleaned = name
    .replace(/\(R\)|\(TM\)/gi, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
  return cpus.find((cpu) => {
    const short = cpu.name.replace(/^(AMD |Intel Core )/, '').toLowerCase()
    const index = cleaned.indexOf(short)
    return index >= 0 && !/[a-z0-9]/.test(cleaned[index + short.length] || '')
  })
}
export function compareCpu(name: string, minimum: string, recommended: string): string {
  const actual = detectCpu(name)
  const min = cpus.find((c) => c.name === minimum)!
  const rec = cpus.find((c) => c.name === recommended)!
  if (!actual) return 'Sem dados suficientes para comparar'
  if (actual.score > rec.score * 1.1) return 'Acima do recomendado'
  if (actual.score >= rec.score * 0.9) return 'Atende ao recomendado'
  if (actual.score >= min.score * 0.9) return 'Atende à referência mínima'
  return 'Abaixo da referência mínima'
}
export function cpuSource(name: string): string {
  return source + (cpus.find((c) => c.name === name)?.slug || 'amd-ryzen-5-3600')
}
interface Requirement {
  minimum: string
  recommended: string
  ram: [number, number]
  core: [number, number]
  gpu: [string, string]
  vram: [number, number]
  gpuCore: [number, number]
}
const r3600 = 'AMD Ryzen 5 3600',
  r5600 = 'AMD Ryzen 5 5600',
  r7600 = 'AMD Ryzen 5 7600',
  r5950 = 'AMD Ryzen 9 5950X'
const large: Requirement = {
  minimum: r7600,
  recommended: r5950,
  ram: [16, 32],
  core: [5, 9],
  gpu: ['RTX 3060 12 GB', 'RTX 4060 Ti 16 GB'],
  vram: [8, 12],
  gpuCore: [3, 6]
}
export const requirements: Record<string, Requirement> = {
  tiny: {
    minimum: 'Intel Core i3-1115G4',
    recommended: r3600,
    ram: [4, 8],
    core: [0.4, 1],
    gpu: ['GTX 1650 4 GB', 'RTX 2060 6 GB'],
    vram: [2, 4],
    gpuCore: [0.5, 1.5]
  },
  base: {
    minimum: r3600,
    recommended: r5600,
    ram: [4, 8],
    core: [0.6, 1.5],
    gpu: ['GTX 1650 4 GB', 'RTX 2060 6 GB'],
    vram: [2, 4],
    gpuCore: [0.6, 2]
  },
  small: {
    minimum: r3600,
    recommended: r7600,
    ram: [8, 16],
    core: [1.5, 3],
    gpu: ['GTX 1660 6 GB', 'RTX 3060 12 GB'],
    vram: [4, 6],
    gpuCore: [1, 3]
  },
  medium: {
    minimum: r5600,
    recommended: r5950,
    ram: [8, 16],
    core: [3, 6],
    gpu: ['RTX 2060 6 GB', 'RTX 3060 12 GB'],
    vram: [6, 8],
    gpuCore: [2, 5]
  },
  'large-v1': large,
  'large-v2': large,
  'large-v3': large,
  turbo: {
    minimum: r5600,
    recommended: r7600,
    ram: [8, 16],
    core: [3, 5],
    gpu: ['RTX 2060 6 GB', 'RTX 3060 12 GB'],
    vram: [6, 8],
    gpuCore: [2, 5]
  }
}
export function estimate(name: string, gpu: boolean, compute: string): Requirement {
  const r = requirements[name]
  // Faixas conservadoras: FP32 aumenta pesos/ativações; INT8 não reduz todos os buffers.
  const factor = gpu
    ? 1
    : compute === 'float32'
      ? 1.8
      : compute === 'int16'
        ? 1.35
        : ['float16', 'bfloat16'].includes(compute)
          ? 1.4
          : 1
  const vram = r.vram.map((n) =>
    Math.ceil(n * (compute === 'float32' ? 1.8 : compute.startsWith('int8') ? 0.8 : 1))
  ) as [number, number]
  return {
    ...r,
    minimum: gpu ? 'Intel Core i3-12100' : r.minimum,
    recommended: gpu ? r3600 : r.recommended,
    core: (gpu ? r.gpuCore : r.core).map((n) => Math.round(n * factor * 10) / 10) as [
      number,
      number
    ],
    ram: r.ram.map((n) => (compute === 'float32' ? n * 2 : n)) as [number, number],
    vram,
    // Não recomenda uma variante cuja memória seja menor que a faixa estimada em FP32.
    gpu: r.gpu.map((name, index) => {
      const capacity = Number(name.match(/(\d+) GB/)?.[1] || 0)
      return capacity >= vram[index] ? name : `placa com ${vram[index]} GiB de VRAM ou mais`
    }) as [string, string]
  }
}
