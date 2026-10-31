import { describe, it, expect } from 'vitest'
import { getJpClass, JP_CLASS_OPTIONS } from '@/lib/jp-class'

describe('Regra de Agrupamento JP-Class: Consolidação de Página Única e Somatórios Totais', () => {
  it('agrupa linhas corretamente nas 4 classes canônicas JP-Class', () => {
    const mockVendas = [
      {
        id: '1',
        grupo_item: 'EQUIPAMENTOS',
        quantidade: 2,
        total_linha: 50000,
        valor_liquido: 45000,
      },
      { id: '2', grupo_item: 'TINTAS', quantidade: 10, total_linha: 3000, valor_liquido: 2700 },
      { id: '3', grupo_item: 'PEÇAS', quantidade: 4, total_linha: 1200, valor_liquido: 1000 },
      { id: '4', grupo_item: 'ACESSÓRIOS', quantidade: 1, total_linha: 500, valor_liquido: 450 },
      { id: '5', grupo_item: '', quantidade: 1, total_linha: 200, valor_liquido: 180 },
    ]

    const grouped: Record<string, typeof mockVendas> = {
      HARD: [],
      INKS: [],
      OTHERS: [],
      'Sem classe': [],
    }

    for (const v of mockVendas) {
      const cls = getJpClass(v.grupo_item)
      const target = cls === 'HARD' || cls === 'INKS' || cls === 'OTHERS' ? cls : 'Sem classe'
      grouped[target].push(v)
    }

    expect(grouped.HARD.length).toBe(1)
    expect(grouped.INKS.length).toBe(1)
    expect(grouped.OTHERS.length).toBe(2) // Peças + Acessórios
    expect(grouped['Sem classe'].length).toBe(1)
  })

  it('calcula somatórios acumulados do período completo para cada grupo JP-Class', () => {
    // Simula 120 itens em ~6 páginas no modelo antigo que agora consolidam em página única
    const mock120Items = Array.from({ length: 120 }, (_, idx) => {
      const mod = idx % 4
      const grupo =
        mod === 0 ? 'EQUIPAMENTOS' : mod === 1 ? 'TINTAS' : mod === 2 ? 'PEÇAS' : 'OUTRO GRUPO'
      return {
        id: `venda_${idx + 1}`,
        numero_nfe: `NF-${2000 + Math.floor(idx / 2)}`,
        grupo_item: grupo,
        quantidade: 2,
        total_linha: 1000,
        valor_liquido: 850,
      }
    })

    const map = new Map<string, typeof mock120Items>()
    for (const opt of JP_CLASS_OPTIONS) {
      map.set(opt, [])
    }

    for (const item of mock120Items) {
      const cls = getJpClass(item.grupo_item)
      const standardGroup =
        cls === 'HARD' || cls === 'INKS' || cls === 'OTHERS' ? cls : 'Sem classe'
      map.get(standardGroup)!.push(item)
    }

    const hardItems = map.get('HARD')!
    const inksItems = map.get('INKS')!
    const othersItems = map.get('OTHERS')!

    expect(hardItems.length).toBe(30)
    expect(inksItems.length).toBe(30)
    expect(othersItems.length).toBe(60) // Peças (30) + Outro Grupo (30)

    const somaHard = hardItems.reduce((acc, it) => acc + it.total_linha, 0)
    const somaInks = inksItems.reduce((acc, it) => acc + it.total_linha, 0)
    const somaOthers = othersItems.reduce((acc, it) => acc + it.total_linha, 0)

    expect(somaHard).toBe(30 * 1000)
    expect(somaInks).toBe(30 * 1000)
    expect(somaOthers).toBe(60 * 1000)

    const totalGeral = somaHard + somaInks + somaOthers
    expect(totalGeral).toBe(120 * 1000)
  })

  it('permite colapsar e expandir grupos mantendo chaves de estado estáveis sem alterar os dados', () => {
    // Estado inicial: todos os grupos colapsados
    let collapsedJpGroups = new Set<string>(JP_CLASS_OPTIONS)
    expect(collapsedJpGroups.has('HARD')).toBe(true)
    expect(collapsedJpGroups.has('INKS')).toBe(true)
    expect(collapsedJpGroups.has('OTHERS')).toBe(true)
    expect(collapsedJpGroups.has('Sem classe')).toBe(true)

    // Expande HARD
    collapsedJpGroups = new Set(collapsedJpGroups)
    collapsedJpGroups.delete('HARD')
    expect(collapsedJpGroups.has('HARD')).toBe(false)
    expect(collapsedJpGroups.has('INKS')).toBe(true)

    // Expandir Todos
    collapsedJpGroups = new Set<string>()
    expect(collapsedJpGroups.size).toBe(0)

    // Colapsar Todos
    collapsedJpGroups = new Set<string>(JP_CLASS_OPTIONS)
    expect(collapsedJpGroups.size).toBe(JP_CLASS_OPTIONS.length)
  })
})
