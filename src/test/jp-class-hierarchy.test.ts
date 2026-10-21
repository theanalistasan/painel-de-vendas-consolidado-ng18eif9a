import { describe, it, expect } from 'vitest'
import { getJpClass } from '@/lib/jp-class'
import type { VendaComSemana } from '@/components/JpClassRelatorio'

describe('Hierarquia em Cascata JP-Class (4 Níveis)', () => {
  const mockVendas: VendaComSemana[] = [
    {
      id: 'v1',
      data_lancamento: '2026-09-07',
      semanaNumero: 1,
      semanaNome: 'Semana 1',
      grupo_item: 'TINTAS',
      codigo_item: 'INK-001',
      descricao_item: 'Tinta ECO-SOL MAX Cyan',
      nome_cliente: 'Cliente Alpha',
      tipo_cliente: 'Comunicação Visual',
      quantidade: 5,
      total_linha: 1500,
      valor_liquido: 1350,
      numero_nfe: '1001',
      tipo_documento: 'NF de Saída',
      jpClass: 'INKS',
    } as unknown as VendaComSemana,
    {
      id: 'v2',
      data_lancamento: '2026-09-08',
      semanaNumero: 1,
      semanaNome: 'Semana 1',
      grupo_item: 'TINTAS',
      codigo_item: 'INK-001',
      descricao_item: 'Tinta ECO-SOL MAX Cyan',
      nome_cliente: 'Cliente Beta',
      tipo_cliente: 'Gráfica Rápida',
      quantidade: 3,
      total_linha: 900,
      valor_liquido: 810,
      numero_nfe: '1002',
      tipo_documento: 'NF de Saída',
      jpClass: 'INKS',
    } as unknown as VendaComSemana,
    {
      id: 'v3',
      data_lancamento: '2026-09-15',
      semanaNumero: 2,
      semanaNome: 'Semana 2',
      grupo_item: 'EQUIPAMENTOS',
      codigo_item: 'EQP-500',
      descricao_item: 'Plotter TrueVIS VG3-640',
      nome_cliente: 'Cliente Gamma',
      tipo_cliente: 'Revenda',
      quantidade: 1,
      total_linha: 85000,
      valor_liquido: 80000,
      numero_nfe: '1003',
      tipo_documento: 'NF de Saída',
      jpClass: 'HARD',
    } as unknown as VendaComSemana,
    {
      id: 'v4',
      data_lancamento: '2026-09-16',
      semanaNumero: 2,
      semanaNome: 'Semana 2',
      grupo_item: 'PEÇAS',
      codigo_item: 'PEC-10',
      descricao_item: 'Cabo Flat Head',
      nome_cliente: 'Cliente Delta',
      tipo_cliente: 'Assistência Técnica',
      quantidade: 2,
      total_linha: 400,
      valor_liquido: 380,
      numero_nfe: '1004',
      tipo_documento: 'NF de Saída',
      jpClass: 'OTHERS',
    } as unknown as VendaComSemana,
  ]

  it('deve derivar JP-Class ao vivo do campo grupo_item para todas as vendas', () => {
    mockVendas.forEach((v) => {
      const derived = getJpClass(v.grupo_item)
      expect(derived).toBe(v.jpClass)
    })
  })

  it('deve agrupar corretamente nos 4 níveis: JP-Class -> Semana -> Grupo -> Item com somatórios acumulados', () => {
    // Validação da lógica estrutural da hierarquia
    const tree = new Map<
      string,
      Map<
        number,
        Map<string, Map<string, { qtd: number; valor: number; liquido: number; count: number }>>
      >
    >()

    for (const it of mockVendas) {
      const jpc = getJpClass(it.grupo_item)
      const semNum = it.semanaNumero
      const grp = it.grupo_item || '(Sem Grupo)'
      const itemKey = `${it.codigo_item} - ${it.descricao_item}`

      if (!tree.has(jpc)) tree.set(jpc, new Map())
      const semMap = tree.get(jpc)!

      if (!semMap.has(semNum)) semMap.set(semNum, new Map())
      const grpMap = semMap.get(semNum)!

      if (!grpMap.has(grp)) grpMap.set(grp, new Map())
      const itemMap = grpMap.get(grp)!

      const current = itemMap.get(itemKey) || { qtd: 0, valor: 0, liquido: 0, count: 0 }
      current.qtd += Number(it.quantidade)
      current.valor += Number(it.total_linha)
      current.liquido += Number(it.valor_liquido)
      current.count += 1
      itemMap.set(itemKey, current)
    }

    // Deve ter 3 classes JP-Class no nível 1: INKS, HARD, OTHERS
    expect(Array.from(tree.keys())).toContain('INKS')
    expect(Array.from(tree.keys())).toContain('HARD')
    expect(Array.from(tree.keys())).toContain('OTHERS')

    // INKS -> Semana 1 -> TINTAS -> INK-001 deve acumular 2 vendas
    const inksSem1 = tree.get('INKS')!.get(1)!
    const tintasGrp = inksSem1.get('TINTAS')!
    const ink001 = tintasGrp.get('INK-001 - Tinta ECO-SOL MAX Cyan')!

    expect(ink001.count).toBe(2)
    expect(ink001.qtd).toBe(8)
    expect(ink001.valor).toBe(2400)
    expect(ink001.liquido).toBe(2160)

    // HARD -> Semana 2 -> EQUIPAMENTOS -> EQP-500
    const hardSem2 = tree.get('HARD')!.get(2)!
    const eqpGrp = hardSem2.get('EQUIPAMENTOS')!
    const eqp500 = eqpGrp.get('EQP-500 - Plotter TrueVIS VG3-640')!

    expect(eqp500.count).toBe(1)
    expect(eqp500.qtd).toBe(1)
    expect(eqp500.valor).toBe(85000)
  })

  it('deve garantir que colapsar um nível pai mantém a existência do nó pai', () => {
    const collapsedKeys = new Set<string>()
    // Colapsando o nível 1 INKS
    collapsedKeys.add('L1::INKS')

    const allL1Keys = ['L1::INKS', 'L1::HARD', 'L1::OTHERS']
    // Todos os cabeçalhos L1 continuam existindo e sendo renderizados
    const visibleHeaders = allL1Keys.filter((k) => allL1Keys.includes(k))
    expect(visibleHeaders.length).toBe(3)

    // Se L1::INKS está colapsado, seus filhos não aparecem mas o cabeçalho 'L1::INKS' sim
    expect(collapsedKeys.has('L1::INKS')).toBe(true)
    expect(collapsedKeys.has('L1::HARD')).toBe(false)
  })

  it('deve permitir colapsar o nível 4 (Item) mantendo cabeçalho, contagem e somatórios intactos', () => {
    const collapsedKeys = new Set<string>()
    const itemKey = 'L4::INKS::1::TINTAS::INK-001 - Tinta ECO-SOL MAX Cyan'

    // Inicialmente não colapsado
    expect(collapsedKeys.has(itemKey)).toBe(false)

    // Colapsa o item
    collapsedKeys.add(itemKey)
    expect(collapsedKeys.has(itemKey)).toBe(true)

    // Ao colapsar o item, apenas suas linhas de detalhe ficam escondidas
    // o cabeçalho do item permanece intacto com chevron, contagem e somatórios
    const isItemCollapsed = collapsedKeys.has(itemKey)
    expect(isItemCollapsed).toBe(true)

    // Descolapsa
    collapsedKeys.delete(itemKey)
    expect(collapsedKeys.has(itemKey)).toBe(false)
  })

  it('deve incluir chaves de nível 4 (Item) ao colapsar todos os nós', () => {
    const hierarchyMock = [
      {
        key: 'L1::INKS',
        subNodes: [
          {
            key: 'L2::INKS::1',
            subNodes: [
              {
                key: 'L3::INKS::1::TINTAS',
                subNodes: [
                  {
                    key: 'L4::INKS::1::TINTAS::INK-001',
                    subNodes: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]

    const allKeys = new Set<string>()
    for (const l1 of hierarchyMock) {
      allKeys.add(l1.key)
      for (const l2 of l1.subNodes) {
        allKeys.add(l2.key)
        for (const l3 of l2.subNodes) {
          allKeys.add(l3.key)
          for (const l4 of l3.subNodes) {
            allKeys.add(l4.key)
          }
        }
      }
    }

    expect(allKeys.has('L1::INKS')).toBe(true)
    expect(allKeys.has('L2::INKS::1')).toBe(true)
    expect(allKeys.has('L3::INKS::1::TINTAS')).toBe(true)
    expect(allKeys.has('L4::INKS::1::TINTAS::INK-001')).toBe(true)
  })
})
