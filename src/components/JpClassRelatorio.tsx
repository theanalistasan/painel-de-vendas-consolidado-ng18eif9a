import React, { useState, useMemo, useEffect } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ArrowUpDown,
  Layers,
  Search,
  Maximize2,
  Minimize2,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { getJpClass, getJpClassBadgeStyle, JP_CLASS_OPTIONS } from '@/lib/jp-class'
import type { SemanaMes } from '@/lib/semanas'
import type { VendaConsolidada } from '@/types/sales'

export type JpClassGroupBy = 'none' | 'jp_class' | 'item' | 'grupo'

export interface VendaComSemana extends VendaConsolidada {
  semanaNumero: number
  semanaNome: string
  jpClass: string
}

export interface JpClassRelatorioProps {
  items: VendaComSemana[]
  semanas: SemanaMes[]
  loading?: boolean
  groupBy: JpClassGroupBy
  onGroupByChange: (gb: JpClassGroupBy) => void
}

type SortField =
  | 'semana'
  | 'jp_class'
  | 'descricao_item'
  | 'grupo_item'
  | 'quantidade'
  | 'total_linha'
  | 'valor_liquido'
  | 'data_lancamento'
  | 'nome_cliente'
type SortDir = 'asc' | 'desc'

export function JpClassRelatorio({
  items,
  semanas,
  loading = false,
  groupBy,
  onGroupByChange,
}: JpClassRelatorioProps) {
  const [sortField, setSortField] = useState<SortField>('data_lancamento')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Filtragem local por texto (busca)
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter((it) => {
      return (
        (it.descricao_item && it.descricao_item.toLowerCase().includes(q)) ||
        (it.codigo_item && it.codigo_item.toLowerCase().includes(q)) ||
        (it.nome_cliente && it.nome_cliente.toLowerCase().includes(q)) ||
        (it.grupo_item && it.grupo_item.toLowerCase().includes(q)) ||
        (it.jpClass && it.jpClass.toLowerCase().includes(q)) ||
        (it.numero_nfe && it.numero_nfe.toLowerCase().includes(q))
      )
    })
  }, [items, search])

  // Ordenação das linhas
  const sortedItems = useMemo(() => {
    const list = [...filteredItems]
    list.sort((a, b) => {
      let valA: string | number = ''
      let valB: string | number = ''

      switch (sortField) {
        case 'semana':
          valA = a.semanaNumero
          valB = b.semanaNumero
          break
        case 'jp_class':
          valA = a.jpClass
          valB = b.jpClass
          break
        case 'descricao_item':
          valA = a.descricao_item || a.codigo_item || ''
          valB = b.descricao_item || b.codigo_item || ''
          break
        case 'grupo_item':
          valA = a.grupo_item || ''
          valB = b.grupo_item || ''
          break
        case 'quantidade':
          valA = Number(a.quantidade) || 0
          valB = Number(b.quantidade) || 0
          break
        case 'total_linha':
          valA = Number(a.total_linha) || 0
          valB = Number(b.total_linha) || 0
          break
        case 'valor_liquido':
          valA = Number(a.valor_liquido) || 0
          valB = Number(b.valor_liquido) || 0
          break
        case 'nome_cliente':
          valA = a.nome_cliente || ''
          valB = b.nome_cliente || ''
          break
        case 'data_lancamento':
        default:
          valA = a.data_lancamento || ''
          valB = b.data_lancamento || ''
          break
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA
      }
      const strA = String(valA)
      const strB = String(valB)
      return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA)
    })
    return list
  }, [filteredItems, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Agrupamento por JP-Class, Item ou Grupo
  interface GroupedSection {
    key: string
    title: string
    badgeText?: string
    items: VendaComSemana[]
    totalQtd: number
    totalValor: number
    totalLiquido: number
  }

  const groupedSections = useMemo<GroupedSection[]>(() => {
    if (groupBy === 'none') return []

    const map = new Map<string, { title: string; badgeText?: string; items: VendaComSemana[] }>()

    for (const item of sortedItems) {
      let key = ''
      let title = ''
      let badgeText: string | undefined

      if (groupBy === 'jp_class') {
        key = item.jpClass
        title = item.jpClass
        badgeText = 'JP-Class'
      } else if (groupBy === 'item') {
        key = item.descricao_item || item.codigo_item || '(Sem item)'
        title = item.descricao_item || item.codigo_item || '(Sem item)'
        badgeText = item.codigo_item ? `Cód. ${item.codigo_item}` : undefined
      } else if (groupBy === 'grupo') {
        key = item.grupo_item || '(Sem Grupo)'
        title = item.grupo_item || '(Sem Grupo)'
        badgeText = 'Grupo'
      }

      if (!map.has(key)) {
        map.set(key, { title, badgeText, items: [] })
      }
      map.get(key)!.items.push(item)
    }

    const sections: GroupedSection[] = []
    for (const [key, val] of map.entries()) {
      let totalQtd = 0
      let totalValor = 0
      let totalLiquido = 0
      for (const it of val.items) {
        totalQtd += Number(it.quantidade) || 0
        totalValor += Number(it.total_linha) || 0
        totalLiquido += Number(it.valor_liquido) || 0
      }
      sections.push({
        key,
        title: val.title,
        badgeText: val.badgeText,
        items: val.items,
        totalQtd,
        totalValor,
        totalLiquido,
      })
    }

    // Ordenar seções pelo maior valor faturado
    sections.sort((a, b) => b.totalValor - a.totalValor)
    return sections
  }, [sortedItems, groupBy])

  // Colapso de grupos
  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const collapseAll = () => {
    if (groupBy === 'none') return
    const allKeys = new Set(groupedSections.map((s) => s.key))
    setCollapsedGroups(allKeys)
  }

  const expandAll = () => {
    setCollapsedGroups(new Set())
  }

  // Reseta colapsos ao mudar o modo de agrupamento
  useEffect(() => {
    setCollapsedGroups(new Set())
  }, [groupBy])

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
        {/* Agrupamento */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 pl-2 pr-1 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#0B6E99]" />
              Agrupar por:
            </span>
            <button
              type="button"
              onClick={() => onGroupByChange('none')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                groupBy === 'none'
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Sem Agrupamento
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange('jp_class')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                groupBy === 'jp_class'
                  ? 'bg-[#0B6E99] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              JP-Class
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange('item')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                groupBy === 'item'
                  ? 'bg-[#0B6E99] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Item
            </button>
            <button
              type="button"
              onClick={() => onGroupByChange('grupo')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                groupBy === 'grupo'
                  ? 'bg-[#0B6E99] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Grupo
            </button>
          </div>

          {/* Botões Expandir Todos / Colapsar Todos se houver agrupamento */}
          {groupBy !== 'none' && (
            <div className="inline-flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1 h-8"
              >
                <ChevronsUpDown className="w-3.5 h-3.5 text-[#0B6E99]" />
                Expandir Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold gap-1 h-8"
              >
                <ChevronsDownUp className="w-3.5 h-3.5 text-[#0B6E99]" />
                Colapsar Todos
              </Button>
            </div>
          )}
        </div>

        {/* Busca rápida */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar item, grupo, cliente..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:border-[#0B6E99] text-slate-800"
          />
        </div>
      </div>

      {/* Conteúdo da Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-50/90 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th
                onClick={() => handleSort('semana')}
                className="py-3 px-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-28 whitespace-nowrap"
              >
                <span>Semana</span>
                {renderSortIndicator('semana')}
              </th>
              <th
                onClick={() => handleSort('data_lancamento')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-28 whitespace-nowrap"
              >
                <span>Data Lanç.</span>
                {renderSortIndicator('data_lancamento')}
              </th>
              <th
                onClick={() => handleSort('jp_class')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-28 whitespace-nowrap"
              >
                <span>JP-Class</span>
                {renderSortIndicator('jp_class')}
              </th>
              <th
                onClick={() => handleSort('grupo_item')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-36 whitespace-nowrap"
              >
                <span>Grupo</span>
                {renderSortIndicator('grupo_item')}
              </th>
              <th
                onClick={() => handleSort('descricao_item')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 min-w-[200px]"
              >
                <span>Item</span>
                {renderSortIndicator('descricao_item')}
              </th>
              <th
                onClick={() => handleSort('nome_cliente')}
                className="py-3 px-3 cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 min-w-[180px]"
              >
                <span>Cliente</span>
                {renderSortIndicator('nome_cliente')}
              </th>
              <th
                onClick={() => handleSort('quantidade')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-20 whitespace-nowrap"
              >
                <span>Qtde</span>
                {renderSortIndicator('quantidade')}
              </th>
              <th
                onClick={() => handleSort('total_linha')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors border-r border-slate-100 w-32 whitespace-nowrap"
              >
                <span>Total Vendas</span>
                {renderSortIndicator('total_linha')}
              </th>
              <th
                onClick={() => handleSort('valor_liquido')}
                className="py-3 px-3 text-right cursor-pointer hover:bg-slate-100/80 transition-colors w-32 whitespace-nowrap"
              >
                <span>Valor Líquido</span>
                {renderSortIndicator('valor_liquido')}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
                    <span>Carregando dados de vendas do período...</span>
                  </div>
                </td>
              </tr>
            ) : sortedItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
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
            ) : groupBy === 'none' ? (
              /* MODO SEM AGRUPAMENTO */
              sortedItems.map((item) => {
                const badgeStyle = getJpClassBadgeStyle(item.jpClass)
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3.5 border-r border-slate-100 whitespace-nowrap font-medium text-slate-800">
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-slate-50 font-bold border-slate-200"
                      >
                        {item.semanaNome}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap text-slate-600">
                      {item.data_lancamento
                        ? item.data_lancamento.slice(0, 10).split('-').reverse().join('/')
                        : '-'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-2 py-0.5 font-bold ${badgeStyle.className}`}
                      >
                        {item.jpClass}
                      </Badge>
                    </td>
                    <td
                      className="py-2.5 px-3 border-r border-slate-100 text-slate-600 truncate max-w-[150px]"
                      title={item.grupo_item}
                    >
                      {item.grupo_item || '-'}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-100 text-slate-800 font-medium">
                      <div
                        className="truncate max-w-[240px]"
                        title={item.descricao_item || item.codigo_item}
                      >
                        {item.descricao_item || item.codigo_item || '-'}
                      </div>
                      {item.codigo_item && item.descricao_item && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          Cód. {item.codigo_item}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-100 text-slate-600">
                      <div className="truncate max-w-[200px]" title={item.nome_cliente}>
                        {item.nome_cliente || '-'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-slate-100 font-medium tabular-nums">
                      {formatNumber(item.quantidade)}
                    </td>
                    <td className="py-2.5 px-3 text-right border-r border-slate-100 font-bold text-slate-900 tabular-nums">
                      {formatCurrency(item.total_linha)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-teal-700 tabular-nums">
                      {formatCurrency(item.valor_liquido)}
                    </td>
                  </tr>
                )
              })
            ) : (
              /* MODO AGRUPADO COM SOMATÓRIOS */
              groupedSections.map((sec) => {
                const isCollapsed = collapsedGroups.has(sec.key)
                const badgeStyle = groupBy === 'jp_class' ? getJpClassBadgeStyle(sec.key) : null

                return (
                  <React.Fragment key={sec.key}>
                    {/* Cabeçalho do Grupo com Somatório */}
                    <tr
                      onClick={() => toggleGroupCollapse(sec.key)}
                      className={`cursor-pointer transition-colors border-y select-none font-semibold ${
                        isCollapsed
                          ? 'bg-slate-100/80 hover:bg-slate-200/70 border-slate-200 text-slate-800'
                          : 'bg-sky-50/70 hover:bg-sky-100/60 border-sky-200 text-slate-900'
                      }`}
                    >
                      <td colSpan={6} className="py-2.5 px-3.5 border-r border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleGroupCollapse(sec.key)
                            }}
                            className="p-1 rounded text-slate-500 hover:text-slate-800 transition-colors"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[#0B6E99]" />
                            )}
                          </button>

                          {badgeStyle ? (
                            <Badge
                              variant="outline"
                              className={`text-xs px-2.5 py-0.5 font-bold ${badgeStyle.className}`}
                            >
                              {sec.title}
                            </Badge>
                          ) : (
                            <span className="text-xs font-bold text-slate-900">{sec.title}</span>
                          )}

                          {sec.badgeText && groupBy !== 'jp_class' && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-white text-slate-600 border-slate-300"
                            >
                              {sec.badgeText}
                            </Badge>
                          )}

                          <Badge
                            variant="secondary"
                            className="text-[10px] bg-slate-200/80 text-slate-700 font-bold px-1.5 py-0"
                          >
                            {sec.items.length} {sec.items.length === 1 ? 'linha' : 'linhas'}
                          </Badge>
                        </div>
                      </td>

                      {/* Somatório Quantidade */}
                      <td className="py-2.5 px-3 text-right border-r border-slate-200/60 font-bold text-slate-900 tabular-nums">
                        {formatNumber(sec.totalQtd)}
                      </td>

                      {/* Somatório Total Vendas */}
                      <td className="py-2.5 px-3 text-right border-r border-slate-200/60 font-extrabold text-emerald-800 tabular-nums">
                        {formatCurrency(sec.totalValor)}
                      </td>

                      {/* Somatório Valor Líquido */}
                      <td className="py-2.5 px-3 text-right font-extrabold text-teal-800 tabular-nums">
                        {formatCurrency(sec.totalLiquido)}
                      </td>
                    </tr>

                    {/* Linhas detalhadas quando expandido */}
                    {!isCollapsed &&
                      sec.items.map((item) => {
                        const rowBadgeStyle = getJpClassBadgeStyle(item.jpClass)
                        return (
                          <tr
                            key={item.id}
                            className="hover:bg-slate-50/70 transition-colors bg-white"
                          >
                            <td className="py-2.5 px-3.5 border-r border-slate-100 whitespace-nowrap font-medium text-slate-800 pl-8">
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-50 font-bold border-slate-200"
                              >
                                {item.semanaNome}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap text-slate-600">
                              {item.data_lancamento
                                ? item.data_lancamento.slice(0, 10).split('-').reverse().join('/')
                                : '-'}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-100 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-2 py-0.5 font-bold ${rowBadgeStyle.className}`}
                              >
                                {item.jpClass}
                              </Badge>
                            </td>
                            <td
                              className="py-2.5 px-3 border-r border-slate-100 text-slate-600 truncate max-w-[150px]"
                              title={item.grupo_item}
                            >
                              {item.grupo_item || '-'}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-100 text-slate-800 font-medium">
                              <div
                                className="truncate max-w-[240px]"
                                title={item.descricao_item || item.codigo_item}
                              >
                                {item.descricao_item || item.codigo_item || '-'}
                              </div>
                              {item.codigo_item && item.descricao_item && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Cód. {item.codigo_item}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-100 text-slate-600">
                              <div className="truncate max-w-[200px]" title={item.nome_cliente}>
                                {item.nome_cliente || '-'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-slate-100 font-medium tabular-nums text-slate-700">
                              {formatNumber(item.quantidade)}
                            </td>
                            <td className="py-2.5 px-3 text-right border-r border-slate-100 font-semibold text-slate-900 tabular-nums">
                              {formatCurrency(item.total_linha)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-teal-700 tabular-nums">
                              {formatCurrency(item.valor_liquido)}
                            </td>
                          </tr>
                        )
                      })}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé informativo com total geral */}
      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
        <div>
          Total no período consolidado:{' '}
          <strong className="text-slate-900 font-bold">{sortedItems.length}</strong> linhas de
          vendas
        </div>
        <div className="flex items-center gap-4">
          <div>
            Qtde total:{' '}
            <strong className="text-slate-900 font-bold">
              {formatNumber(sortedItems.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0))}
            </strong>
          </div>
          <div>
            Faturamento total:{' '}
            <strong className="text-emerald-700 font-bold">
              {formatCurrency(
                sortedItems.reduce((acc, it) => acc + (Number(it.total_linha) || 0), 0),
              )}
            </strong>
          </div>
        </div>
      </div>
    </div>
  )
}
