import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  Database,
  Maximize2,
  Minimize2,
  RotateCw,
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
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  buildDynamicInitialFilters,
  hasSavedFiltersInSession,
  hasValidPeriodFilters,
} from '@/lib/filter-persistence'
import FilterBar from '@/components/FilterBar'
import KpiCard from '@/components/KpiCard'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useTableSort } from '@/hooks/use-table-sort'
import { VendasRelatorioTable, RELATORIO_COLUMNS } from '@/components/VendasRelatorioTable'

const PAGE_SIZE = 20

type SortField = Extract<keyof VendaConsolidada, string>

export default function Vendas() {
  const [paginatedVendas, setPaginatedVendas] = useState<VendaConsolidada[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalNetsales, setTotalNetsales] = useState(0)
  const [totalRacnew, setTotalRacnew] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const sort = useTableSort<SortField>()
  const { toast } = useToast()

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())
  const [initializedFromBase, setInitializedFromBase] = useState(
    () => hasSavedFiltersInSession() && hasValidPeriodFilters(loadFiltersFromSession()),
  )

  // Persistir filtros no sessionStorage sempre que mudarem (após aplicar ou após inicialização dinâmica),
  // para que o estado seja compartilhado de forma consistente com o Dashboard.
  useEffect(() => {
    if (hadSavedFiltersAtMount.current || initializedFromBase) {
      saveFiltersToSession(filters)
    }
  }, [filters, initializedFromBase])

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

          // Se ainda não foi inicializado com as opções dinâmicas da base, OU se os filtros atuais
          // estiverem com ano/mês vazios, aplica os filtros dinâmicos padrão da base.
          const needsDynamicInit = !initializedFromBase || !hasValidPeriodFilters(activeFilters)
          if (needsDynamicInit) {
            const dynamicFilters = buildDynamicInitialFilters(stats.filterOptions)
            setInitializedFromBase(true)
            saveFiltersToSession(dynamicFilters)
            setFilters(dynamicFilters)
            return
          }
        }
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err)
    }
  }

  // Modo global de colapso/agrupamento por NFe em todo o relatório
  const [isAllGroupedNfe, setIsAllGroupedNfe] = useState(false)

  // Carrega a página atual de vendas via endpoint paginado com ordenação server-side
  const loadData = async (
    activeFilters = filters,
    targetPage = page,
    sortField = sort.field,
    sortDir = sort.dir,
    groupedNfe = isAllGroupedNfe,
  ) => {
    setLoading(true)
    try {
      const res = await fetchVendasList({
        page: targetPage,
        perPage: PAGE_SIZE,
        sortField: sortField || undefined,
        sortDirection: sortField ? sortDir : undefined,
        sort: sortField ? undefined : '-data_lancamento',
        groupByNfe: groupedNfe,
        filters: activeFilters as unknown as Record<string, unknown>,
      })
      setPaginatedVendas(res.items || [])
      setTotalItems(res.totalItems || 0)
      setTotalNetsales(
        res.totalNetsales !== undefined
          ? res.totalNetsales
          : (res.items || []).filter((i) => i.tem_netsales).length,
      )
      setTotalRacnew(
        res.totalRacnew !== undefined
          ? res.totalRacnew
          : (res.items || []).filter((i) => !i.tem_netsales).length,
      )
      setTotalPages(res.totalPages || 1)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError' || String(err).includes('aborted')) {
        return
      }
      console.error('Erro ao carregar vendas:', err)
      const msg =
        err instanceof Error ? err.message : 'Não foi possível buscar as vendas consolidadas.'
      toast({
        variant: 'destructive',
        title:
          msg.toLowerCase().includes('tempo limite') || msg.toLowerCase().includes('demorou')
            ? 'Consulta demorou demais'
            : 'Erro ao carregar vendas',
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats(filters)
  }, [filters])

  useEffect(() => {
    loadData(filters, page, sort.field, sort.dir, isAllGroupedNfe)
  }, [page, filters, sort.field, sort.dir, isAllGroupedNfe])

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

  const handleCollapseAll = () => {
    if (isAllGroupedNfe) {
      setIsAllGroupedNfe(false)
      setPage(1)
      toast({
        title: 'Relatório expandido',
        description: 'Exibindo todos os itens detalhados de cada Nota Fiscal.',
      })
    } else {
      setIsAllGroupedNfe(true)
      setPage(1)
      toast({
        title: 'Relatório colapsado por NF',
        description: 'Exibindo 1 linha consolidada por Nota Fiscal para todos os dados do filtro.',
      })
    }
  }

  // Exportação COMPLETA via endpoint vendas_export
  const handleExportCSV = async (forceGrouped?: boolean) => {
    if (totalItems === 0 && paginatedVendas.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum dado para exportar',
        description: 'A lista atual está vazia com os filtros selecionados.',
      })
      return
    }

    const shouldGroup = forceGrouped !== undefined ? forceGrouped : isAllGroupedNfe

    setExporting(true)
    toast({
      title: shouldGroup
        ? 'Gerando exportação consolidada por NF...'
        : 'Gerando exportação completa detalhada...',
      description: `Buscando todos os registros filtrados no servidor...`,
    })

    try {
      const res = await fetchVendasExport({
        sortField: sort.field || undefined,
        sortDirection: sort.field ? sort.dir : undefined,
        sort: sort.field ? undefined : '-data_lancamento',
        groupByNfe: shouldGroup,
        collapsed: shouldGroup,
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

      const exportColumns = RELATORIO_COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
      }))

      const formattedRows = rowsToExport.map((row) => ({
        ...row,
        origem:
          row.tem_netsales && row.tem_racnew
            ? 'Consolidado'
            : row.tem_netsales
              ? 'NetSales'
              : 'RacNew',
      }))

      const dateStr = new Date().toISOString().slice(0, 10)
      const filenameSuffix = shouldGroup ? 'por_nf' : 'detalhado'
      exportToCSV(
        `vendas_consolidadas_${filenameSuffix}_${dateStr}`,
        formattedRows as unknown as Record<string, unknown>[],
        exportColumns,
      )

      toast({
        title: 'Exportação concluída com sucesso!',
        description: shouldGroup
          ? `Relatório colapsado por NF exportado com sucesso (${rowsToExport.length} Notas Fiscais consolidadas).`
          : `Todos os ${rowsToExport.length} registros foram exportados em formato Excel/CSV (UTF-8 BOM).`,
      })
    } catch (err) {
      console.error('Erro na exportação:', err)
      toast({
        variant: 'destructive',
        title: 'Falha na exportação',
        description: 'Não foi possível exportar os registros. Tente novamente.',
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
          iconBgColor="bg-cyan-50"
          iconColor="text-[#0B6E99]"
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
          iconBgColor="bg-cyan-50"
          iconColor="text-cyan-600"
        />
        <KpiCard
          title="Documentos (NFe)"
          value={kpis.documentos}
          decimals={0}
          icon={FileText}
          iconBgColor="bg-slate-100"
          iconColor="text-slate-700"
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
      <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#0B6E99]" />
                Vendas Consolidadas (RacNew + NetSales + Produtos)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-medium">
                {totalItems} linhas encontradas • Base mestre RacNew com enriquecimento NetSales •
                Ordenação server-side ativa
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <VendasRelatorioTable
          items={paginatedVendas}
          loading={loading}
          totalItems={totalItems}
          totalNetsales={totalNetsales}
          totalRacnew={totalRacnew}
          page={page}
          pageSize={PAGE_SIZE}
          totalPages={totalPages}
          onPageChange={setPage}
          sortField={sort.field}
          sortDir={sort.dir}
          onSort={(f) => handleSort(f as SortField)}
          isGroupedByNfe={isAllGroupedNfe}
          onToggleGroupByNfe={handleCollapseAll}
          storageKeyPrefix="relatorio_vendas"
          exporting={exporting}
          onExport={handleExportCSV}
          showOriginSummary={true}
        />
      </Card>
    </div>
  )
}
