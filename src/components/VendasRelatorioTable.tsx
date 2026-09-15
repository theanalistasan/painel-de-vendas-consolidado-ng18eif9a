import React, { useMemo, useRef, useState, useEffect } from 'react'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Layers,
  Search,
  Maximize2,
  Minimize2,
  RotateCw,
  ChevronsDownUp,
  ChevronsUpDown,
  Database,
  FileText,
  Download,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import type { VendaConsolidada } from '@/types/sales'
import { formatCurrency, formatNumber, formatDate, getGrupoColor } from '@/lib/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

export type SortDirection = 'asc' | 'desc'

export interface ColumnDef {
  key: string
  label: string
  type?: 'text' | 'date' | 'number' | 'currency' | 'badge'
  sortKey: string
  align?: 'left' | 'center' | 'right'
}

// Ordem exata solicitada pelo usuário (Silvio):
// 1. Data (data_lancamento)
// 2. Nr. NF (numero_nfe)
// 3. Tipo de Documento (tipo_documento)
// 4. Cliente (nome_cliente)
// 5. Vendedor (vendedor_cliente/nome_vendedor)
// 6. Item (descricao_item)
// 7. Qtde (quantidade)
// 8. Grupo (grupo_item)
// 9. Total da Linha (total_linha)
// 10. Utilização (utilizacao)
// Seguidas pelas complementares de detalhamento
export const RELATORIO_COLUMNS: ColumnDef[] = [
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
  // Colunas complementares de enriquecimento
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

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
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

export interface VendasRelatorioTableProps {
  items: (VendaConsolidada & { itens_qtd?: number })[]
  loading: boolean
  totalItems: number
  totalNetsales?: number
  totalRacnew?: number
  page: number
  pageSize: number
  totalPages: number
  onPageChange: (newPage: number) => void
  sortField: string | null
  sortDir: SortDirection
  onSort: (field: string) => void
  isGroupedByNfe: boolean
  onToggleGroupByNfe: () => void
  storageKeyPrefix?: string // Ex: "relatorio_canais" vs "relatorio_vendas"
  exporting?: boolean
  onExport?: (forceGrouped?: boolean) => void
  showOriginSummary?: boolean
  titleRightActions?: React.ReactNode
}

export function VendasRelatorioTable({
  items,
  loading,
  totalItems,
  totalNetsales,
  totalRacnew,
  page,
  pageSize,
  totalPages,
  onPageChange,
  sortField,
  sortDir,
  onSort,
  isGroupedByNfe,
  onToggleGroupByNfe,
  storageKeyPrefix = 'relatorio_vendas',
  exporting = false,
  onExport,
  showOriginSummary = true,
  titleRightActions,
}: VendasRelatorioTableProps) {
  const { toast } = useToast()

  const storageKeyWidths = `${storageKeyPrefix}_col_widths_v2`
  const storageKeyExpanded = `${storageKeyPrefix}_col_expanded_v2`

  // Largura e modo expandido por coluna (persistido em localStorage)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(storageKeyWidths)
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
      const saved = localStorage.getItem(storageKeyExpanded)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (_) {
      // fallback
    }
    return {}
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyWidths, JSON.stringify(columnWidths))
    } catch (_) {
      // ignore
    }
  }, [columnWidths, storageKeyWidths])

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyExpanded, JSON.stringify(expandedCols))
    } catch (_) {
      // ignore
    }
  }, [expandedCols, storageKeyExpanded])

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

  const toggleColumnExpand = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedCols((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  const resetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
    setExpandedCols({})
    try {
      localStorage.removeItem(storageKeyWidths)
      localStorage.removeItem(storageKeyExpanded)
    } catch (_) {
      // ignore
    }
    toast({
      title: 'Larguras redefinidas',
      description: 'As larguras das colunas retornaram aos valores padrão.',
    })
  }

  // Agrupamento por Nº NFe localmente para visualização de linhas repetidas na mesma página
  const [collapsedNfes, setCollapsedNfes] = useState<Set<string>>(new Set())

  const groupedRows = useMemo(() => {
    const groups: Array<{
      nfeKey: string
      displayNfe: string
      items: (VendaConsolidada & { itens_qtd?: number })[]
      hasMultiple: boolean
    }> = []

    const map = new Map<string, (VendaConsolidada & { itens_qtd?: number })[]>()
    const order: string[] = []

    for (const item of items) {
      const key = (item.numero_nfe || '').trim() || `__single_${item.id}`
      if (!map.has(key)) {
        map.set(key, [])
        order.push(key)
      }
      map.get(key)!.push(item)
    }

    for (const key of order) {
      const groupItems = map.get(key)!
      const displayNfe = key.startsWith('__single_') ? '-' : key
      groups.push({
        nfeKey: key,
        displayNfe,
        items: groupItems,
        hasMultiple: groupItems.length > 1,
      })
    }

    return groups
  }, [items])

  const toggleCollapseNfe = (nfeKey: string) => {
    if (isGroupedByNfe) {
      // Se estamos no modo colapsado global, alternar globalmente
      onToggleGroupByNfe()
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

  const columns = RELATORIO_COLUMNS

  return (
    <div className="w-full min-w-0 max-w-full">
      {/* Barra de controle de NFs e Redefinir Larguras */}
      <div className="px-6 py-2.5 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        {/* Lado esquerdo: Botão de Colapsar / Expandir itens de NFe */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={isGroupedByNfe ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleGroupByNfe}
            disabled={loading}
            className={
              isGroupedByNfe
                ? 'bg-[#0B6E99] hover:bg-[#085273] text-white font-bold gap-1.5 text-xs shadow-2xs h-8'
                : 'bg-white border-gray-200 text-slate-700 hover:bg-slate-50 hover:text-[#0B6E99] font-bold gap-1.5 text-xs shadow-2xs h-8'
            }
            title={
              isGroupedByNfe
                ? 'Expandir para visualizar todos os itens detalhados'
                : 'Colapsar todos os dados por Nota Fiscal (consolidado em 1 linha por NF)'
            }
          >
            {isGroupedByNfe ? (
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

          {isGroupedByNfe && (
            <Badge
              variant="outline"
              className="bg-cyan-50 text-[#0B6E99] border-cyan-200 font-medium px-2 py-0.5 text-[11px]"
            >
              Modo compacto: 1 linha por NF em todo o filtro
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={resetColumnWidths}
            className="bg-white border-gray-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold gap-1.5 h-8 ml-1"
            title="Redefinir larguras das colunas para os padrões"
          >
            <RotateCw className="w-3.5 h-3.5 text-slate-500" />
            Redefinir Larguras
          </Button>
        </div>

        {/* Lado direito: Resumo de origens ou ações extras */}
        <div className="flex items-center flex-wrap gap-2">
          {showOriginSummary && totalNetsales !== undefined && totalRacnew !== undefined && (
            <>
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
            </>
          )}

          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExport()}
              disabled={exporting || totalItems === 0}
              className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 font-bold gap-1.5 h-8 text-xs"
              title={
                isGroupedByNfe
                  ? 'Exportar relatório consolidado por NF (compacto)'
                  : 'Exportar relatório completo com todos os itens'
              }
            >
              {exporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0B6E99]" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-[#0B6E99]" />
                  {isGroupedByNfe
                    ? `Exportar por NF (${totalItems})`
                    : `Exportar CSV (${totalItems})`}
                </>
              )}
            </Button>
          )}

          {titleRightActions}
        </div>
      </div>

      {/* Conteúdo da Tabela com Overlay Translúcido quando Loading e já com itens */}
      <div className="p-0 min-w-0 max-w-full relative">
        {loading && items.length > 0 && (
          <div className="absolute inset-0 z-30 bg-white/70 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 pointer-events-auto transition-opacity animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white shadow-md border border-slate-200">
              <Loader2 className="w-4 h-4 text-[#0B6E99] animate-spin" />
              <span className="text-xs font-bold text-slate-800">Recalculando dados...</span>
            </div>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Search className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Nenhum registro encontrado</p>
            <p className="text-xs text-slate-400 mt-1">
              Tente ajustar os filtros selecionados acima.
            </p>
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full overflow-x-auto relative custom-scrollbar">
            <table
              className="text-left text-xs border-collapse"
              style={{ minWidth: 'max-content', width: '100%' }}
            >
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
                    const isSorted = sortField === col.sortKey

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
                            onClick={() => onSort(col.sortKey)}
                            className="flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 truncate focus:outline-hidden text-left flex-1"
                            title={`Ordenar por ${col.label}`}
                          >
                            <span className="truncate">{col.label}</span>
                            {isSorted ? (
                              <span className="text-[10px] text-[#0B6E99] font-bold shrink-0">
                                {sortDir === 'asc' ? '▲' : '▼'}
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

                        {/* Alça interativa de redimensionamento de coluna */}
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

                            {/* Renderização de cada coluna na ordem exata solicitada */}
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
                                        {isGroupedByNfe && item.itens_qtd && item.itens_qtd > 1 ? (
                                          <Badge
                                            variant="secondary"
                                            className="text-[9px] px-1.5 py-0 h-4 bg-cyan-100 text-cyan-900 border-none font-sans font-bold shrink-0"
                                            title={`${item.itens_qtd} itens na Nota Fiscal`}
                                          >
                                            +{item.itens_qtd - 1}
                                          </Badge>
                                        ) : isGroupedByNfe ? (
                                          <Badge
                                            variant="outline"
                                            className="text-[8px] px-1 py-0 h-3.5 bg-slate-100 text-slate-600 border-slate-200 shrink-0 font-sans"
                                          >
                                            NF
                                          </Badge>
                                        ) : null}
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
                                      {item.tem_netsales && item.tem_racnew ? (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 inline-flex items-center gap-1"
                                        >
                                          Consolidado
                                        </Badge>
                                      ) : item.tem_netsales ? (
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
                                          isExpanded ? 'whitespace-normal break-words' : 'truncate'
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
      </div>

      {/* Paginação da Tabela */}
      <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          Mostrando{' '}
          <span className="font-semibold text-slate-800">
            {totalItems === 0 ? 0 : (page - 1) * pageSize + 1}
          </span>{' '}
          a{' '}
          <span className="font-semibold text-slate-800">
            {Math.min(page * pageSize, totalItems)}
          </span>{' '}
          de <span className="font-semibold text-slate-800">{totalItems}</span>{' '}
          {isGroupedByNfe ? 'notas fiscais' : 'registros'}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
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
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
