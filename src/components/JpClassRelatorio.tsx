import React, { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ArrowUpDown,
  Search,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { getJpClass, getJpClassBadgeStyle } from '@/lib/jp-class'
import type { SemanaMes } from '@/lib/semanas'
import type { VendaConsolidada } from '@/types/sales'

export interface VendaComSemana extends VendaConsolidada {
  semanaNumero: number
  semanaNome: string
  jpClass: string
}

export type JpClassGroupBy = 'hierarquia' | 'none' | 'jp_class' | 'item' | 'grupo' | 'tipo_cliente'

export interface JpClassRelatorioProps {
  items: VendaComSemana[]
  semanas?: SemanaMes[]
  loading?: boolean
  groupBy?: JpClassGroupBy
  onGroupByChange?: (gb: JpClassGroupBy) => void
}

export type SortField =
  | 'nome'
  | 'semana'
  | 'data_lancamento'
  | 'jp_class'
  | 'grupo_item'
  | 'descricao_item'
  | 'nome_cliente'
  | 'tipo_cliente'
  | 'quantidade'
  | 'total_linha'
  | 'valor_liquido'

export type SortDir = 'asc' | 'desc'

// Nós da Hierarquia de 4 Níveis: JP-Class (L1) -> Semana (L2) -> Grupo (L3) -> Item (L4)
export interface Level4ItemNode {
  key: string // `L4::${jpClass}::${semana}::${grupo}::${codigoItem || descricao}`
  itemKey: string
  codigoItem: string
  descricaoItem: string
  items: VendaComSemana[]
  totalQtd: number
  totalValor: number
  totalLiquido: number
  totalLinhas: number
}

export interface Level3GrupoNode {
  key: string // `L3::${jpClass}::${semana}::${grupo}`
  grupoNome: string
  items: VendaComSemana[]
  subNodes: Level4ItemNode[]
  totalQtd: number
  totalValor: number
  totalLiquido: number
  totalLinhas: number
}

export interface Level2SemanaNode {
  key: string // `L2::${jpClass}::${semanaNumero}`
  semanaNumero: number
  semanaNome: string
  items: VendaComSemana[]
  subNodes: Level3GrupoNode[]
  totalQtd: number
  totalValor: number
  totalLiquido: number
  totalLinhas: number
}

export interface Level1JpClassNode {
  key: string // `L1::${jpClass}`
  jpClass: string
  items: VendaComSemana[]
  subNodes: Level2SemanaNode[]
  totalQtd: number
  totalValor: number
  totalLiquido: number
  totalLinhas: number
}

export function JpClassRelatorio({ items, loading = false }: JpClassRelatorioProps) {
  const [sortField, setSortField] = useState<SortField>('nome')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [search, setSearch] = useState('')
  // Controla se o estado inicial (Nível 1 e 2 expandidos, Níveis 3 e 4 colapsados) já foi aplicado
  const [initialCollapseApplied, setInitialCollapseApplied] = useState(false)
  // Controla o estado de colapso de nós da árvore
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())

  // Filtragem local por texto (busca rápida sobre todas as colunas relevantes)
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((it) => {
      const liveJpc = getJpClass(it.grupo_item || it.itms_grp_nam)
      return (
        (it.descricao_item && it.descricao_item.toLowerCase().includes(q)) ||
        (it.codigo_item && it.codigo_item.toLowerCase().includes(q)) ||
        (it.nome_cliente && it.nome_cliente.toLowerCase().includes(q)) ||
        (it.grupo_item && it.grupo_item.toLowerCase().includes(q)) ||
        (it.semanaNome && it.semanaNome.toLowerCase().includes(q)) ||
        liveJpc.toLowerCase().includes(q) ||
        (it.numero_nfe && it.numero_nfe.toLowerCase().includes(q)) ||
        (it.tipo_cliente && it.tipo_cliente.toLowerCase().includes(q))
      )
    })
  }, [items, search])

  // Função auxiliar para comparar nós com base no sortField e sortDir
  const compareNodes = <
    T extends {
      totalValor: number
      totalLiquido: number
      totalQtd: number
      totalLinhas: number
    },
  >(
    a: T,
    b: T,
    nameA: string | number,
    nameB: string | number,
  ): number => {
    let diff = 0
    if (sortField === 'total_linha') {
      diff = a.totalValor - b.totalValor
    } else if (sortField === 'valor_liquido') {
      diff = a.totalLiquido - b.totalLiquido
    } else if (sortField === 'quantidade') {
      diff = a.totalQtd - b.totalQtd
    } else {
      // Ordenação alfanumérica/código/nome/semana
      if (typeof nameA === 'number' && typeof nameB === 'number') {
        diff = nameA - nameB
      } else {
        diff = String(nameA).localeCompare(String(nameB), 'pt-BR')
      }
    }
    return sortDir === 'asc' ? diff : -diff
  }

  // Comparação para as linhas detalhadas (folhas) dentro do nível Item
  const sortDetailRows = (rows: VendaComSemana[]) => {
    const list = [...rows]
    list.sort((a, b) => {
      let valA: string | number = ''
      let valB: string | number = ''

      switch (sortField) {
        case 'semana':
          valA = a.semanaNumero
          valB = b.semanaNumero
          break
        case 'jp_class':
          valA = getJpClass(a.grupo_item || a.itms_grp_nam)
          valB = getJpClass(b.grupo_item || b.itms_grp_nam)
          break
        case 'grupo_item':
          valA = a.grupo_item || ''
          valB = b.grupo_item || ''
          break
        case 'descricao_item':
          valA = a.descricao_item || a.codigo_item || ''
          valB = b.descricao_item || b.codigo_item || ''
          break
        case 'nome_cliente':
          valA = a.nome_cliente || ''
          valB = b.nome_cliente || ''
          break
        case 'tipo_cliente':
          valA = a.tipo_cliente || ''
          valB = b.tipo_cliente || ''
          break
        case 'quantidade':
          valA = Number(a.quantidade) || 0
          valB = Number(b.quantidade) || 0
          break
        case 'valor_liquido':
          valA = Number(a.valor_liquido) || 0
          valB = Number(b.valor_liquido) || 0
          break
        case 'data_lancamento':
          valA = a.data_lancamento || ''
          valB = b.data_lancamento || ''
          break
        case 'total_linha':
        default:
          valA = Number(a.total_linha) || 0
          valB = Number(b.total_linha) || 0
          break
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA
      }
      return sortDir === 'asc'
        ? String(valA).localeCompare(String(valB), 'pt-BR')
        : String(valB).localeCompare(String(valA), 'pt-BR')
    })
    return list
  }

  // Construção da Hierarquia em Cascata de 4 Níveis: JP-Class -> Semana -> Grupo -> Item
  const hierarchy = useMemo<Level1JpClassNode[]>(() => {
    // 1. Agrupar em mapa multi-nível
    // Map<jpClass, Map<semanaNumero, Map<grupo, Map<itemKey, VendaComSemana[]>>>>
    const tree = new Map<
      string,
      Map<number, { nome: string; grupos: Map<string, Map<string, VendaComSemana[]>> }>
    >()

    for (const it of filteredItems) {
      // REGRA OBRIGATÓRIA: Derivação de JP-Class SEMPRE ao vivo a partir do Grupo
      const jpc = getJpClass(it.grupo_item || it.itms_grp_nam)
      const semNum = it.semanaNumero || 0
      const semNome = it.semanaNome || `Semana ${semNum}`
      const grp = (it.grupo_item || it.itms_grp_nam || '(Sem Grupo)').trim()
      const itemKey =
        (it.codigo_item ? `${it.codigo_item} - ${it.descricao_item || ''}` : it.descricao_item) ||
        '(Sem Item)'

      if (!tree.has(jpc)) {
        tree.set(jpc, new Map())
      }
      const jpcMap = tree.get(jpc)!

      if (!jpcMap.has(semNum)) {
        jpcMap.set(semNum, { nome: semNome, grupos: new Map() })
      }
      const semData = jpcMap.get(semNum)!

      if (!semData.grupos.has(grp)) {
        semData.grupos.set(grp, new Map())
      }
      const grpMap = semData.grupos.get(grp)!

      if (!grpMap.has(itemKey)) {
        grpMap.set(itemKey, [])
      }
      grpMap.get(itemKey)!.push(it)
    }

    // 2. Converter mapa em árvore estruturada com somatórios acumulados
    const l1Nodes: Level1JpClassNode[] = []

    for (const [jpc, semMap] of tree.entries()) {
      const l2Nodes: Level2SemanaNode[] = []
      let l1Qtd = 0
      let l1Valor = 0
      let l1Liquido = 0
      const l1Items: VendaComSemana[] = []

      for (const [semNum, semData] of semMap.entries()) {
        const l3Nodes: Level3GrupoNode[] = []
        let l2Qtd = 0
        let l2Valor = 0
        let l2Liquido = 0
        const l2Items: VendaComSemana[] = []

        for (const [grpNome, itemMap] of semData.grupos.entries()) {
          const l4Nodes: Level4ItemNode[] = []
          let l3Qtd = 0
          let l3Valor = 0
          let l3Liquido = 0
          const l3Items: VendaComSemana[] = []

          for (const [itemKey, vList] of itemMap.entries()) {
            let l4Qtd = 0
            let l4Valor = 0
            let l4Liquido = 0
            const first = vList[0]
            const codigoItem = first?.codigo_item || ''
            const descricaoItem = first?.descricao_item || itemKey

            for (const v of vList) {
              const q = Number(v.quantidade) || 0
              const val = Number(v.total_linha) || 0
              const liq = Number(v.valor_liquido) || 0
              l4Qtd += q
              l4Valor += val
              l4Liquido += liq
            }

            l4Nodes.push({
              key: `L4::${jpc}::${semNum}::${grpNome}::${itemKey}`,
              itemKey,
              codigoItem,
              descricaoItem,
              items: vList,
              totalQtd: l4Qtd,
              totalValor: l4Valor,
              totalLiquido: l4Liquido,
              totalLinhas: vList.length,
            })

            l3Qtd += l4Qtd
            l3Valor += l4Valor
            l3Liquido += l4Liquido
            l3Items.push(...vList)
          }

          // Ordenar L4 (Itens): ordem alfabética crescente (A→Z) por padrão ou por métrica se clicado
          l4Nodes.sort((a, b) => {
            if (
              sortField === 'total_linha' ||
              sortField === 'valor_liquido' ||
              sortField === 'quantidade'
            ) {
              return compareNodes(
                a,
                b,
                a.descricaoItem || a.codigoItem,
                b.descricaoItem || b.codigoItem,
              )
            }
            const labelA = a.descricaoItem || a.codigoItem || ''
            const labelB = b.descricaoItem || b.codigoItem || ''
            const cmp = labelA.localeCompare(labelB, 'pt-BR', {
              sensitivity: 'base',
              numeric: true,
            })
            return sortField === 'nome' && sortDir === 'desc' ? -cmp : cmp
          })

          l3Nodes.push({
            key: `L3::${jpc}::${semNum}::${grpNome}`,
            grupoNome: grpNome,
            items: l3Items,
            subNodes: l4Nodes,
            totalQtd: l3Qtd,
            totalValor: l3Valor,
            totalLiquido: l3Liquido,
            totalLinhas: l3Items.length,
          })

          l2Qtd += l3Qtd
          l2Valor += l3Valor
          l2Liquido += l3Liquido
          l2Items.push(...l3Items)
        }

        // Ordenar L3 (Grupos): ordem alfabética crescente (A→Z) por padrão ou por métrica se clicado
        l3Nodes.sort((a, b) => {
          if (
            sortField === 'total_linha' ||
            sortField === 'valor_liquido' ||
            sortField === 'quantidade'
          ) {
            return compareNodes(a, b, a.grupoNome, b.grupoNome)
          }
          const cmp = a.grupoNome.localeCompare(b.grupoNome, 'pt-BR', {
            sensitivity: 'base',
            numeric: true,
          })
          return sortField === 'nome' && sortDir === 'desc' ? -cmp : cmp
        })

        l2Nodes.push({
          key: `L2::${jpc}::${semNum}`,
          semanaNumero: semNum,
          semanaNome: semData.nome,
          items: l2Items,
          subNodes: l3Nodes,
          totalQtd: l2Qtd,
          totalValor: l2Valor,
          totalLiquido: l2Liquido,
          totalLinhas: l2Items.length,
        })

        l1Qtd += l2Qtd
        l1Valor += l2Valor
        l1Liquido += l2Liquido
        l1Items.push(...l2Items)
      }

      // Ordenar L2 (Semanas): ordem alfabética natural crescente (A→Z: "Semana 1", "Semana 2", ...) por padrão ou por métrica se clicado
      l2Nodes.sort((a, b) => {
        if (
          sortField === 'total_linha' ||
          sortField === 'valor_liquido' ||
          sortField === 'quantidade'
        ) {
          return compareNodes(a, b, a.semanaNome, b.semanaNome)
        }
        const cmp = a.semanaNome.localeCompare(b.semanaNome, 'pt-BR', {
          sensitivity: 'base',
          numeric: true,
        })
        return sortField === 'nome' && sortDir === 'desc' ? -cmp : cmp
      })

      l1Nodes.push({
        key: `L1::${jpc}`,
        jpClass: jpc,
        items: l1Items,
        subNodes: l2Nodes,
        totalQtd: l1Qtd,
        totalValor: l1Valor,
        totalLiquido: l1Liquido,
        totalLinhas: l1Items.length,
      })
    }

    // Ordenar L1 (JP-Class): ordem alfabética crescente (A→Z: HARD, INKS, OTHERS, Sem classe) por padrão ou por métrica se clicado
    l1Nodes.sort((a, b) => {
      if (
        sortField === 'total_linha' ||
        sortField === 'valor_liquido' ||
        sortField === 'quantidade'
      ) {
        return compareNodes(a, b, a.jpClass, b.jpClass)
      }
      const cmp = a.jpClass.localeCompare(b.jpClass, 'pt-BR', {
        sensitivity: 'base',
        numeric: true,
      })
      return sortField === 'nome' && sortDir === 'desc' ? -cmp : cmp
    })

    return l1Nodes
  }, [filteredItems, sortField, sortDir])

  // Manipulação de ordenação via cabeçalho de coluna
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(
        field === 'total_linha' || field === 'valor_liquido' || field === 'quantidade'
          ? 'desc'
          : 'asc',
      )
    }
  }

  // Alternar colapso de nó específico
  const toggleCollapse = (key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Expandir Todos: limpa todos os nós colapsados
  const expandAll = () => {
    setCollapsedKeys(new Set())
  }

  // Colapsar Todos: colapsa todos os níveis colapsáveis (L1, L2, L3 e L4)
  // mantendo apenas os cabeçalhos visíveis de forma consistente
  const collapseAll = () => {
    const allKeys = new Set<string>()
    for (const l1 of hierarchy) {
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
    setCollapsedKeys(allKeys)
  }

  // Estado inicial padrão: "Nível 1 e 2"
  // Nós de JP-Class (L1) EXPANDIDOS (não incluídos em collapsedKeys)
  // Nós de Semana (L2), Grupo (L3) e Item (L4) COLAPSADOS (incluídos em collapsedKeys)
  // Aplica automaticamente na primeira vez que a hierarquia carregar dados.
  React.useEffect(() => {
    if (!initialCollapseApplied && hierarchy.length > 0 && !loading) {
      const defaultCollapsed = new Set<string>()
      for (const l1 of hierarchy) {
        // L1 (JP-Class) permanece EXPANDIDO (não entra em defaultCollapsed)
        for (const l2 of l1.subNodes) {
          // L2 (Semana) começa COLAPSADO para ocultar L3 (Grupo)
          defaultCollapsed.add(l2.key)
          for (const l3 of l2.subNodes) {
            // L3 (Grupo) começa COLAPSADO para ocultar L4 (Item)
            defaultCollapsed.add(l3.key)
            for (const l4 of l3.subNodes) {
              // L4 (Item) começa COLAPSADO para ocultar as linhas de vendas
              defaultCollapsed.add(l4.key)
            }
          }
        }
      }
      setCollapsedKeys(defaultCollapsed)
      setInitialCollapseApplied(true)
    }
  }, [hierarchy, loading, initialCollapseApplied])

  // Retorna true se a ordenação atual é por valores numéricos (total_linha, valor_liquido, quantidade)
  const isNumericSort =
    sortField === 'total_linha' || sortField === 'valor_liquido' || sortField === 'quantidade'

  // Retorna o rótulo de indicação da ordenação atual
  const getSortDescription = () => {
    if (isNumericSort) {
      const fieldName =
        sortField === 'total_linha'
          ? 'Total de Vendas'
          : sortField === 'valor_liquido'
            ? 'Valor Líquido'
            : 'Quantidade'
      return `${fieldName} (${sortDir === 'desc' ? 'Maior → Menor' : 'Menor → Maior'})`
    }
    return `Ordem Alfabética (${sortDir === 'desc' && sortField === 'nome' ? 'Z → A' : 'A → Z'})`
  }

  // Totais consolidados do rodapé
  const totalGeral = useMemo(() => {
    let qtd = 0
    let valor = 0
    let liquido = 0
    for (const it of filteredItems) {
      qtd += Number(it.quantidade) || 0
      valor += Number(it.total_linha) || 0
      liquido += Number(it.valor_liquido) || 0
    }
    return {
      linhas: filteredItems.length,
      qtd,
      valor,
      liquido,
    }
  }, [filteredItems])

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-40 ml-1 inline-block" />
    }
    return (
      <span className="text-[10px] text-[#0B6E99] font-black ml-1 inline-block">
        {sortDir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      {/* Barra de Controles do Relatório */}
      <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Identificação da Hierarquia & Ações Globais */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-sky-50/80 border border-sky-200 rounded-lg px-2.5 py-1 text-xs text-[#084F6E] font-bold">
            <Layers className="w-4 h-4 text-[#0B6E99]" />
            <span>Hierarquia em Cascata:</span>
            <span className="text-slate-500 font-normal">JP-Class → Semana → Grupo → Item</span>
          </div>

          {/* Botões Expandir Todos / Colapsar Todos */}
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={expandAll}
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1 h-8"
              title="Expandir todas as categorias e níveis da hierarquia"
            >
              <ChevronsUpDown className="w-3.5 h-3.5 text-[#0B6E99]" />
              Expandir Todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={collapseAll}
              className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1 h-8"
              title="Colapsar todos os níveis da hierarquia (cabeçalhos permanecem visíveis)"
            >
              <ChevronsDownUp className="w-3.5 h-3.5 text-[#0B6E99]" />
              Colapsar Todos
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSortField('nome')
                setSortDir('asc')
              }}
              className="text-xs text-[#0B6E99] hover:bg-sky-50 h-8 gap-1 font-medium"
              title="Redefinir ordenação para Ordem Alfabética A→Z em todos os níveis"
            >
              <ArrowUpDown className="w-3 h-3 text-[#0B6E99]" />
              A→Z Padrão
            </Button>
          </div>
        </div>

        {/* Busca rápida */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na hierarquia (item, grupo, cliente)..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#0B6E99] text-slate-800"
          />
        </div>
      </div>

      {/* Conteúdo da Tabela Hierárquica */}
      <div className="overflow-auto max-h-[75vh] custom-scrollbar scrollbar-always-visible border-b border-slate-200">
        <table className="w-full text-left text-xs border-collapse min-w-[1020px]">
          <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-20">
            <tr>
              <th
                onClick={() => handleSort('nome')}
                className="py-3 px-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 min-w-[320px] whitespace-nowrap"
              >
                <span>Nível / Estrutura Hierárquica</span>
                {renderSortIndicator('nome')}
              </th>
              <th
                onClick={() => handleSort('data_lancamento')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-28 whitespace-nowrap"
              >
                <span>Data Lanç.</span>
                {renderSortIndicator('data_lancamento')}
              </th>
              <th
                onClick={() => handleSort('nome_cliente')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 min-w-[180px]"
              >
                <span>Cliente</span>
                {renderSortIndicator('nome_cliente')}
              </th>
              <th
                onClick={() => handleSort('tipo_cliente')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-32 whitespace-nowrap"
              >
                <span>Tipo Cliente</span>
                {renderSortIndicator('tipo_cliente')}
              </th>
              <th
                onClick={() => handleSort('quantidade')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-24 whitespace-nowrap"
              >
                <span>Qtde</span>
                {renderSortIndicator('quantidade')}
              </th>
              <th
                onClick={() => handleSort('total_linha')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-36 whitespace-nowrap"
              >
                <span>Total Vendas</span>
                {renderSortIndicator('total_linha')}
              </th>
              <th
                onClick={() => handleSort('valor_liquido')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors w-36 whitespace-nowrap"
              >
                <span>Valor Líquido</span>
                {renderSortIndicator('valor_liquido')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
                    <span>Carregando dados de vendas do período...</span>
                  </div>
                </td>
              </tr>
            ) : hierarchy.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-slate-500">
                  <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">
                    Nenhuma venda encontrada nas semanas deste mês
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Lembre-se: vendas anteriores à primeira segunda-feira do mês não entram nas
                    semanas.
                  </p>
                </td>
              </tr>
            ) : (
              /* RENDERIZAÇÃO DA HIERARQUIA EM CASCATA DE 4 NÍVEIS */
              hierarchy.map((l1) => {
                const isL1Collapsed = collapsedKeys.has(l1.key)
                const l1Badge = getJpClassBadgeStyle(l1.jpClass)

                return (
                  <React.Fragment key={l1.key}>
                    {/* ========================================================= */}
                    {/* NÍVEL 1: JP-Class (HARD, INKS, OTHERS, Sem classe)        */}
                    {/* Nunca desaparece quando colapsado; apenas seus filhos somem */}
                    {/* ========================================================= */}
                    <tr
                      onClick={() => toggleCollapse(l1.key)}
                      className={`cursor-pointer transition-colors border-y-2 select-none font-bold ${
                        isL1Collapsed
                          ? 'bg-slate-100 hover:bg-slate-200/80 border-slate-300 text-slate-800'
                          : 'bg-sky-50/90 hover:bg-sky-100/80 border-sky-300 text-slate-900'
                      }`}
                    >
                      <td colSpan={4} className="py-2.5 px-3.5 border-r border-slate-200/80">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCollapse(l1.key)
                            }}
                            className="p-1 rounded text-slate-600 hover:text-slate-900 hover:bg-black/5 transition-colors"
                            title={isL1Collapsed ? 'Expandir JP-Class' : 'Colapsar JP-Class'}
                          >
                            {isL1Collapsed ? (
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#0B6E99]" />
                            )}
                          </button>

                          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200">
                            Nível 1 • JP-Class
                          </span>

                          <Badge
                            variant="outline"
                            className={`text-xs px-2.5 py-0.5 font-extrabold shadow-2xs ${l1Badge.className}`}
                          >
                            {l1.jpClass}
                          </Badge>

                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-slate-200/90 text-slate-700 font-bold px-2 py-0"
                          >
                            {l1.totalLinhas} {l1.totalLinhas === 1 ? 'linha' : 'linhas'} •{' '}
                            {l1.subNodes.length} semana{l1.subNodes.length > 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </td>

                      {/* Somatório Quantidade L1 */}
                      <td className="py-2.5 px-3 text-right border-r border-slate-200/80 font-bold text-slate-900 tabular-nums">
                        {formatNumber(l1.totalQtd)}
                      </td>

                      {/* Somatório Faturamento L1 */}
                      <td className="py-2.5 px-3 text-right border-r border-slate-200/80 font-black text-emerald-800 tabular-nums text-xs">
                        {formatCurrency(l1.totalValor)}
                      </td>

                      {/* Somatório Valor Líquido L1 */}
                      <td className="py-2.5 px-3 text-right font-black text-teal-800 tabular-nums text-xs">
                        {formatCurrency(l1.totalLiquido)}
                      </td>
                    </tr>

                    {/* Filhos do Nível 1: renderizados apenas se Nível 1 não estiver colapsado */}
                    {!isL1Collapsed &&
                      l1.subNodes.map((l2) => {
                        const isL2Collapsed = collapsedKeys.has(l2.key)

                        return (
                          <React.Fragment key={l2.key}>
                            {/* ========================================================= */}
                            {/* NÍVEL 2: Semana (Semana 1, Semana 2, ...)                 */}
                            {/* ========================================================= */}
                            <tr
                              onClick={() => toggleCollapse(l2.key)}
                              className={`cursor-pointer transition-colors border-y select-none font-semibold ${
                                isL2Collapsed
                                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                                  : 'bg-indigo-50/40 hover:bg-indigo-50/80 border-indigo-200/80 text-slate-900'
                              }`}
                            >
                              <td
                                colSpan={4}
                                className="py-2 px-3.5 border-r border-slate-200/60 pl-8"
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleCollapse(l2.key)
                                    }}
                                    className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-black/5 transition-colors"
                                    title={isL2Collapsed ? 'Expandir Semana' : 'Colapsar Semana'}
                                  >
                                    {isL2Collapsed ? (
                                      <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5 text-indigo-600" />
                                    )}
                                  </button>

                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-white text-indigo-900 border-indigo-200 font-bold px-2 py-0.5"
                                  >
                                    {l2.semanaNome}
                                  </Badge>

                                  <span className="text-[11px] text-slate-500 font-medium">
                                    {l2.subNodes.length} grupo{l2.subNodes.length > 1 ? 's' : ''}
                                  </span>

                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] bg-slate-200/70 text-slate-600 font-semibold px-1.5 py-0"
                                  >
                                    {l2.totalLinhas} {l2.totalLinhas === 1 ? 'linha' : 'linhas'}
                                  </Badge>
                                </div>
                              </td>

                              {/* Somatório Quantidade L2 */}
                              <td className="py-2 px-3 text-right border-r border-slate-200/60 font-semibold text-slate-800 tabular-nums">
                                {formatNumber(l2.totalQtd)}
                              </td>

                              {/* Somatório Faturamento L2 */}
                              <td className="py-2 px-3 text-right border-r border-slate-200/60 font-bold text-emerald-700 tabular-nums">
                                {formatCurrency(l2.totalValor)}
                              </td>

                              {/* Somatório Valor Líquido L2 */}
                              <td className="py-2 px-3 text-right font-bold text-teal-700 tabular-nums">
                                {formatCurrency(l2.totalLiquido)}
                              </td>
                            </tr>

                            {/* Filhos do Nível 2: renderizados apenas se Nível 2 não estiver colapsado */}
                            {!isL2Collapsed &&
                              l2.subNodes.map((l3) => {
                                const isL3Collapsed = collapsedKeys.has(l3.key)

                                return (
                                  <React.Fragment key={l3.key}>
                                    {/* ========================================================= */}
                                    {/* NÍVEL 3: Grupo (EQUIPAMENTOS, TINTAS, PEÇAS...)           */}
                                    {/* ========================================================= */}
                                    <tr
                                      onClick={() => toggleCollapse(l3.key)}
                                      className={`cursor-pointer transition-colors border-y select-none font-medium ${
                                        isL3Collapsed
                                          ? 'bg-slate-50/60 hover:bg-slate-100/60 border-slate-200 text-slate-700'
                                          : 'bg-amber-50/30 hover:bg-amber-50/70 border-amber-200/70 text-slate-900'
                                      }`}
                                    >
                                      <td
                                        colSpan={4}
                                        className="py-1.5 px-3.5 border-r border-slate-200/60 pl-14"
                                      >
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              toggleCollapse(l3.key)
                                            }}
                                            className="p-0.5 rounded text-slate-500 hover:text-slate-800 hover:bg-black/5 transition-colors"
                                            title={
                                              isL3Collapsed ? 'Expandir Grupo' : 'Colapsar Grupo'
                                            }
                                          >
                                            {isL3Collapsed ? (
                                              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                            ) : (
                                              <ChevronDown className="w-3.5 h-3.5 text-amber-600" />
                                            )}
                                          </button>

                                          <span className="text-xs font-bold text-slate-800">
                                            {l3.grupoNome}
                                          </span>

                                          <Badge
                                            variant="outline"
                                            className="text-[10px] bg-white text-slate-600 border-slate-200"
                                          >
                                            Grupo
                                          </Badge>

                                          <span className="text-[11px] text-slate-400">
                                            {l3.subNodes.length} ite
                                            {l3.subNodes.length > 1 ? 'ns' : 'm'}
                                          </span>

                                          <Badge
                                            variant="secondary"
                                            className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0"
                                          >
                                            {l3.totalLinhas}{' '}
                                            {l3.totalLinhas === 1 ? 'linha' : 'linhas'}
                                          </Badge>
                                        </div>
                                      </td>

                                      {/* Somatório Quantidade L3 */}
                                      <td className="py-1.5 px-3 text-right border-r border-slate-200/60 text-slate-700 tabular-nums">
                                        {formatNumber(l3.totalQtd)}
                                      </td>

                                      {/* Somatório Faturamento L3 */}
                                      <td className="py-1.5 px-3 text-right border-r border-slate-200/60 font-semibold text-slate-900 tabular-nums">
                                        {formatCurrency(l3.totalValor)}
                                      </td>

                                      {/* Somatório Valor Líquido L3 */}
                                      <td className="py-1.5 px-3 text-right font-semibold text-teal-800 tabular-nums">
                                        {formatCurrency(l3.totalLiquido)}
                                      </td>
                                    </tr>

                                    {/* Filhos do Nível 3: renderizados apenas se Nível 3 não estiver colapsado */}
                                    {!isL3Collapsed &&
                                      l3.subNodes.map((l4) => {
                                        const isL4Collapsed = collapsedKeys.has(l4.key)

                                        return (
                                          <React.Fragment key={l4.key}>
                                            {/* ========================================================= */}
                                            {/* NÍVEL 4: Item (Produto)                                   */}
                                            {/* ========================================================= */}
                                            <tr
                                              onClick={() => toggleCollapse(l4.key)}
                                              className={`cursor-pointer transition-colors border-y select-none ${
                                                isL4Collapsed
                                                  ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-100'
                                                  : 'bg-emerald-50/20 hover:bg-emerald-50/50 text-slate-900 border-emerald-100'
                                              }`}
                                            >
                                              <td
                                                colSpan={4}
                                                className="py-1.5 px-3.5 border-r border-slate-100 pl-20"
                                              >
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      toggleCollapse(l4.key)
                                                    }}
                                                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 transition-colors"
                                                    title={
                                                      isL4Collapsed
                                                        ? 'Expandir detalhes das vendas do item'
                                                        : 'Colapsar vendas do item'
                                                    }
                                                  >
                                                    {isL4Collapsed ? (
                                                      <ChevronRight className="w-3 h-3 text-slate-400" />
                                                    ) : (
                                                      <ChevronDown className="w-3 h-3 text-emerald-600" />
                                                    )}
                                                  </button>

                                                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[280px]">
                                                    {l4.descricaoItem}
                                                  </span>

                                                  {l4.codigoItem && (
                                                    <span className="text-[10px] text-slate-400 font-mono">
                                                      [{l4.codigoItem}]
                                                    </span>
                                                  )}

                                                  <Badge
                                                    variant="secondary"
                                                    className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0 ml-1"
                                                  >
                                                    {l4.totalLinhas}{' '}
                                                    {l4.totalLinhas === 1 ? 'venda' : 'vendas'}
                                                  </Badge>
                                                </div>
                                              </td>

                                              {/* Somatório Quantidade L4 */}
                                              <td className="py-1.5 px-3 text-right border-r border-slate-100 text-slate-700 font-medium tabular-nums">
                                                {formatNumber(l4.totalQtd)}
                                              </td>

                                              {/* Somatório Faturamento L4 */}
                                              <td className="py-1.5 px-3 text-right border-r border-slate-100 font-semibold text-slate-800 tabular-nums">
                                                {formatCurrency(l4.totalValor)}
                                              </td>

                                              {/* Somatório Valor Líquido L4 */}
                                              <td className="py-1.5 px-3 text-right font-semibold text-teal-700 tabular-nums">
                                                {formatCurrency(l4.totalLiquido)}
                                              </td>
                                            </tr>

                                            {/* Linhas detalhadas de vendas (folhas da árvore) quando Item expandido */}
                                            {!isL4Collapsed &&
                                              sortDetailRows(l4.items).map((venda) => (
                                                <tr
                                                  key={venda.id}
                                                  className="hover:bg-slate-50/80 transition-colors bg-slate-50/20 text-slate-600"
                                                >
                                                  {/* Coluna 1: Espaçamento de folha com identificador da NF/Item */}
                                                  <td className="py-1.5 px-3.5 border-r border-slate-100 pl-28 text-[11px]">
                                                    <div className="flex items-center gap-1.5">
                                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                      <span className="font-mono text-slate-600">
                                                        NF {venda.numero_nfe || '-'}
                                                      </span>
                                                      {venda.tipo_documento && (
                                                        <Badge
                                                          variant="outline"
                                                          className="text-[9px] bg-white text-slate-500 border-slate-200 py-0 px-1 font-normal"
                                                        >
                                                          {venda.tipo_documento}
                                                        </Badge>
                                                      )}
                                                    </div>
                                                  </td>

                                                  {/* Coluna 2: Data de Lançamento */}
                                                  <td className="py-1.5 px-3 border-r border-slate-100 whitespace-nowrap text-slate-600 text-[11px]">
                                                    {venda.data_lancamento
                                                      ? venda.data_lancamento
                                                          .slice(0, 10)
                                                          .split('-')
                                                          .reverse()
                                                          .join('/')
                                                      : '-'}
                                                  </td>

                                                  {/* Coluna 3: Cliente */}
                                                  <td className="py-1.5 px-3 border-r border-slate-100 text-slate-700 text-[11px]">
                                                    <div
                                                      className="truncate max-w-[200px]"
                                                      title={venda.nome_cliente}
                                                    >
                                                      {venda.nome_cliente || '-'}
                                                    </div>
                                                  </td>

                                                  {/* Coluna 4: Tipo de Cliente */}
                                                  <td className="py-1.5 px-3 border-r border-slate-100 text-slate-600 whitespace-nowrap text-[11px]">
                                                    <Badge
                                                      variant="outline"
                                                      className="text-[9px] bg-purple-50/50 text-purple-900 border-purple-200 font-medium py-0 px-1.5"
                                                    >
                                                      {venda.tipo_cliente || '-'}
                                                    </Badge>
                                                  </td>

                                                  {/* Coluna 5: Quantidade */}
                                                  <td className="py-1.5 px-3 text-right border-r border-slate-100 text-slate-700 tabular-nums text-[11px]">
                                                    {formatNumber(venda.quantidade)}
                                                  </td>

                                                  {/* Coluna 6: Total Vendas */}
                                                  <td className="py-1.5 px-3 text-right border-r border-slate-100 text-slate-800 tabular-nums text-[11px] font-medium">
                                                    {formatCurrency(venda.total_linha)}
                                                  </td>

                                                  {/* Coluna 7: Valor Líquido */}
                                                  <td className="py-1.5 px-3 text-right font-medium text-teal-700 tabular-nums text-[11px]">
                                                    {formatCurrency(venda.valor_liquido)}
                                                  </td>
                                                </tr>
                                              ))}
                                          </React.Fragment>
                                        )
                                      })}
                                  </React.Fragment>
                                )
                              })}
                          </React.Fragment>
                        )
                      })}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé informativo com total geral consolidado */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#0B6E99]" />
          <span>
            Total do período:{' '}
            <strong className="text-slate-900 font-bold">{totalGeral.linhas}</strong> linhas de
            vendas em <strong className="text-slate-900 font-bold">{hierarchy.length}</strong>{' '}
            classes JP-Class • Ordenação:{' '}
            <strong className="text-slate-900 font-bold">{getSortDescription()}</strong>
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div>
            Qtde total:{' '}
            <strong className="text-slate-900 font-bold">{formatNumber(totalGeral.qtd)} un.</strong>
          </div>
          <div>
            Faturamento total:{' '}
            <strong className="text-emerald-700 font-bold">
              {formatCurrency(totalGeral.valor)}
            </strong>
          </div>
          <div>
            Líquido total:{' '}
            <strong className="text-teal-700 font-bold">
              {formatCurrency(totalGeral.liquido)}
            </strong>
          </div>
        </div>
      </div>
    </div>
  )
}
