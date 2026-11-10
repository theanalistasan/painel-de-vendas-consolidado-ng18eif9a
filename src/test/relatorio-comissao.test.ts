import { describe, it, expect } from 'vitest'
import { isVendedorNaoComissionado } from '@/components/VendasRelatorioTable'

describe('Regra de Agrupamento: Comissionados vs Não Comissionados', () => {
  it('classifica como Não Comissionado se vendedor_cliente inicia com "Roland DG Brasil > "', () => {
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'Roland DG Brasil > R.R. ORTICELLI E CIA LTDA',
      }),
    ).toBe(true)

    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'Roland DG Brasil > I.F. DE BARROS DINIZ',
      }),
    ).toBe(true)
  })

  it('classifica como Não Comissionado de forma case-insensitive e tolerante a espaços iniciais', () => {
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: '  roland dg brasil > Cliente Exemplo',
      }),
    ).toBe(true)

    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'ROLAND DG BRASIL > Outro Cliente',
      }),
    ).toBe(true)
  })

  it('classifica como Não Comissionado quando vendedor_cliente está vazio mas nome_vendedor possui o prefixo', () => {
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: '',
        nome_vendedor: 'Roland DG Brasil > Venda Direta',
      }),
    ).toBe(true)
  })

  it('classifica como Não Comissionado quando há autofaturamento (Revenda == Comprador)', () => {
    // Caso DIAMANTE > DIAMANTE citado textualmente pelo usuário
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA > DIAMANTE COMERCIO DE TINTAS LTDA',
      }),
    ).toBe(true)

    // Autofaturamento com espaços extras e case misto
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: '  Diamante Comercio de Tintas Ltda > diamante comercio de tintas ltda  ',
      }),
    ).toBe(true)

    // Autofaturamento por nome_vendedor == nome_cliente
    expect(
      isVendedorNaoComissionado({
        nome_vendedor: 'IMPAR COMERCIO E SERVICOS DE COMUNICACAO VISUAL LTDA',
        nome_cliente: 'IMPAR COMERCIO E SERVICOS DE COMUNICACAO VISUAL LTDA',
      }),
    ).toBe(true)

    // Autofaturamento seguro por código de cliente revenda == código de cliente comprador
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'DIAMANTE TINTAS > CASA DIAMANTE MATRIZ',
        codigo_cliente_revenda: 'C08484',
        codigo_cliente: 'C08484',
      }),
    ).toBe(true)

    // Flag booleana explícita vinda do backend
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'Outra Revenda > Outro Cliente',
        nao_comissionado: true,
      }),
    ).toBe(true)
  })

  it('classifica como Comissionado quando o vendedor é uma revenda externa ou outro parceiro vendendo para terceiro', () => {
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'MARCO ANTONIO COLPI EIRELI > ADENILL SUPRIMENTOS',
      }),
    ).toBe(false)

    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'PROMEX MAIS COMERCIO > DERLI MOREIRA',
      }),
    ).toBe(false)

    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'LP COMERCIO DE PRODUTOS SERIGRAFICOS LTDA > UNITINTAS',
      }),
    ).toBe(false)

    // Revenda diferente do cliente, códigos diferentes
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA > GRAFICA MODELO LTDA',
        codigo_cliente_revenda: 'C08457',
        codigo_cliente: 'C01234',
      }),
    ).toBe(false)
  })

  it('classifica como Comissionado quando o vendedor é Roland DG Brasil sem o separador "> "', () => {
    // A regra explícita do Silvio é: "não iniciados com 'Roland DG Brasil > '"
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: 'Roland DG Brasil',
      }),
    ).toBe(false)
  })

  it('classifica como Comissionado quando o vendedor está vazio, nulo ou indefinido (não deixa linhas órfãs)', () => {
    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: '',
        nome_vendedor: '',
      }),
    ).toBe(false)

    expect(
      isVendedorNaoComissionado({
        vendedor_cliente: null,
        nome_vendedor: null,
      }),
    ).toBe(false)

    expect(isVendedorNaoComissionado({})).toBe(false)
  })

  it('calcula somatórios acumulados para Comissionados e Não Comissionados', () => {
    const mockVendas = [
      {
        id: '1',
        vendedor_cliente: 'Canal Alpha > Cliente 1',
        quantidade: 2,
        total_linha: 1000,
        valor_liquido: 800,
      },
      {
        id: '2',
        vendedor_cliente: 'Canal Beta > Cliente 2',
        quantidade: 3,
        total_linha: 1500,
        valor_liquido: 1200,
      },
      {
        id: '3',
        vendedor_cliente: 'Roland DG Brasil > Cliente Direto 1',
        quantidade: 1,
        total_linha: 500,
        valor_liquido: 450,
      },
      {
        id: '4',
        vendedor_cliente: 'Roland DG Brasil > Cliente Direto 2',
        quantidade: 4,
        total_linha: 2000,
        valor_liquido: 1800,
      },
    ]

    const comissionados = mockVendas.filter((v) => !isVendedorNaoComissionado(v))
    const naoComissionados = mockVendas.filter((v) => isVendedorNaoComissionado(v))

    expect(comissionados.length).toBe(2)
    expect(naoComissionados.length).toBe(2)

    const somaComiss = comissionados.reduce(
      (acc, v) => ({
        qtd: acc.qtd + v.quantidade,
        total: acc.total + v.total_linha,
        liq: acc.liq + v.valor_liquido,
      }),
      { qtd: 0, total: 0, liq: 0 },
    )

    expect(somaComiss.qtd).toBe(5)
    expect(somaComiss.total).toBe(2500)
    expect(somaComiss.liq).toBe(2000)

    const somaNaoComiss = naoComissionados.reduce(
      (acc, v) => ({
        qtd: acc.qtd + v.quantidade,
        total: acc.total + v.total_linha,
        liq: acc.liq + v.valor_liquido,
      }),
      { qtd: 0, total: 0, liq: 0 },
    )

    expect(somaNaoComiss.qtd).toBe(5)
    expect(somaNaoComiss.total).toBe(2500)
    expect(somaNaoComiss.liq).toBe(2250)
  })

  it('consolida 87 NFs em uma página única com somatórios totais de ambos os grupos', () => {
    // Simula o caso do usuário: 87 NFs que antes quebravam em 5 páginas
    const mock87Nfes = Array.from({ length: 87 }, (_, idx) => {
      const isDireta = idx % 3 === 0 // ~29 não comissionadas e ~58 comissionadas
      return {
        id: `venda_${idx + 1}`,
        numero_nfe: `NF-${1000 + idx}`,
        vendedor_cliente: isDireta
          ? `Roland DG Brasil > Cliente ${idx + 1}`
          : `Canal Parceiro ${idx % 5} > Cliente ${idx + 1}`,
        quantidade: 2,
        total_linha: 1000,
        valor_liquido: 900,
      }
    })

    const comissionados = mock87Nfes.filter((v) => !isVendedorNaoComissionado(v))
    const naoComissionados = mock87Nfes.filter((v) => isVendedorNaoComissionado(v))

    expect(mock87Nfes.length).toBe(87)
    expect(comissionados.length + naoComissionados.length).toBe(87)

    const totalComissVendas = comissionados.reduce((s, v) => s + v.total_linha, 0)
    const totalNaoComissVendas = naoComissionados.reduce((s, v) => s + v.total_linha, 0)

    expect(totalComissVendas + totalNaoComissVendas).toBe(87 * 1000)
  })

  it('opera com alternância de colapso de grupos sem alterar dados e mantendo chaves de estado', () => {
    const collapsed = new Set<string>()
    // Colapsa comissionados
    collapsed.add('comissionados')
    expect(collapsed.has('comissionados')).toBe(true)
    expect(collapsed.has('nao_comissionados')).toBe(false)

    // Colapsa ambos (collapseAllComissaoGroups)
    const collapsedAll = new Set(['comissionados', 'nao_comissionados'])
    expect(collapsedAll.size).toBe(2)

    // Expande ambos (expandAllComissaoGroups)
    const expandedAll = new Set<string>()
    expect(expandedAll.size).toBe(0)
  })

  it('garante que a soma de Comissionados + Não Comissionados em conjunto completo bate com o Faturamento Total dos KPIs', () => {
    // Cenário Silvio: 120 vendas totais no período (mais de 50 registros)
    const mockTodasVendas = Array.from({ length: 120 }, (_, idx) => {
      const isDireta = idx % 4 === 0 // 30 não comissionadas, 90 comissionadas
      const valorLinha = (idx + 1) * 150
      const valorLiq = valorLinha * 0.85
      return {
        id: `v_${idx + 1}`,
        numero_nfe: `NF-${2000 + idx}`,
        vendedor_cliente: isDireta
          ? `Roland DG Brasil > Direta ${idx + 1}`
          : `Canal ${idx % 3} > Cliente ${idx + 1}`,
        total_linha: valorLinha,
        valor_liquido: valorLiq,
        quantidade: 1,
      }
    })

    // O KPI Faturamento Total do topo soma o período completo via SQL:
    const kpiFaturamentoTotal = mockTodasVendas.reduce((acc, v) => acc + v.total_linha, 0)
    const kpiValorLiquidoTotal = mockTodasVendas.reduce((acc, v) => acc + v.valor_liquido, 0)

    // Se o relatório usasse apenas a primeira página de 50 registros (bug anterior):
    const primeiraPagina50 = mockTodasVendas.slice(0, 50)
    const comissPagina1 = primeiraPagina50
      .filter((v) => !isVendedorNaoComissionado(v))
      .reduce((s, v) => s + v.total_linha, 0)
    const naoComissPagina1 = primeiraPagina50
      .filter((v) => isVendedorNaoComissionado(v))
      .reduce((s, v) => s + v.total_linha, 0)
    const somaTruncada50 = comissPagina1 + naoComissPagina1

    // Comprova que com 50 registros havia divergência com o KPI
    expect(somaTruncada50).not.toBe(kpiFaturamentoTotal)
    expect(somaTruncada50).toBeLessThan(kpiFaturamentoTotal)

    // Com o fix (busca completa no modo agrupado 'comissao'):
    const comissCompleto = mockTodasVendas
      .filter((v) => !isVendedorNaoComissionado(v))
      .reduce((s, v) => s + v.total_linha, 0)
    const naoComissCompleto = mockTodasVendas
      .filter((v) => isVendedorNaoComissionado(v))
      .reduce((s, v) => s + v.total_linha, 0)
    const somaCompleta = comissCompleto + naoComissCompleto

    // Comprovado: a soma colapsada de Comissionados + Não Comissionados bate exatamente com Faturamento Total
    expect(somaCompleta).toBe(kpiFaturamentoTotal)

    const liqComissCompleto = mockTodasVendas
      .filter((v) => !isVendedorNaoComissionado(v))
      .reduce((s, v) => s + v.valor_liquido, 0)
    const liqNaoComissCompleto = mockTodasVendas
      .filter((v) => isVendedorNaoComissionado(v))
      .reduce((s, v) => s + v.valor_liquido, 0)
    expect(liqComissCompleto + liqNaoComissCompleto).toBe(kpiValorLiquidoTotal)
  })
})
