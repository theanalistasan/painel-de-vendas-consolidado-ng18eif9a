import { describe, it, expect } from 'vitest'
import { sortMesesPorNome } from '@/components/FilterBar'
import { MESES_PT_BR, MESES_PT_BR_ALFABETICA } from '@/lib/formatters'

// Ordem alfabética pt-BR esperada pelo usuário (Filtros Globais e demais telas)
const ORDEM_ALFABETICA_ESPERADA = [
  'Abril',
  'Agosto',
  'Dezembro',
  'Fevereiro',
  'Janeiro',
  'Julho',
  'Junho',
  'Maio',
  'Março',
  'Novembro',
  'Outubro',
  'Setembro',
]

describe('Ordem alfabética dos meses nos filtros', () => {
  it('MESES_PT_BR_ALFABETICA mantém o value como número do mês e ordena o rótulo', () => {
    expect(MESES_PT_BR_ALFABETICA.map((m) => m.nome)).toEqual(ORDEM_ALFABETICA_ESPERADA)
    // value = número do mês (1=janeiro ... 12=dezembro)
    expect(MESES_PT_BR_ALFABETICA[0]).toEqual({ mes: 4, nome: 'Abril' })
    expect(MESES_PT_BR_ALFABETICA[11]).toEqual({ mes: 9, nome: 'Setembro' })
    expect(MESES_PT_BR_ALFABETICA).toHaveLength(12)
  })

  it('sortMesesPorNome ordena 1..12 em ordem alfabética dos nomes', () => {
    const ordenados = sortMesesPorNome(MESES_PT_BR.map((_, i) => i + 1)).map(Number)
    expect(ordenados).toEqual([4, 8, 12, 2, 1, 7, 6, 5, 3, 11, 10, 9])
  })

  it('sortMesesPorNome não aceita ordem numérica de strings (1, 10, 11, 12, 2...)', () => {
    const ordenados = sortMesesPorNome(MESES_PT_BR.map((_, i) => String(i + 1))).map(Number)
    expect(ordenados).toEqual([4, 8, 12, 2, 1, 7, 6, 5, 3, 11, 10, 9])
  })

  it('meses inválidos (fora de 1–12) vão para o fim', () => {
    const ordenados = sortMesesPorNome([13, 0, 5, 99]).map(Number)
    expect(ordenados).toEqual([5, 0, 13, 99])
  })

  it('sort com localeCompare pt-BR sobre os rótulos reproduz a ordem esperada (bug do cleanOptions)', () => {
    // Simula o que o MultiSelectDropdown faz agora: ordena pelo RÓTULO exibido
    // (getOptionLabel), não pelo valor bruto "1","10","11","12","2"...
    const meses = MESES_PT_BR.map((_, i) => String(i + 1))
    const getOptionLabel = (val: string) => {
      const n = Number(val)
      return !isNaN(n) && n >= 1 && n <= 12 ? MESES_PT_BR[n - 1] || val : val
    }
    const ordenados = [...meses].sort((a, b) =>
      getOptionLabel(a).localeCompare(getOptionLabel(b), 'pt-BR'),
    )
    expect(ordenados.map(getOptionLabel)).toEqual(ORDEM_ALFABETICA_ESPERADA)
  })
})
