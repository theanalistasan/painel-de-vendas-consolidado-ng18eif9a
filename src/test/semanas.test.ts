import { describe, it, expect } from 'vitest'
import {
  getSemanasDoMes,
  encontrarSemanaDaData,
  normalizarParaDataISO,
  agregarValoresPorSemana,
} from '@/lib/semanas'

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

describe('agregarValoresPorSemana — todos os valores SUM linha a linha (regra do usuário)', () => {
  const semanas = getSemanasDoMes(2026, 10)

  // REGRA DO USUÁRIO: "Valor Total (Bruto) é a soma da coluna Valor Total Novo e
  // Valor Líquido (NET) é a soma de Valor Líquido" — SEMPRE SUM, nunca MAX/MIN.
  // Na base real total_nf_novo/total_nf_sem_frete VARIA linha a linha na mesma NF.
  const venda = (
    numeroNfe: string,
    dataLancamento: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    numero_nfe: numeroNfe,
    data_lancamento: dataLancamento,
    total_linha: 100,
    valor_liquido: 90,
    total_nf_sem_frete: 500,
    total_nf_novo: 600,
    custo_total: 40,
    ...overrides,
  })

  it('soma total_nf_novo e total_nf_sem_frete linha a linha, mesmo na mesma NF', () => {
    const res = agregarValoresPorSemana(
      [
        venda('NF-1', '2026-10-05', { total_nf_novo: 600, total_nf_sem_frete: 500 }),
        venda('NF-1', '2026-10-06', { total_nf_novo: 600, total_nf_sem_frete: 500 }),
        venda('NF-1', '2026-10-07', { total_nf_novo: 600, total_nf_sem_frete: 500 }),
        venda('NF-2', '2026-10-06', { total_nf_novo: 400, total_nf_sem_frete: 300 }),
      ],
      semanas,
    )

    // Semana 1: (600+600+600) + 400 = 2200 (SUM, e não MAX por NF = 1000)
    expect(res[0].valorTotalBruto).toBe(2200)
    // Sem frete: (500+500+500) + 300 = 1800 (SUM, e não MAX por NF = 800)
    expect(res[0].valorTotalNfSemFrete).toBe(1800)
    // Campos por item continuam somando por linha
    expect(res[0].valorTotalMercadoria).toBe(400)
    expect(res[0].valorLiquidoTotal).toBe(360)
    expect(res[0].custoTotal).toBe(160)
  })

  it('caso real do bug: total_nf_novo VARIA linha a linha na mesma NF e o MAX subestimava o Bruto', () => {
    // NF 87821 (base real): 1363,06 / 706,13 / 1582,83 — MAX pegaria só 1582,83
    const res = agregarValoresPorSemana(
      [
        venda('87821', '2026-10-05', { total_nf_novo: 1363.06, valor_liquido: 500 }),
        venda('87821', '2026-10-06', { total_nf_novo: 706.13, valor_liquido: 400 }),
        venda('87821', '2026-10-07', { total_nf_novo: 1582.83, valor_liquido: 300 }),
      ],
      semanas,
    )
    // SUM linha a linha = 3652,02
    expect(res[0].valorTotalBruto).toBeCloseTo(3652.02, 2)
    expect(res[0].valorLiquidoTotal).toBeCloseTo(1200, 2)
    // Regra do usuário: Bruto ≥ NET
    expect(res[0].valorTotalBruto).toBeGreaterThanOrEqual(res[0].valorLiquidoTotal)
  })

  it('Bruto ≥ NET consistentemente em semanas com várias NFs', () => {
    const res = agregarValoresPorSemana(
      [
        venda('NF-A', '2026-10-05', { total_nf_novo: 1000, valor_liquido: 900 }),
        venda('NF-A', '2026-10-06', { total_nf_novo: 1200, valor_liquido: 950 }),
        venda('NF-B', '2026-10-08', { total_nf_novo: 2000, valor_liquido: 1800 }),
      ],
      semanas,
    )
    expect(res[0].valorTotalBruto).toBe(4200)
    expect(res[0].valorLiquidoTotal).toBe(3650)
    expect(res[0].valorTotalBruto).toBeGreaterThanOrEqual(res[0].valorLiquidoTotal)
  })

  it('mantém o valor total do mês igual à soma das semanas e semanas sem vendas em R$ 0,00', () => {
    const res = agregarValoresPorSemana(
      [
        venda('NF-1', '2026-10-05', { total_nf_novo: 500 }),
        venda('NF-2', '2026-10-19', { total_nf_novo: 700 }),
      ],
      semanas,
    )
    expect(res[0].valorTotalBruto).toBe(500)
    expect(res[1].valorTotalBruto).toBe(700)
    expect(res[2].valorTotalBruto).toBe(0)
    expect(res[3].valorTotalBruto).toBe(0)
    const totalMes = res.reduce((acc, s) => acc + s.valorTotalBruto, 0)
    expect(totalMes).toBe(1200)
  })

  it('mesma NF em semanas diferentes soma em cada semana', () => {
    // Semana 4 de out/2026 transborda para 01/11
    const res = agregarValoresPorSemana(
      [
        venda('NF-4', '2026-10-26', { total_nf_novo: 900, total_nf_sem_frete: 900 }),
        venda('NF-4', '2026-10-27', { total_nf_novo: 900, total_nf_sem_frete: 900 }),
        venda('NF-4', '2026-11-01', { total_nf_novo: 900, total_nf_sem_frete: 900 }),
      ],
      semanas,
    )
    // As 3 linhas caem na Semana 4 => SUM = 2700
    expect(res[3].valorTotalBruto).toBe(2700)
    expect(res[3].valorTotalNfSemFrete).toBe(2700)
    // NF "dividida" entre semanas soma em cada uma
    const res2 = agregarValoresPorSemana(
      [
        venda('NF-5', '2026-10-11', { total_nf_novo: 400 }),
        venda('NF-5', '2026-10-12', { total_nf_novo: 400 }),
      ],
      semanas,
    )
    expect(res2[0].valorTotalBruto).toBe(400)
    expect(res2[1].valorTotalBruto).toBe(400)
  })
})
