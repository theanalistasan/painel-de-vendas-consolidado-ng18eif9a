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

describe('agregarValoresPorSemana — dedupe de total_nf_sem_frete por NF', () => {
  const semanas = getSemanasDoMes(2026, 10)

  // Mesma NF repetida em 3 itens: total_nf_sem_frete é valor POR NF e deve
  // entrar UMA VEZ na semana (MAX por numero_nfe), não 3x.
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

  it('soma total_nf_sem_frete uma única vez por NF (MAX por numero_nfe)', () => {
    const res = agregarValoresPorSemana(
      [
        venda('NF-1', '2026-10-05', { total_nf_sem_frete: 500 }),
        venda('NF-1', '2026-10-06', { total_nf_sem_frete: 500 }),
        venda('NF-1', '2026-10-07', { total_nf_sem_frete: 500 }),
        venda('NF-2', '2026-10-06', { total_nf_sem_frete: 300 }),
      ],
      semanas,
    )

    // Semana 1: MAX(NF-1) = 500 + MAX(NF-2) = 300 => 800 (e não 500*3 + 300 = 1800)
    expect(res[0].valorTotalNfSemFrete).toBe(800)
    // Campos por item continuam somando por linha
    expect(res[0].valorTotalMercadoria).toBe(400)
    expect(res[0].valorLiquidoTotal).toBe(360)
    expect(res[0].custoTotal).toBe(160)
  })

  it('soma total_nf_sem_frete linha a linha quando numero_nfe vem vazio em todas (fallback compatível com base antiga)', () => {
    const res = agregarValoresPorSemana(
      [
        venda('', '2026-10-05', { total_nf_sem_frete: 500 }),
        venda('', '2026-10-06', { total_nf_sem_frete: 500 }),
      ],
      semanas,
    )
    // Sem numero_nfe, todas caem num único grupo "vazio": MAX = 500 (uma vez por NF "vazia")
    expect(res[0].valorTotalNfSemFrete).toBe(500)
  })

  it('usa o valor máximo quando a mesma NF tem total_nf_sem_frete divergente entre linhas', () => {
    const res = agregarValoresPorSemana(
      [
        venda('NF-9', '2026-10-12', { total_nf_sem_frete: 250 }),
        venda('NF-9', '2026-10-13', { total_nf_sem_frete: 300 }),
        venda('NF-9', '2026-10-14', { total_nf_sem_frete: 300 }),
      ],
      semanas,
    )
    expect(res[1].valorTotalNfSemFrete).toBe(300)
  })

  it('mantém o valor total do mês igual à soma das semanas e semanas sem vendas em R$ 0,00', () => {
    const res = agregarValoresPorSemana(
      [
        venda('NF-1', '2026-10-05', { total_nf_sem_frete: 500 }),
        venda('NF-2', '2026-10-19', { total_nf_sem_frete: 700 }),
      ],
      semanas,
    )
    expect(res[0].valorTotalNfSemFrete).toBe(500)
    expect(res[1].valorTotalNfSemFrete).toBe(700)
    expect(res[2].valorTotalNfSemFrete).toBe(0)
    expect(res[3].valorTotalNfSemFrete).toBe(0)
    const totalMes = res.reduce((acc, s) => acc + s.valorTotalNfSemFrete, 0)
    expect(totalMes).toBe(1200)
  })

  it('mesma NF em semanas diferentes conta uma vez em cada semana', () => {
    // Semana 4 de out/2026 transborda para 01/11: NF com 2 linhas na mesma semana
    const res = agregarValoresPorSemana(
      [
        venda('NF-4', '2026-10-26', { total_nf_sem_frete: 900 }),
        venda('NF-4', '2026-10-27', { total_nf_sem_frete: 900 }),
        venda('NF-4', '2026-11-01', { total_nf_sem_frete: 900 }),
      ],
      semanas,
    )
    // As 3 linhas caem na Semana 4 => MAX único = 900
    expect(res[3].valorTotalNfSemFrete).toBe(900)
    // NF "dividida" entre semanas conta em cada uma (valor por NF em cada recorte)
    const res2 = agregarValoresPorSemana(
      [
        venda('NF-5', '2026-10-11', { total_nf_sem_frete: 400 }),
        venda('NF-5', '2026-10-12', { total_nf_sem_frete: 400 }),
      ],
      semanas,
    )
    expect(res2[0].valorTotalNfSemFrete).toBe(400)
    expect(res2[1].valorTotalNfSemFrete).toBe(400)
  })
})
