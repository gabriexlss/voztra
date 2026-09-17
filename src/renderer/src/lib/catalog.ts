/** Notas editoriais relativas: não são benchmarks, nem garantias para qualquer idioma. */
export const modelInfo: Record<
  string,
  { title: string; description: string; quality: number; speed: number; use: string }
> = {
  tiny: {
    title: 'Tiny',
    description:
      'O menor Whisper. Responde rapidamente, mas perde mais palavras em fala difícil, ruído e sotaques.',
    quality: 1,
    speed: 5,
    use: 'Rascunhos rápidos e computadores modestos.'
  },
  base: {
    title: 'Base',
    description: 'Um passo acima do Tiny na compreensão, ainda com baixo consumo de memória.',
    quality: 2,
    speed: 4,
    use: 'Áudios claros e tarefas do dia a dia.'
  },
  small: {
    title: 'Small',
    description:
      'Equilíbrio entre reconhecimento, memória e tempo. Lida melhor com variações de fala que os modelos menores.',
    quality: 3,
    speed: 3,
    use: 'Transcrição geral com recursos moderados.'
  },
  medium: {
    title: 'Medium',
    description:
      'Mais capacidade para fala complexa e múltiplos idiomas. O processamento em CPU pode ser demorado.',
    quality: 4,
    speed: 2,
    use: 'Priorizar qualidade com mais RAM disponível.'
  },
  'large-v1': {
    title: 'Large v1',
    description:
      'Primeira geração do modelo grande. Útil para reproduzir resultados antigos; exige bastante memória.',
    quality: 4,
    speed: 1,
    use: 'Comparação e compatibilidade com resultados anteriores.'
  },
  'large-v2': {
    title: 'Large v2',
    description:
      'Revisão do Large com treinamento adicional. Mantém o custo elevado da arquitetura grande.',
    quality: 4,
    speed: 1,
    use: 'Comparar resultados da segunda geração.'
  },
  'large-v3': {
    title: 'Large v3',
    description:
      'Modelo grande multilíngue com treinamento ampliado. Prioriza qualidade e robustez, ao custo de memória e processamento.',
    quality: 5,
    speed: 1,
    use: 'Áudios exigentes, ruído e variedade de idiomas.'
  },
  turbo: {
    title: 'Large v3 Turbo',
    description:
      'Versão otimizada do Large v3: o decodificador passa de 32 para 4 camadas. Busca maior velocidade com alguma perda de qualidade.',
    quality: 4,
    speed: 4,
    use: 'Transcrição rápida com boa qualidade. Não é indicado para traduzir fala para inglês.'
  }
}
export const computeInfo = [
  {
    value: 'auto',
    label: 'Automático',
    description:
      'O motor escolhe uma precisão compatível: prefere INT8 na CPU e FP16 na GPU. O tipo efetivo aparece após carregar.',
    memory: 'Depende do dispositivo'
  },
  {
    value: 'int8',
    label: 'INT8',
    description:
      'Pesos quantizados em 8 bits. Geralmente economiza memória e acelera CPUs compatíveis; pequenas diferenças no texto são possíveis.',
    memory: 'Baixa memória'
  },
  {
    value: 'int8_float32',
    label: 'INT8 + FP32',
    description:
      'Pesos INT8 e partes não quantizadas em FP32. Opção econômica para CPU; velocidade depende das instruções do processador.',
    memory: 'Baixa a moderada'
  },
  {
    value: 'int8_float16',
    label: 'INT8 + FP16',
    description:
      'Pesos INT8 com partes em meia precisão. Pode reduzir VRAM em GPUs compatíveis; nem sempre supera FP16 em velocidade.',
    memory: 'Baixa VRAM'
  },
  {
    value: 'int8_bfloat16',
    label: 'INT8 + BF16',
    description:
      'Pesos INT8 e partes em BF16. Exige suporte do hardware; não oferece ganho universal sobre INT8 + FP16.',
    memory: 'Baixa VRAM'
  },
  {
    value: 'int16',
    label: 'INT16',
    description:
      'Quantização em 16 bits. Alternativa em CPUs compatíveis, costuma ocupar mais memória que INT8; meça a velocidade localmente.',
    memory: 'Intermediária'
  },
  {
    value: 'float16',
    label: 'FP16',
    description:
      'Ponto flutuante de 16 bits. Bom equilíbrio de VRAM e velocidade em GPUs compatíveis. O motor atual normalmente não oferece este tipo na CPU.',
    memory: 'Intermediária'
  },
  {
    value: 'bfloat16',
    label: 'BF16',
    description:
      '16 bits com maior faixa de valores e menos bits de precisão que FP16. Útil em hardware compatível; desempenho varia por GPU.',
    memory: 'Intermediária'
  },
  {
    value: 'float32',
    label: 'FP32',
    description:
      'Ponto flutuante de 32 bits, sem quantização dos pesos. Consome mais memória e frequentemente é mais lento; não garante uma transcrição melhor.',
    memory: 'Alta memória'
  }
]
export function effectiveCompute(
  value: string,
  device: { id: string; computeTypes: string[] } | undefined
): string | undefined {
  if (!device) return undefined
  if (value !== 'auto') return device.computeTypes.includes(value) ? value : undefined
  const preferred =
    device.id === 'cpu' ? ['int8', 'float32'] : ['float16', 'int8_float16', 'float32']
  return preferred.find((type) => device.computeTypes.includes(type))
}
export const size = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(2)} GiB`
    : `${(bytes / 1024 ** 2).toFixed(1)} MiB`
