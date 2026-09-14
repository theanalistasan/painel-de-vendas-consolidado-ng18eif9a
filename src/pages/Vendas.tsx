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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useTableSort } from '@/hooks/use-table-sort'

const PAGE_SIZE = 20

type SortField = Extract<keyof VendaConsolidada, string>

// Configurações padrão de largura para as 10 colunas solicitadas
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  data_lancamento: 110,
  numero_nfe: 120,
  tipo_documento: 160,
  nome_cliente: 240,
  vendedor_cliente: 220,
  descricao_item: 280,
  quantidade: 90,
  grupo_item: 140,
  total_linha: 140,
  utilizacao: 180,
}

const MIN_COLUMN_WIDTH = 60
const STORAGE_KEY_WIDTHS = 'relatorio_vendas_col_widths_v2'
const STORAGE_KEY_EXPANDED = 'relatorio_vendas_col_expanded_v2'

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

  // Largura e modo expandido por coluna (persistido em localStorage)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WIDTHS)
      if (saved) {
        return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) }
      }
    } catch (_) {
      // fallback
    }
    return DEFAULT_COLUMN_WIDTHS
  })

  const [expandedCols, setExpandedCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EXPANDED)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (_) {
      // fallback
    }
    return {}
  })

  // Salvar larguras e colunas expandidas no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_WIDTHS, JSON.stringify(columnWidths))
    } catch (_) {
      // ignore
    }
  }, [columnWidths])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(expandedCols))
    } catch (_) {
      // ignore
    }
  }, [expandedCols])

  // Lógica de Redimensionamento Interativo (arrastar borda da coluna)
  const resizingColRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault()
    e.stopPropagation()
    const currentWidth = columnWidths[key] || DEFAULT_COLUMN_WIDTHS[key] || 150
    resizingColRef.current = {
      key,
      startX: e.clientX,
      startWidth: currentWidth,
    }

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return
      const delta = moveEvent.clientX - resizingColRef.current.startX
      const newWidth = Math.max(MIN_COLUMN_WIDTH, resizingColRef.current.startWidth + delta)
      setColumnWidths((prev) => ({
        ...prev,
        [resizingColRef.current!.key]: newWidth,
      }))
    }

    const onMouseUp = () => {
      resizingColRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Toggle de visualização expandida de coluna (revela todo o texto sem truncar)
  const toggleColumnExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedCols((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Resetar larguras para os padrões
  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
    setExpandedCols({})
    try {
      localStorage.removeItem(STORAGE_KEY_WIDTHS)
      localStorage.removeItem(STORAGE_KEY_EXPANDED)
    } catch (_) {
      // ignore
    }
    toast({
      title: 'Larguras redefinidas',
      description: 'As larguras das colunas retornaram aos valores padrão.',
    })
  }

  // Agrupamento por Nº NFe
  // collapsedNfes armazena os números de NFe colapsados (se não estiver no set, está expandido)
  const [collapsedNfes, setCollapsedNfes] = useState<Set<string>>(new Set())

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

  // Column definitions for Table & Export (exact sequence requested by user):
  // 1. Data
  // 2. Nr. NF
  // 3. Tipo de Documento
  // 4. Cliente
  // 5. Vendedor
  // 6. Item
  // 7. Qtde
  // 8. Grupo
  // 9. Total da Linha
  // 10. Utilização
  // Seguidas pelas colunas complementares já existentes
  const columns = [
    { key: 'data_lancamento', label: 'Data', type: 'date', sortKey: 'data_lancamento' },
    { key: 'numero_nfe', label: 'Nr. NF', type: 'text', sortKey: 'numero_nfe' },
    { key: 'tipo_documento', label: 'Tipo de Documento', type: 'text', sortKey: 'tipo_documento' },
    { key: 'nome_cliente', label: 'Cliente', type: 'text', sortKey: 'nome_cliente' },
    { key: 'vendedor_cliente', label: 'Vendedor', type: 'text', sortKey: 'vendedor_cliente' },
    { key: 'descricao_item', label: 'Item', type: 'text', sortKey: 'descricao_item' },
    { key: 'quantidade', label: 'Qtde', type: 'number', sortKey: 'quantidade', align: 'center' },
    { key: 'grupo_item', label: 'Grupo', type: 'badge', sortKey: 'grupo_item' },
    {
      key: 'total_linha',
      label: 'Total da Linha',
      type: 'currency',
      sortKey: 'total_linha',
      align: 'right',
    },
    { key: 'utilizacao', label: 'Utilização', type: 'text', sortKey: 'utilizacao' },
    // Colunas complementares de enriquecimento (disponíveis para consulta/exportação)
    { key: 'numero_sap', label: 'Número SAP', type: 'text', sortKey: 'numero_sap' },
    { key: 'codigo_cliente', label: 'Cód. Cliente', type: 'text', sortKey: 'codigo_cliente' },
    { key: 'nome_vendedor', label: 'Nome Vendedor', type: 'text', sortKey: 'nome_vendedor' },
    { key: 'codigo_item', label: 'Cód. Item', type: 'text', sortKey: 'codigo_item' },
    {
      key: 'preco_item',
      label: 'Preço Item',
      type: 'currency',
      sortKey: 'preco_item',
      align: 'right',
    },
    {
      key: 'preco_unitario',
      label: 'Preço Unit.',
      type: 'currency',
      sortKey: 'preco_unitario',
      align: 'right',
    },
    {
      key: 'total_nf_sem_frete',
      label: 'Total NF sem Frete',
      type: 'currency',
      sortKey: 'total_nf_sem_frete',
      align: 'right',
    },
    {
      key: 'valor_liquido',
      label: 'Valor Líquido',
      type: 'currency',
      sortKey: 'valor_liquido',
      align: 'right',
    },
    {
      key: 'custo_total',
      label: 'Custo Total',
      type: 'currency',
      sortKey: 'custo_total',
      align: 'right',
    },
    { key: 'estado', label: 'UF', type: 'text', sortKey: 'estado', align: 'center' },
    { key: 'cidade', label: 'Cidade', type: 'text', sortKey: 'cidade' },
    { key: 'classificacao', label: 'Classificação', type: 'text', sortKey: 'classificacao' },
    { key: 'grupo_cliente', label: 'Grupo Cliente', type: 'text', sortKey: 'grupo_cliente' },
    { key: 'mercado', label: 'Mercado', type: 'text', sortKey: 'mercado' },
    {
      key: 'usuario_emissor_pedido',
      label: 'Usuário Emitente',
      type: 'text',
      sortKey: 'usuario_emissor_pedido',
    },
    { key: 'origem', label: 'Origem', type: 'text', sortKey: 'origem' },
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
    if (isAllGroupedNfe) return true
    if (multiItemNfeKeys.length === 0) return false
    return multiItemNfeKeys.every((k) => collapsedNfes.has(k))
  }, [isAllGroupedNfe, multiItemNfeKeys, collapsedNfes])

  const toggleCollapseNfe = (nfeKey: string) => {
    if (isAllGroupedNfe) {
      // Se estamos no modo colapsado global e o usuário quer descolapsar uma NF específica
      setIsAllGroupedNfe(false)
      setCollapsedNfes(new Set())
      return
    }
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
    if (isAllGroupedNfe) {
      // Expandir tudo: volta para listagem detalhada de todos os itens
      setIsAllGroupedNfe(false)
      setCollapsedNfes(new Set())
      setPage(1)
      toast({
        title: 'Relatório expandido',
        description: 'Exibindo todos os itens detalhados de cada Nota Fiscal.',
      })
    } else {
      // Colapsar tudo: agrupa o conjunto completo de dados por Nota Fiscal (server-side)
      setIsAllGroupedNfe(true)
      setCollapsedNfes(new Set())
      setPage(1)
      toast({
        title: 'Relatório colapsado por NF',
        description: 'Exibindo 1 linha consolidada por Nota Fiscal para todos os dados do filtro.',
      })
    }
  }

  // Exportação COMPLETA via endpoint vendas_export (todas as páginas que atendem aos filtros)
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

      const exportColumns = columns.map((c) => ({
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

            <div className="flex items-center flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetColumnWidths}
                className="bg-white border-gray-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold gap-1.5 h-8"
                title="Redefinir larguras das colunas para os padrões"
              >
                <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                Redefinir Larguras
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV()}
                disabled={exporting || totalItems === 0}
                className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 font-bold gap-1.5"
                title={
                  isAllGroupedNfe
                    ? 'Exportar relatório consolidado por NF (compacto)'
                    : 'Exportar relatório completo com todos os itens'
                }
              >
                {exporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#0B6E99]" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-[#0B6E99]" />
                    {isAllGroupedNfe
                      ? `Exportar por NF (${totalItems})`
                      : `Exportar CSV (${totalItems})`}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Barra superior de ações e resumo (com botão Colapsar/Expandir à esquerda) */}
        <div className="px-6 py-2.5 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          {/* Lado esquerdo: Botão de Colapsar / Expandir itens de NFe */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={isAllGroupedNfe ? 'default' : 'outline'}
              size="sm"
              onClick={handleCollapseAll}
              disabled={loading}
              className={
                isAllGroupedNfe
                  ? 'bg-[#0B6E99] hover:bg-[#085273] text-white font-bold gap-1.5 text-xs shadow-2xs h-8'
                  : 'bg-white border-gray-200 text-slate-700 hover:bg-slate-50 hover:text-[#0B6E99] font-bold gap-1.5 text-xs shadow-2xs h-8'
              }
              title={
                isAllGroupedNfe
                  ? 'Expandir para visualizar todos os itens detalhados'
                  : 'Colapsar todos os dados por Nota Fiscal (consolidado em 1 linha por NF)'
              }
            >
              {isAllGroupedNfe ? (
                <>
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                  Expandir Todos os Itens
                </>
              ) : (
                <>
                  <ChevronsDownUp className="w-3.5 h-3.5 text-[#0B6E99]" />
                  Colapsar por NF (Consolidado)
                </>
              )}
            </Button>
            {isAllGroupedNfe && (
              <Badge
                variant="outline"
                className="bg-cyan-50 text-[#0B6E99] border-cyan-200 font-medium px-2 py-0.5 text-[11px]"
              >
                Modo compacto: 1 linha por NF em todo o filtro
              </Badge>
            )}
          </div>

          {/* Lado direito: Resumo por origem */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-slate-500 font-medium mr-1">Resumo por origem:</span>
            <Badge
              variant="outline"
              className="bg-indigo-50/80 text-indigo-700 border-indigo-200/80 px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-600" />
              <Database className="w-3.5 h-3.5 text-indigo-600" />
              <span>NetSales: {formatNumber(totalNetsales)}</span>
            </Badge>
            <Badge
              variant="outline"
              className="bg-cyan-100 text-cyan-800 border-cyan-300 px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-500" />
              <FileText className="w-3.5 h-3.5 text-cyan-700" />
              <span>RacNew: {formatNumber(totalRacnew)}</span>
            </Badge>
          </div>
        </div>

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
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200/80 sticky top-0 z-10 shadow-2xs">
                  <tr>
                    {/* Coluna de controle de grupo NFe */}
                    <th
                      className="py-3 px-2 w-9 min-w-[36px] text-center text-slate-400 font-normal bg-slate-50 border-r border-slate-200/50"
                      title="Agrupamento NFe"
                    >
                      <Layers className="w-3.5 h-3.5 mx-auto" />
                    </th>
                    {columns.map((col) => {
                      const width = columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key] || 150
                      const isExpanded = !!expandedCols[col.key]
                      const isSorted = sort.field === col.sortKey

                      return (
                        <th
                          key={col.key}
                          style={{
                            width: isExpanded ? 'auto' : `${width}px`,
                            minWidth: `${Math.min(width, 80)}px`,
                            maxWidth: isExpanded ? 'none' : `${Math.max(width, 260)}px`,
                          }}
                          className="relative py-2.5 px-3 select-none group border-r border-slate-200/60 bg-slate-50 transition-colors hover:bg-slate-100/70"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            {/* Título com botão de ordenação */}
                            <button
                              type="button"
                              onClick={() => handleSort(col.sortKey as SortField)}
                              className="flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 truncate focus:outline-hidden text-left flex-1"
                              title={`Ordenar por ${col.label}`}
                            >
                              <span className="truncate">{col.label}</span>
                              {isSorted ? (
                                <span className="text-[10px] text-[#0B6E99] font-bold shrink-0">
                                  {sort.dir === 'asc' ? '▲' : '▼'}
                                </span>
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                              )}
                            </button>

                            {/* Botão de abrir/fechar coluna (Expandir/Truncar) */}
                            <button
                              type="button"
                              onClick={(e) => toggleColumnExpand(col.key, e)}
                              className={`p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 shrink-0 transition-colors ${
                                isExpanded
                                  ? 'text-[#0B6E99] bg-cyan-50'
                                  : 'opacity-0 group-hover:opacity-100'
                              }`}
                              title={
                                isExpanded
                                  ? `Recolher coluna ${col.label} (largura compacta / truncada)`
                                  : `Expandir coluna ${col.label} (mostrar conteúdo completo sem truncar)`
                              }
                            >
                              {isExpanded ? (
                                <Minimize2 className="w-3 h-3" />
                              ) : (
                                <Maximize2 className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          {/* Alça interativa de redimensionamento de coluna (arrastar a borda direita) */}
                          <div
                            onMouseDown={(e) => handleResizeStart(e, col.key)}
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize select-none hover:bg-[#0B6E99]/40 active:bg-[#0B6E99] transition-colors z-20 group/handle"
                            title="Arrastar para ajustar largura da coluna"
                          >
                            <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-3 bg-slate-300 group-hover/handle:bg-[#0B6E99]" />
                          </div>
                        </th>
                      )
                    })}
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
                                  ? 'bg-cyan-50/30 font-medium'
                                  : isGrouped && !isCollapsed
                                    ? 'hover:bg-slate-50/80'
                                    : 'hover:bg-cyan-50/10'
                              }`}
                            >
                              {/* Botão de Expandir / Colapsar Grupo NFe */}
                              <td className="py-2 px-2 text-center align-middle border-r border-slate-100 w-9 min-w-[36px]">
                                {isGrouped && isFirstOfGroup ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleCollapseNfe(group.nfeKey)}
                                    className="p-1 rounded hover:bg-cyan-100 text-[#0B6E99] focus:outline-hidden transition-colors"
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

                              {/* Renderização de cada coluna na ordem exata configurada */}
                              {columns.map((col) => {
                                const isExpanded = !!expandedCols[col.key]
                                const width =
                                  columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key] || 150
                                const cellStyle: React.CSSProperties = {
                                  width: isExpanded ? 'auto' : `${width}px`,
                                  minWidth: `${Math.min(width, 80)}px`,
                                  maxWidth: isExpanded ? 'none' : `${Math.max(width, 260)}px`,
                                }

                                switch (col.key) {
                                  // 1. Data de Lançamento
                                  case 'data_lancamento':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 font-medium text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={isExpanded ? '' : 'truncate'}
                                          title={formatDate(item.data_lancamento)}
                                        >
                                          {formatDate(item.data_lancamento)}
                                        </div>
                                      </td>
                                    )

                                  // 2. Nr. NF
                                  case 'numero_nfe':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 font-mono font-semibold text-slate-900 border-r border-slate-100"
                                      >
                                        <div
                                          className={`flex items-center gap-1.5 ${isExpanded ? '' : 'truncate'}`}
                                          title={item.numero_nfe || '-'}
                                        >
                                          <span className="truncate">{item.numero_nfe || '-'}</span>
                                          {isGrouped && isFirstOfGroup && isCollapsed && (
                                            <Badge
                                              variant="secondary"
                                              className="text-[9px] px-1.5 py-0 h-4 bg-cyan-100 text-cyan-900 hover:bg-cyan-100 border-none font-sans font-bold shrink-0"
                                            >
                                              +{group.items.length - 1}
                                            </Badge>
                                          )}
                                          {isAllGroupedNfe && (
                                            <Badge
                                              variant="outline"
                                              className="text-[8px] px-1 py-0 h-3.5 bg-slate-100 text-slate-600 border-slate-200 shrink-0 font-sans"
                                            >
                                              NF
                                            </Badge>
                                          )}
                                        </div>
                                      </td>
                                    )

                                  // 3. Tipo de Documento
                                  case 'tipo_documento':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.tipo_documento || '-'}
                                        >
                                          {item.tipo_documento || '-'}
                                        </div>
                                      </td>
                                    )

                                  // 4. Cliente (Nome do Cliente)
                                  case 'nome_cliente':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.nome_cliente || '-'}
                                        >
                                          {item.nome_cliente || '-'}
                                        </div>
                                      </td>
                                    )

                                  // 5. Vendedor (Vendedor > Cliente ou Nome Vendedor)
                                  case 'vendedor_cliente':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-900 font-medium bg-slate-50/40 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.vendedor_cliente || item.nome_vendedor || '-'}
                                        >
                                          {item.vendedor_cliente || item.nome_vendedor || '-'}
                                        </div>
                                      </td>
                                    )

                                  // 6. Item (Descrição do Item com Cód. opcional)
                                  case 'descricao_item':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.descricao_item || item.codigo_item || '-'}
                                        >
                                          {item.descricao_item ||
                                            (item.codigo_item ? `Cód. ${item.codigo_item}` : '-')}
                                        </div>
                                      </td>
                                    )

                                  // 7. Qtde (Quantidade)
                                  case 'quantidade':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-center font-medium text-slate-800 border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatNumber(item.quantidade)}
                                        </div>
                                      </td>
                                    )

                                  // 8. Grupo (Grupo do Item)
                                  case 'grupo_item':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 border-r border-slate-100"
                                      >
                                        {item.grupo_item ? (
                                          <Badge
                                            className="text-[10px] font-semibold text-white px-2 py-0.5 truncate max-w-full"
                                            style={{
                                              backgroundColor: getGrupoColor(item.grupo_item),
                                            }}
                                            title={item.grupo_item}
                                          >
                                            {item.grupo_item}
                                          </Badge>
                                        ) : (
                                          <span className="text-slate-400">-</span>
                                        )}
                                      </td>
                                    )

                                  // 9. Total da Linha (Valor Mercadoria)
                                  case 'total_linha':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums bg-cyan-50/20 border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatCurrency(item.total_linha)}
                                        </div>
                                      </td>
                                    )

                                  // 10. Utilização
                                  case 'utilizacao':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.utilizacao || '-'}
                                        >
                                          {item.utilizacao || '-'}
                                        </div>
                                      </td>
                                    )

                                  // Colunas complementares
                                  case 'numero_sap':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 font-mono text-slate-600 border-r border-slate-100"
                                      >
                                        <div
                                          className={isExpanded ? '' : 'truncate'}
                                          title={item.numero_sap || '-'}
                                        >
                                          {item.numero_sap || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'codigo_cliente':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 font-mono text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={isExpanded ? '' : 'truncate'}
                                          title={item.codigo_cliente || '-'}
                                        >
                                          {item.codigo_cliente || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'nome_vendedor':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.nome_vendedor || '-'}
                                        >
                                          {item.nome_vendedor || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'codigo_item':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 font-mono font-semibold text-slate-900 border-r border-slate-100"
                                      >
                                        <div
                                          className={isExpanded ? '' : 'truncate'}
                                          title={item.codigo_item || '-'}
                                        >
                                          {item.codigo_item || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'preco_item':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatCurrency(item.preco_item)}
                                        </div>
                                      </td>
                                    )
                                  case 'preco_unitario':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatCurrency(item.preco_unitario)}
                                        </div>
                                      </td>
                                    )
                                  case 'total_nf_sem_frete':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatCurrency(item.total_nf_sem_frete)}
                                        </div>
                                      </td>
                                    )
                                  case 'valor_liquido':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-right font-bold text-teal-700 tabular-nums border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatCurrency(item.valor_liquido)}
                                        </div>
                                      </td>
                                    )
                                  case 'custo_total':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-right font-medium text-slate-600 tabular-nums border-r border-slate-100"
                                      >
                                        <div className={isExpanded ? '' : 'truncate'}>
                                          {formatCurrency(item.custo_total)}
                                        </div>
                                      </td>
                                    )
                                  case 'estado':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-center font-semibold text-slate-800 border-r border-slate-100"
                                      >
                                        {item.estado || '-'}
                                      </td>
                                    )
                                  case 'cidade':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.cidade || '-'}
                                        >
                                          {item.cidade || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'classificacao':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.classificacao || '-'}
                                        >
                                          {item.classificacao || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'grupo_cliente':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-600 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.grupo_cliente || '-'}
                                        >
                                          {item.grupo_cliente || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'mercado':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-600 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                          title={item.mercado || '-'}
                                        >
                                          {item.mercado || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'usuario_emissor_pedido':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-500 font-mono text-[11px] border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded ? 'whitespace-normal break-all' : 'truncate'
                                          }
                                          title={item.usuario_emissor_pedido || '-'}
                                        >
                                          {item.usuario_emissor_pedido || '-'}
                                        </div>
                                      </td>
                                    )
                                  case 'origem':
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 border-r border-slate-100"
                                      >
                                        {item.tem_netsales ? (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] font-semibold bg-indigo-50/70 text-indigo-700 border-indigo-200/80 px-2 py-0.5 inline-flex items-center gap-1"
                                          >
                                            <Database className="w-3 h-3 text-indigo-600" />
                                            <span>NetSales</span>
                                          </Badge>
                                        ) : (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] font-semibold bg-cyan-100 text-cyan-800 border-cyan-300 px-2 py-0.5 inline-flex items-center gap-1"
                                          >
                                            <FileText className="w-3 h-3 text-cyan-700" />
                                            <span>RacNew</span>
                                          </Badge>
                                        )}
                                      </td>
                                    )
                                  default:
                                    return (
                                      <td
                                        key={col.key}
                                        style={cellStyle}
                                        className="py-2 px-3 text-slate-700 border-r border-slate-100"
                                      >
                                        <div
                                          className={
                                            isExpanded
                                              ? 'whitespace-normal break-words'
                                              : 'truncate'
                                          }
                                        >
                                          {String(
                                            (item as unknown as Record<string, unknown>)[col.key] ??
                                              '-',
                                          )}
                                        </div>
                                      </td>
                                    )
                                }
                              })}
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
            de <span className="font-semibold text-slate-800">{totalItems}</span>{' '}
            {isAllGroupedNfe ? 'notas fiscais' : 'registros'}
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
