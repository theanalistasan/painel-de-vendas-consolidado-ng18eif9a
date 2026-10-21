import { describe, it, expect } from 'vitest'
import { getSemanasDoMes, encontrarSemanaDaData, normalizarParaDataISO } from '@/lib/semanas'

describe('Cálculo de Semanas do Mês (JP-Class)', () => {
  it('deve calcular exatamente o exemplo do usuário para Outubro de 2026', () => {
    // Exemplo verbatim do usuário:
    // Semana 1: 05/10 (segunda) a 11/10 (domingo) — 7 dias
    // Semana 2: 12/10 (segunda) a 18/10 (domingo) — 7 dias
    // Semana 3: 19/10 (segunda) a 25/10 (domingo) — 7 dias
    // Semana 4: 26/10 (segunda) a 01/11 (domingo) — 7 dias
    // Observação: 01 e 02/10 ficam fora da contagem, pois antecedem a primeira segunda-feira do mês.
    const semanas = getSemanasDoMes(2026, 10)

    expect(semanas).toHaveLength(4)

    expect(semanas[0].nome).toBe('Semana 1')
    expect(semanas[0].inicioStr).toBe('2026-10-05')
    expect(semanas[0].fimStr).toBe('2026-10-11')
    expect(semanas[0].inicioFormatado).toBe('05/10')
    expect(semanas[0].fimFormatado).toBe('11/10')
    expect(semanas[0].dias).toBe(7)

    expect(semanas[1].nome).toBe('Semana 2')
    expect(semanas[1].inicioStr).toBe('2026-10-12')
    expect(semanas[1].fimStr).toBe('2026-10-18')
    expect(semanas[1].inicioFormatado).toBe('12/10')
    expect(semanas[1].fimFormatado).toBe('18/10')
    expect(semanas[1].dias).toBe(7)

    expect(semanas[2].nome).toBe('Semana 3')
    expect(semanas[2].inicioStr).toBe('2026-10-19')
    expect(semanas[2].fimStr).toBe('2026-10-25')
    expect(semanas[2].inicioFormatado).toBe('19/10')
    expect(semanas[2].fimFormatado).toBe('25/10')
    expect(semanas[2].dias).toBe(7)

    expect(semanas[3].nome).toBe('Semana 4')
    expect(semanas[3].inicioStr).toBe('2026-10-26')
    expect(semanas[3].fimStr).toBe('2026-11-01')
    expect(semanas[3].inicioFormatado).toBe('26/10')
    expect(semanas[3].fimFormatado).toBe('01/11')
    expect(semanas[3].dias).toBe(7)
  })

  it('deve deixar 01 e 02/10/2026 fora de qualquer semana', () => {
    const semanas = getSemanasDoMes(2026, 10)

    // 01/10/2026 e 02/10/2026 ficam fora
    expect(encontrarSemanaDaData('2026-10-01', semanas)).toBeNull()
    expect(encontrarSemanaDaData('2026-10-02', semanas)).toBeNull()
    expect(encontrarSemanaDaData('2026-10-03', semanas)).toBeNull()
    expect(encontrarSemanaDaData('2026-10-04', semanas)).toBeNull()

    // 05/10 pertence à Semana 1
    const sem1 = encontrarSemanaDaData('2026-10-05', semanas)
    expect(sem1?.numero).toBe(1)

    // 11/10 pertence à Semana 1
    const sem1Fim = encontrarSemanaDaData('2026-10-11', semanas)
    expect(sem1Fim?.numero).toBe(1)

    // 01/11 (domingo transbordado) pertence à Semana 4
    const sem4Fim = encontrarSemanaDaData('2026-11-01', semanas)
    expect(sem4Fim?.numero).toBe(4)

    // 02/11 pertence à próxima semana (que não começou em outubro, logo não está nas semanas de out)
    expect(encontrarSemanaDaData('2026-11-02', semanas)).toBeNull()
  })

  it('quando o mês já inicia em uma segunda-feira (ex: Setembro de 2025)', () => {
    // 01/09/2025 é segunda-feira
    const semanas = getSemanasDoMes(2025, 9)
    expect(semanas[0].inicioStr).toBe('2025-09-01')
    expect(semanas[0].fimStr).toBe('2025-09-07')
  })

  it('normalizarParaDataISO deve suportar formatos ISO com hora e formato brasileiro DD/MM/YYYY', () => {
    expect(normalizarParaDataISO('2026-09-15 14:30:00')).toBe('2026-09-15')
    expect(normalizarParaDataISO('2026-09-15T00:00:00.000Z')).toBe('2026-09-15')
    expect(normalizarParaDataISO('15/09/2026')).toBe('2026-09-15')
    expect(normalizarParaDataISO('15/09/2026 10:00:00')).toBe('2026-09-15')
    expect(normalizarParaDataISO('')).toBeNull()
    expect(normalizarParaDataISO(null)).toBeNull()
  })

  it('encontrarSemanaDaData deve encontrar a semana mesmo se data_lancamento vier com hora ou formato BR', () => {
    const semanas = getSemanasDoMes(2026, 10)
    // 05/10/2026 com hora
    expect(encontrarSemanaDaData('2026-10-05 15:00:00', semanas)?.numero).toBe(1)
    // 05/10/2026 formato BR
    expect(encontrarSemanaDaData('05/10/2026', semanas)?.numero).toBe(1)
  })
})
