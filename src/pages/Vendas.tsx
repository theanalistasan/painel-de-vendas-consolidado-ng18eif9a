import React, { useEffect, useMemo, useState } from 'react'
import {
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Search,
  Package,
  Layers,
  FileSpreadsheet,
  RefreshCw,
  DollarSign,
  TrendingUp,
  FileText,
  RotateCcw,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { fetchVendasList, fetchVendasExport, fetchDashboardStats } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { VendaConsolidada, FilterState } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  exportToCSV,
  getGrupoColor,
} from '@/lib/formatters'
import { saveFiltersToSession, loadFiltersFromSession } from '@/lib/filter-persistence'
import FilterBar from '@/components/FilterBar'
import KpiCard from '@/components/KpiCard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useTableSort } from '@/hooks/use-table-sort'

const PAGE_SIZE = 20

type SortField = Extract<keyof VendaConsolidada, string>

export default function Vendas() {
  const [paginatedVendas, setPaginatedVendas] = useState<VendaConsolidada[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const sort = useTableSort<SortField>()
  const { toast } = useToast()

  // Agrupamento por Nº NFe
  // collapsedNfes armazena os números de NFe colapsados (se não estiver no set, está expandido)
  const [collapsedNfes, setCollapsedNfes] = useState<Set<string>>(new Set())

  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())

  // Persistir filtros no sessionStorage sempre que mudarem (após aplicar),
  // para que o estado seja compartilhado com o Dashboard.
  useEffect(() => {
    saveFiltersToSession(filters)
  }, [filters])

  const [kpis, setKpis] = useState({
    faturamento: 0,
    valorLiquido: 0,
    itensVendidos: 0,
    documentos: 0,
    devolucoes: 0,
  })

  const [filterOptions, setFilterOptions] = useState({
    vendedorCliente: [] as string[],
    vendedor: [] as string[],
    grupoItem: [] as string[],
    estado: [] as string[],
    utilizacao: [] as string[],
    tipoDocumento: [] as string[],
    anos: [] as number[],
    meses: [] as number[],
    dias: [] as number[],
  })

  // Carrega opções de filtro e KPIs via endpoint do dashboard
  const loadStats = async (activeFilters = filters) => {
    try {
      const stats = await fetchDashboardStats(activeFilters as unknown as Record<string, unknown>)
      if (stats) {
        setKpis({
          faturamento: stats.kpis?.faturamento || 0,
          valorLiquido: stats.kpis?.valorLiquido || 0,
          itensVendidos: stats.kpis?.itensVendidos || 0,
          documentos: stats.kpis?.documentos || 0,
          devolucoes: stats.kpis?.devolucoes || 0,
        })
        if (stats.filterOptions) {
          setFilterOptions(stats.filterOptions)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err)
    }
  }

  // Carrega a página atual de vendas via endpoint paginado com ordenação server-side
  const loadData = async (
    activeFilters = filters,
    targetPage = page,
    sortField = sort.field,
    sortDir = sort.dir,
  ) => {
    setLoading(true)
    try {
      const res = await fetchVendasList({
        page: targetPage,
        perPage: PAGE_SIZE,
        sortField: sortField || undefined,
        sortDirection: sortField ? sortDir : undefined,
        sort: sortField ? undefined : '-data_lancamento',
        filters: activeFilters as unknown as Record<string, unknown>,
      })
      setPaginatedVendas(res.items || [])
      setTotalItems(res.totalItems || 0)
      setTotalPages(res.totalPages || 1)
    } catch (err) {
      console.error('Erro ao carregar vendas:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar vendas',
        description: 'Não foi possível buscar as vendas consolidadas.',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats(filters)
  }, [filters])

  useEffect(() => {
    loadData(filters, page, sort.field, sort.dir)
  }, [page, filters, sort.field, sort.dir])

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1)
  }, [filters])

  // Realtime subscription
  useRealtime<VendaConsolidada>('vendas', () => {
    loadStats()
    loadData()
  })

  const handleSort = (field: SortField) => {
    sort.toggle(field)
    setPage(1)
  }

  // Column definitions for Table & Export (exact order requested)
  const columns = [
    { key: 'data_lancamento', label: 'Data de Lançamento', type: 'date' },
    { key: 'numero_nfe', label: 'Nº NFe', type: 'text' },
    { key: 'numero_sap', label: 'Número SAP', type: 'text' },
    { key: 'tipo_documento', label: 'Tipo de Documento', type: 'text' },
    { key: 'codigo_cliente', label: 'Código do Cliente', type: 'text' },
    { key: 'nome_cliente', label: 'Nome do Cliente', type: 'text' },
    { key: 'vendedor_cliente', label: 'Vendedor > Cliente', type: 'text' },
    { key: 'nome_vendedor', label: 'Nome do Vendedor', type: 'text' },
    { key: 'codigo_item', label: 'Cód. do Item', type: 'text' },
    { key: 'descricao_item', label: 'Descrição do Item', type: 'text' },
    { key: 'grupo_item', label: 'Grupo do Item', type: 'badge' },
    { key: 'quantidade', label: 'Quantidade', type: 'number' },
    { key: 'preco_item', label: 'Preço do Item', type: 'currency' },
    { key: 'preco_unitario', label: 'Preço Unitário', type: 'currency' },
    { key: 'total_linha', label: 'Valor Mercadoria (Total da Linha)', type: 'currency' },
    { key: 'total_nf_sem_frete', label: 'Total NF SEM Frete', type: 'currency' },
    { key: 'valor_liquido', label: 'Valor Liquido', type: 'currency' },
    { key: 'custo_total', label: 'Custo Total', type: 'currency' },
    { key: 'utilizacao', label: 'Utilização', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'text' },
    { key: 'cidade', label: 'Cidade', type: 'text' },
    { key: 'classificacao', label: 'Classificacao', type: 'text' },
    { key: 'grupo_cliente', label: 'Grupo do Cliente', type: 'text' },
    { key: 'mercado', label: 'Mercado', type: 'text' },
    { key: 'usuario_emissor_pedido', label: 'Usuário Emitente do Pedido', type: 'text' },
  ]

  // Estrutura de grupos por Nº NFe para a página atual
  const groupedRows = useMemo(() => {
    // Agrupa itens consecutivos ou por chave de NFe na página atual
    // Cada grupo tem key (numero_nfe ou id individual se vazio), items e metadata
    const groups: Array<{
      nfeKey: string
      displayNfe: string
      items: VendaConsolidada[]
      hasMultiple: boolean
    }> = []

    const map = new Map<string, VendaConsolidada[]>()
    const order: string[] = []

    for (const item of paginatedVendas) {
      const key = (item.numero_nfe || '').trim() || `__single_${item.id}`
      if (!map.has(key)) {
        map.set(key, [])
        order.push(key)
      }
      map.get(key)!.push(item)
    }

    for (const key of order) {
      const items = map.get(key)!
      const displayNfe = key.startsWith('__single_') ? '-' : key
      groups.push({
        nfeKey: key,
        displayNfe,
        items,
        hasMultiple: items.length > 1,
      })
    }

    return groups
  }, [paginatedVendas])

  // Todas as NFes válidas com múltiplos itens na página atual
  const multiItemNfeKeys = useMemo(() => {
    return groupedRows.filter((g) => g.hasMultiple).map((g) => g.nfeKey)
  }, [groupedRows])

  const areAllCollapsed = useMemo(() => {
    if (multiItemNfeKeys.length === 0) return false
    return multiItemNfeKeys.every((k) => collapsedNfes.has(k))
  }, [multiItemNfeKeys, collapsedNfes])

  const toggleCollapseNfe = (nfeKey: string) => {
    setCollapsedNfes((prev) => {
      const next = new Set(prev)
      if (next.has(nfeKey)) {
        next.delete(nfeKey)
      } else {
        next.add(nfeKey)
      }
      return next
    })
  }

  const handleCollapseAll = () => {
    if (areAllCollapsed) {
      // Expandir todos
      setCollapsedNfes(new Set())
    } else {
      // Colapsar todos
      const next = new Set<string>()
      for (const k of multiItemNfeKeys) {
        next.add(k)
      }
      setCollapsedNfes(next)
    }
  }

  // Exportação COMPLETA via endpoint vendas_export (todas as páginas que atendem aos filtros)
  const handleExportCSV = async () => {
    if (totalItems === 0 && paginatedVendas.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum dado para exportar',
        description: 'A lista atual está vazia com os filtros selecionados.',
      })
      return
    }

    setExporting(true)
    toast({
      title: 'Gerando exportação completa...',
      description: `Buscando todos os registros filtrados no servidor...`,
    })

    try {
      const res = await fetchVendasExport({
        sortField: sort.field || undefined,
        sortDirection: sort.field ? sort.dir : undefined,
        sort: sort.field ? undefined : '-data_lancamento',
        filters: filters as unknown as Record<string, unknown>,
      })

      const rowsToExport = res.items || []

      if (rowsToExport.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhum dado encontrado',
          description: 'Nenhum registro encontrado para exportar.',
        })
        return
      }

      const exportColumns = columns.map((c) => ({
        key: c.key,
        label: c.label,
      }))

      const dateStr = new Date().toISOString().slice(0, 10)
      exportToCSV(
        `vendas_consolidadas_completa_${dateStr}`,
        rowsToExport as unknown as Record<string, unknown>[],
        exportColumns,
      )

      toast({
        title: 'Exportação concluída com sucesso!',
        description: `Todos os ${rowsToExport.length} registros foram exportados em formato Excel/CSV (UTF-8 BOM).`,
      })
    } catch (err) {
      console.error('Erro na exportação completa:', err)
      toast({
        variant: 'destructive',
        title: 'Falha na exportação',
        description: 'Não foi possível exportar todos os registros. Tente novamente.',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar with Text Search */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        options={filterOptions}
        showSearch
        onApplyFilters={(applied) => {
          loadStats(applied)
          loadData(applied, 1, sort.field, sort.dir)
        }}
      />

      {/* 5 KPIs Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          title="Faturamento Total"
          value={kpis.faturamento}
          isCurrency
          icon={DollarSign}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <KpiCard
          title="Valor Líquido"
          value={kpis.valorLiquido}
          isCurrency
          icon={TrendingUp}
          iconBgColor="bg-teal-50"
          iconColor="text-teal-600"
        />
        <KpiCard
          title="Itens Vendidos"
          value={kpis.itensVendidos}
          decimals={0}
          icon={Package}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
        />
        <KpiCard
          title="Documentos (NFe)"
          value={kpis.documentos}
          decimals={0}
          icon={FileText}
          iconBgColor="bg-purple-50"
          iconColor="text-purple-600"
        />
        <KpiCard
          title="Devoluções"
          value={kpis.devolucoes}
          isCurrency
          icon={RotateCcw}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
        />
      </div>

      {/* Main Table Card */}
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                Vendas Consolidadas (RacNew + NetSales + Produtos)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {totalItems} linhas encontradas • Base mestre RacNew com enriquecimento NetSales •
                Ordenação server-side ativa
              </CardDescription>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {multiItemNfeKeys.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCollapseAll}
                  className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold gap-1.5 shadow-2xs text-xs"
                >
                  {areAllCollapsed ? (
                    <>
                      <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-600" />
                      Expandir todos
                    </>
                  ) : (
                    <>
                      <ChevronsDownUp className="w-3.5 h-3.5 text-indigo-600" />
                      Colapsar todos
                    </>
                  )}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                disabled={exporting || totalItems === 0}
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold gap-1.5 shadow-2xs"
              >
                {exporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-indigo-600" />
                    Exportar CSV ({totalItems})
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : paginatedVendas.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">Nenhum registro encontrado</p>
              <p className="text-xs text-slate-400 mt-1">
                Tente ajustar os filtros ou a busca textual acima.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200/80">
                  <tr>
                    {/* Coluna de controle de grupo NFe */}
                    <th
                      className="py-3 px-2 w-8 text-center text-slate-400 font-normal"
                      title="Agrupamento NFe"
                    >
                      <Layers className="w-3.5 h-3.5 mx-auto" />
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key as SortField)}
                        className="py-3 px-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col.label}</span>
                          {sort.field === col.key ? (
                            <span className="text-[10px] text-indigo-600 font-bold">
                              {sort.dir === 'asc' ? '▲' : '▼'}
                            </span>
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-700" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedRows.map((group) => {
                    const isCollapsed = collapsedNfes.has(group.nfeKey)
                    const visibleItems = isCollapsed ? [group.items[0]] : group.items

                    return (
                      <React.Fragment key={group.nfeKey}>
                        {visibleItems.map((item, itemIdx) => {
                          const isFirstOfGroup = itemIdx === 0
                          const isGrouped = group.hasMultiple

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors group ${
                                isGrouped && isFirstOfGroup && isCollapsed
                                  ? 'bg-indigo-50/30 font-medium'
                                  : isGrouped && !isCollapsed
                                    ? 'hover:bg-slate-50/80'
                                    : 'hover:bg-indigo-50/20'
                              }`}
                            >
                              {/* Botão de Expandir / Colapsar Grupo NFe */}
                              <td className="py-2.5 px-2 text-center align-middle">
                                {isGrouped && isFirstOfGroup ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleCollapseNfe(group.nfeKey)}
                                    className="p-1 rounded hover:bg-indigo-100 text-indigo-600 focus:outline-hidden transition-colors"
                                    title={
                                      isCollapsed
                                        ? `Expandir NF ${group.displayNfe} (${group.items.length} itens)`
                                        : `Colapsar NF ${group.displayNfe}`
                                    }
                                  >
                                    {isCollapsed ? (
                                      <ChevronRightIcon className="w-3.5 h-3.5" />
                                    ) : (
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                ) : isGrouped ? (
                                  <span className="inline-block w-2 h-0.5 bg-slate-200 rounded-full mx-auto" />
                                ) : null}
                              </td>

                              {/* 1. Data de Lancamento */}
                              <td className="py-2.5 px-3.5 font-medium text-slate-700">
                                {formatDate(item.data_lancamento)}
                              </td>

                              {/* 2. Nº NFe com indicador de múltiplos itens se colapsado */}
                              <td className="py-2.5 px-3.5 font-mono font-semibold text-slate-900">
                                <div className="flex items-center gap-1.5">
                                  <span>{item.numero_nfe || '-'}</span>
                                  {isGrouped && isFirstOfGroup && isCollapsed && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] px-1.5 py-0 h-4 bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none font-sans"
                                    >
                                      +{group.items.length - 1} itens
                                    </Badge>
                                  )}
                                </div>
                              </td>

                              {/* 3. Número SAP */}
                              <td className="py-2.5 px-3.5 font-mono text-slate-600">
                                {item.numero_sap || '-'}
                              </td>

                              {/* 4. Tipo de Documento */}
                              <td className="py-2.5 px-3.5 text-slate-700">
                                {item.tipo_documento || '-'}
                              </td>

                              {/* 5. Código do Cliente */}
                              <td className="py-2.5 px-3.5 font-mono text-slate-700">
                                {item.codigo_cliente || '-'}
                              </td>

                              {/* 5. Nome do Cliente */}
                              <td className="py-2.5 px-3.5 font-semibold text-slate-900 max-w-[220px] truncate">
                                {item.nome_cliente || '-'}
                              </td>

                              {/* 6. Vendedor > Cliente */}
                              <td className="py-2.5 px-3.5 text-indigo-950 font-medium max-w-[260px] truncate bg-slate-50/50">
                                {item.vendedor_cliente || '-'}
                              </td>

                              {/* 7. Nome do Vendedor */}
                              <td className="py-2.5 px-3.5 text-slate-700">
                                {item.nome_vendedor || '-'}
                              </td>

                              {/* 8. Cód. do Item */}
                              <td className="py-2.5 px-3.5 font-mono font-semibold text-slate-900">
                                {item.codigo_item || '-'}
                              </td>

                              {/* 9. Descrição do Item */}
                              <td className="py-2.5 px-3.5 text-slate-600 max-w-[220px] truncate">
                                {item.descricao_item || '-'}
                              </td>

                              {/* 10. Grupo do Item (Badge) */}
                              <td className="py-2.5 px-3.5">
                                {item.grupo_item ? (
                                  <Badge
                                    className="text-[10px] font-semibold text-white px-2 py-0.5"
                                    style={{
                                      backgroundColor: getGrupoColor(item.grupo_item),
                                    }}
                                  >
                                    {item.grupo_item}
                                  </Badge>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              {/* 11. Quantidade */}
                              <td className="py-2.5 px-3.5 text-center font-medium text-slate-800">
                                {formatNumber(item.quantidade)}
                              </td>

                              {/* 12. Preço do Item */}
                              <td className="py-2.5 px-3.5 text-right font-medium text-slate-700 tabular-nums">
                                {formatCurrency(item.preco_item)}
                              </td>

                              {/* 13. Preço Unitário (NetSales) */}
                              <td className="py-2.5 px-3.5 text-right font-medium text-slate-700 tabular-nums">
                                {formatCurrency(item.preco_unitario)}
                              </td>

                              {/* 14. Valor Mercadoria (Total Linha) */}
                              <td className="py-2.5 px-3.5 text-right font-bold text-indigo-700 tabular-nums bg-indigo-50/30">
                                {formatCurrency(item.total_linha)}
                              </td>

                              {/* 15. Total NF SEM Frete (NetSales) */}
                              <td className="py-2.5 px-3.5 text-right font-medium text-slate-700 tabular-nums">
                                {formatCurrency(item.total_nf_sem_frete)}
                              </td>

                              {/* 16. Valor Liquido (NetSales) */}
                              <td className="py-2.5 px-3.5 text-right font-bold text-teal-700 tabular-nums">
                                {formatCurrency(item.valor_liquido)}
                              </td>

                              {/* 17. Custo Total (NetSales) */}
                              <td className="py-2.5 px-3.5 text-right font-medium text-slate-600 tabular-nums">
                                {formatCurrency(item.custo_total)}
                              </td>

                              {/* 18. Utilização */}
                              <td className="py-2.5 px-3.5 text-slate-700">
                                {item.utilizacao || '-'}
                              </td>

                              {/* 19. Estado */}
                              <td className="py-2.5 px-3.5 text-center font-semibold text-slate-800">
                                {item.estado || '-'}
                              </td>

                              {/* 20. Cidade */}
                              <td className="py-2.5 px-3.5 text-slate-700">{item.cidade || '-'}</td>

                              {/* 21. Classificação (NetSales) */}
                              <td className="py-2.5 px-3.5 text-slate-700">
                                {item.classificacao || '-'}
                              </td>

                              {/* 22. Grupo do Cliente (NetSales) */}
                              <td className="py-2.5 px-3.5 text-slate-600">
                                {item.grupo_cliente || '-'}
                              </td>

                              {/* 23. Mercado (NetSales) */}
                              <td className="py-2.5 px-3.5 text-slate-600">
                                {item.mercado || '-'}
                              </td>

                              {/* 24. Usuário Emitente (NetSales) */}
                              <td className="py-2.5 px-3.5 text-slate-500 font-mono text-[11px]">
                                {item.usuario_emissor_pedido || '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>

        {/* Table Footer with Pagination */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Mostrando{' '}
            <span className="font-semibold text-slate-800">
              {totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
            </span>{' '}
            a{' '}
            <span className="font-semibold text-slate-800">
              {Math.min(page * PAGE_SIZE, totalItems)}
            </span>{' '}
            de <span className="font-semibold text-slate-800">{totalItems}</span> registros
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-3 py-1 font-medium text-slate-700">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
