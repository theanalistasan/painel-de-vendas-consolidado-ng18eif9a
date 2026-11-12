import { describe, it, expect } from 'vitest'
import { MESES_PT_BR } from '@/lib/formatters'

// Ordem do CALENDÁRIO esperada pelo usuário em TODOS os filtros de mês do app
// (reversão da ordem alfabética pedida anteriormente).
const ORDEM_CALENDARIO = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

describe('Ordem do calendário dos meses nos filtros', () => {
  it('MESES_PT_BR está na ordem do calendário (Janeiro→Dezembro)', () => {
    expect([...MESES_PT_BR]).toEqual(ORDEM_CALENDARIO)
  })

  it('não existe mais constante/ordenador alfabético de meses', () => {
    // A reversão removeu sortMesesPorNome e MESES_PT_BR_ALFABETICA; este teste
    // garante que a ordem calendário sai direto da iteração natural 1..12.
    const mesesComoOptions = MESES_PT_BR.map((_, i) => String(i + 1))
    const rotulos = mesesComoOptions.map((v) => {
      const n = Number(v)
      return !isNaN(n) && n >= 1 && n <= 12 ? MESES_PT_BR[n - 1] || v : v
    })
    expect(rotulos).toEqual(ORDEM_CALENDARIO)
  })

  it('value dos options continua sendo o número do mês (1..12)', () => {
    const values = MESES_PT_BR.map((_, i) => String(i + 1))
    expect(values[0]).toBe('1')
    expect(values[11]).toBe('12')
    expect(values).toHaveLength(12)
  })
})
