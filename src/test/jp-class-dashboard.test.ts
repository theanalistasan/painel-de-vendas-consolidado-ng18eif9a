import { describe, it, expect } from 'vitest'
import { getJpClass } from '@/lib/jp-class'
import type { VendaComSemana } from '@/components/JpClassRelatorio'

describe('Dashboard JP-Class: Subtotais HARD, INKS e OTHERS por Tipo de Cliente', () => {
  const mockVendas: VendaComSemana[] = [
    {
      id: 'v1',
      grupo_item: 'TINTAS',
      codigo_cliente: 'CLI-001',
      tipo_cliente: 'Comunicação Visual',
      total_linha: 1000,
      quantidade: 10,
    } as unknown as VendaComSemana,
    {
      id: 'v2',
      grupo_item: 'EQUIPAMENTOS',
      codigo_cliente: 'CLI-001',
      tipo_cliente: 'Comunicação Visual',
      total_linha: 50000,
      quantidade: 1,
    } as unknown as VendaComSemana,
    {
      id: 'v3',
      grupo_item: 'PEÇAS',
      codigo_cliente: 'CLI-001',
      tipo_cliente: 'Comunicação Visual',
      total_linha: 500,
      quantidade: 2,
    } as unknown as VendaComSemana,
    {
      id: 'v4',
      grupo_item: 'TINTAS',
      codigo_cliente: 'CLI-002',
      tipo_cliente: '', // Vazio, para testar fallback
      total_linha: 2000,
      quantidade: 20,
    } as unknown as VendaComSemana,
    {
      id: 'v5',
      grupo_item: '', // Sem classe
      codigo_cliente: 'CLI-003',
      tipo_cliente: 'Outros',
      total_linha: 300,
      quantidade: 3,
    } as unknown as VendaComSemana,
  ]

  const tiposClienteMap: Record<string, string> = {
    'CLI-002': 'Gráfica Digital',
  }

  it('deve calcular corretamente os subtotais de HARD, INKS e OTHERS por Tipo de Cliente', () => {
    interface Subtotais {
      hardFaturamento: number
      hardQuantidade: number
      inksFaturamento: number
      inksQuantidade: number
      othersFaturamento: number
      othersQuantidade: number
      semClasseFaturamento: number
      semClasseQuantidade: number
      totalFaturamento: number
      totalQuantidade: number
    }

    const map = new Map<string, Subtotais>()

    for (const it of mockVendas) {
      let tc = (it.tipo_cliente || '').trim()
      if ((!tc || tc === '-') && it.codigo_cliente) {
        const codUpper = it.codigo_cliente.trim().toUpperCase()
        tc = tiposClienteMap[codUpper] || tc || '-'
      }
      if (!tc) tc = '-'

      const cls = getJpClass(it.grupo_item || it.itms_grp_nam)
      const cur = map.get(tc) || {
        hardFaturamento: 0,
        hardQuantidade: 0,
        inksFaturamento: 0,
        inksQuantidade: 0,
        othersFaturamento: 0,
        othersQuantidade: 0,
        semClasseFaturamento: 0,
        semClasseQuantidade: 0,
        totalFaturamento: 0,
        totalQuantidade: 0,
      }

      const fat = Number(it.total_linha) || 0
      const qtd = Number(it.quantidade) || 0

      if (cls === 'HARD') {
        cur.hardFaturamento += fat
        cur.hardQuantidade += qtd
      } else if (cls === 'INKS') {
        cur.inksFaturamento += fat
        cur.inksQuantidade += qtd
      } else if (cls === 'OTHERS') {
        cur.othersFaturamento += fat
        cur.othersQuantidade += qtd
      } else {
        cur.semClasseFaturamento += fat
        cur.semClasseQuantidade += qtd
      }

      cur.totalFaturamento += fat
      cur.totalQuantidade += qtd
      map.set(tc, cur)
    }

    // 1. Tipo 'Comunicação Visual'
    const cv = map.get('Comunicação Visual')
    expect(cv).toBeDefined()
    expect(cv!.hardFaturamento).toBe(50000)
    expect(cv!.hardQuantidade).toBe(1)
    expect(cv!.inksFaturamento).toBe(1000)
    expect(cv!.inksQuantidade).toBe(10)
    expect(cv!.othersFaturamento).toBe(500)
    expect(cv!.othersQuantidade).toBe(2)
    expect(cv!.semClasseFaturamento).toBe(0)
    expect(cv!.totalFaturamento).toBe(51500)
    expect(cv!.totalQuantidade).toBe(13)

    // 2. Tipo 'Gráfica Digital' resolvido via fallback CLI-002
    const gd = map.get('Gráfica Digital')
    expect(gd).toBeDefined()
    expect(gd!.inksFaturamento).toBe(2000)
    expect(gd!.inksQuantidade).toBe(20)
    expect(gd!.hardFaturamento).toBe(0)
    expect(gd!.totalFaturamento).toBe(2000)

    // 3. Tipo 'Outros' com item 'Sem classe'
    const out = map.get('Outros')
    expect(out).toBeDefined()
    expect(out!.semClasseFaturamento).toBe(300)
    expect(out!.semClasseQuantidade).toBe(3)
    expect(out!.hardFaturamento).toBe(0)
    expect(out!.inksFaturamento).toBe(0)
    expect(out!.othersFaturamento).toBe(0)
    expect(out!.totalFaturamento).toBe(300)
  })
})
