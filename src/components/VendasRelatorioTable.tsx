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
import { getJpClass, getJpClassBadgeStyle, JP_CLASS_OPTIONS } from '@/lib/jp-class'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { VendasRelatorioRow } from '@/components/VendasRelatorioRow'
import { ComissaoGroupHeader } from '@/components/ComissaoGroupHeader'
import { JpClassGroupHeader } from '@/components/JpClassGroupHeader'

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
  { key: 'tipo_cliente', label: 'Tipo de Cliente', type: 'badge', sortKey: 'tipo_cliente' },
  { key: 'vendedor_cliente', label: 'Vendedor', type: 'text', sortKey: 'vendedor_cliente' },
  { key: 'descricao_item', label: 'Descrição', type: 'text', sortKey: 'descricao_item' },
  { key: 'jp_class', label: 'JP-Class', type: 'badge', sortKey: 'jp_class' },
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
  { key: 'status_cadastro', label: 'Status do Cadastro', type: 'text', sortKey: 'status_cadastro' },
  { key: 'tipo_pn', label: 'Tipo de PN', type: 'text', sortKey: 'tipo_pn' },
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
  tipo_cliente: 160,
  status_cadastro: 150,
  tipo_pn: 130,
  vendedor_cliente: 220,
  descricao_item: 280,
  jp_class: 120,
  quantidade: 90,
  grupo_item: 140,
  total_linha: 140,
  utilizacao: 180,
}

const MIN_COLUMN_WIDTH = 60

export type RelatorioGroupByMode = 'none' | 'jp_class' | 'comissao'

export const PREFIXO_NAO_COMISSIONADO = 'Roland DG Brasil > '

/**
 * Classifica a venda entre Comissionado e Não Comissionado.
 * Regra do Silvio:
 * - Não Comissionados: Vendedor inicia com "Roland DG Brasil > " (case-insensitive, tolerante a espaços)
 * - Comissionados: todos os demais (vendedores que não iniciam com esse prefixo, vazios, sem vendedor)
 */
export function isVendedorNaoComissionado(venda: {
  vendedor_cliente?: string | null
  nome_vendedor?: string | null
}): boolean {
  const rawVendedor = (venda.vendedor_cliente || venda.nome_vendedor || '').trim()
  return rawVendedor.toLowerCase().startsWith('roland dg brasil >')
}

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
  groupByMode?: RelatorioGroupByMode
  onGroupByModeChange?: (mode: RelatorioGroupByMode) => void
  defaultGroupByMode?: RelatorioGroupByMode
  allowedGroupByModes?: RelatorioGroupByMode[]
  hidePagination?: boolean
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
  groupByMode: propGroupByMode,
  onGroupByModeChange,
  defaultGroupByMode = 'none',
  allowedGroupByModes = ['none', 'jp_class', 'comissao'],
  hidePagination = false,
}: VendasRelatorioTableProps) {
  const { toast } = useToast()

  // Se comissao for o padrão e permitido, e storageKeyPrefix indicar canais, usamos fallback inteligente
  const effectiveDefaultMode: RelatorioGroupByMode = defaultGroupByMode

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

  // Agrupamento selecionado (Persistido por prefixo de storage)
  const storageKeyGroupBy = `${storageKeyPrefix}_group_by_v2`
  const [internalGroupByMode, setInternalGroupByMode] = useState<RelatorioGroupByMode>(() => {
    try {
      const saved = localStorage.getItem(storageKeyGroupBy)
      if (
        (saved === 'none' || saved === 'jp_class' || saved === 'comissao') &&
        allowedGroupByModes.includes(saved as RelatorioGroupByMode)
      ) {
        return saved as RelatorioGroupByMode
      }
    } catch (_) {
      // ignore
    }
    return effectiveDefaultMode
  })

  const groupByMode: RelatorioGroupByMode =
    propGroupByMode !== undefined ? propGroupByMode : internalGroupByMode

  const setGroupByMode = (mode: RelatorioGroupByMode) => {
    setInternalGroupByMode(mode)
    try {
      localStorage.setItem(storageKeyGroupBy, mode)
    } catch (_) {
      // ignore
    }
    onGroupByModeChange?.(mode)
  }

  useEffect(() => {
    if (propGroupByMode !== undefined && propGroupByMode !== internalGroupByMode) {
      setInternalGroupByMode(propGroupByMode)
    }
  }, [propGroupByMode])

  useEffect(() => {
    try {
      localStorage.setItem(storageKeyGroupBy, groupByMode)
    } catch (_) {
      // ignore
    }
  }, [groupByMode, storageKeyGroupBy])

  // Grupos colapsados do JP-Class (padrão colapsado quando ativado)
  const [collapsedJpGroups, setCollapsedJpGroups] = useState<Set<string>>(new Set())

  // Sempre que mudar para modo jp_class, inicializa colapsado por padrão
  useEffect(() => {
    if (groupByMode === 'jp_class') {
      setCollapsedJpGroups(new Set(JP_CLASS_OPTIONS))
    } else {
      setCollapsedJpGroups(new Set())
    }
  }, [groupByMode])

  const toggleCollapseJpGroup = React.useCallback((groupKey: string) => {
    setCollapsedJpGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }, [])

  const collapseAllJpGroups = React.useCallback(() => {
    setCollapsedJpGroups(new Set(JP_CLASS_OPTIONS))
  }, [])

  const expandAllJpGroups = React.useCallback(() => {
    setCollapsedJpGroups(new Set())
  }, [])

  // Grupos colapsados do modo Comissionados / Não Comissionados (chaves 'comissionados' e 'nao_comissionados')
  // Padrão: grupos ABERTOS (expandidos) para o usuário ver os dados imediatamente, mas colapsáveis com chevron
  const [collapsedComissaoGroups, setCollapsedComissaoGroups] = useState<Set<string>>(new Set())

  const toggleCollapseComissaoGroup = React.useCallback((groupKey: string) => {
    setCollapsedComissaoGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }, [])

  const collapseAllComissaoGroups = React.useCallback(() => {
    setCollapsedComissaoGroups(new Set(['comissionados', 'nao_comissionados']))
  }, [])

  const expandAllComissaoGroups = React.useCallback(() => {
    setCollapsedComissaoGroups(new Set())
  }, [])

  // Agrupamento por Nº NFe localmente para visualização de linhas repetidas na mesma página
  const [collapsedNfes, setCollapsedNfes] = useState<Set<string>>(new Set())

  // Função auxiliar para agrupar linhas por NFe
  const buildNfeGroups = React.useCallback(
    (itemList: (VendaConsolidada & { itens_qtd?: number })[]) => {
      const groups: Array<{
        nfeKey: string
        displayNfe: string
        items: (VendaConsolidada & { itens_qtd?: number })[]
        hasMultiple: boolean
      }> = []

      const map = new Map<string, (VendaConsolidada & { itens_qtd?: number })[]>()
      const order: string[] = []

      for (const item of itemList) {
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
    },
    [],
  )

  const groupedRows = useMemo(() => {
    return buildNfeGroups(items)
  }, [items])

  // Estrutura de grupos de JP-Class sobre as linhas do relatório
  interface JpClassGroupInfo {
    key: string
    title: string
    items: (VendaConsolidada & { itens_qtd?: number })[]
    nfeGroups: Array<{
      nfeKey: string
      displayNfe: string
      items: (VendaConsolidada & { itens_qtd?: number })[]
      hasMultiple: boolean
    }>
    count: number
    subtotal: number
    subtotalLiquido: number
    subtotalCusto: number
    subtotalLucroBruto: number
    totalQuantidade: number
  }

  const jpClassGroups = useMemo<JpClassGroupInfo[]>(() => {
    if (groupByMode !== 'jp_class') return []

    // Mapeamento das 4 classes canônicas
    const map = new Map<string, (VendaConsolidada & { itens_qtd?: number })[]>()
    for (const opt of JP_CLASS_OPTIONS) {
      map.set(opt, [])
    }

    for (const item of items) {
      const rawDerived = getJpClass(item.grupo_item)
      let standardGroup: string
      if (rawDerived === 'HARD' || rawDerived === 'INKS' || rawDerived === 'OTHERS') {
        standardGroup = rawDerived
      } else {
        standardGroup = 'Sem classe'
      }
      map.get(standardGroup)!.push(item)
    }

    // Retorna os grupos na ordem de JP_CLASS_OPTIONS que contenham linhas
    const result: JpClassGroupInfo[] = []
    for (const opt of JP_CLASS_OPTIONS) {
      const gItems = map.get(opt) || []
      if (gItems.length > 0) {
        let subtotal = 0
        let subtotalLiquido = 0
        let subtotalCusto = 0
        let subtotalLucroBruto = 0
        let totalQuantidade = 0
        for (const it of gItems) {
          subtotal += Number(it.total_linha) || 0
          subtotalLiquido += Number(it.valor_liquido) || 0
          subtotalCusto += Number(it.custo_total) || 0
          subtotalLucroBruto += Number(it.lucro_bruto) || 0
          totalQuantidade += Number(it.quantidade) || 0
        }
        result.push({
          key: opt,
          title: opt,
          items: gItems,
          nfeGroups: buildNfeGroups(gItems),
          count: gItems.length,
          subtotal,
          subtotalLiquido,
          subtotalCusto,
          subtotalLucroBruto,
          totalQuantidade,
        })
      }
    }

    return result
  }, [items, groupByMode])

  // Estrutura de grupos: Comissionados e Não Comissionados
  interface ComissaoGroupInfo {
    key: 'comissionados' | 'nao_comissionados'
    title: string
    descricao: string
    items: (VendaConsolidada & { itens_qtd?: number })[]
    nfeGroups: Array<{
      nfeKey: string
      displayNfe: string
      items: (VendaConsolidada & { itens_qtd?: number })[]
      hasMultiple: boolean
    }>
    count: number
    vendedoresCount: number
    subtotal: number
    subtotalLiquido: number
    totalQuantidade: number
  }

  const comissaoGroups = useMemo<ComissaoGroupInfo[]>(() => {
    if (groupByMode !== 'comissao') return []

    const comissionadosItems: (VendaConsolidada & { itens_qtd?: number })[] = []
    const naoComissionadosItems: (VendaConsolidada & { itens_qtd?: number })[] = []

    for (const item of items) {
      if (isVendedorNaoComissionado(item)) {
        naoComissionadosItems.push(item)
      } else {
        comissionadosItems.push(item)
      }
    }

    const calcGroup = (
      key: 'comissionados' | 'nao_comissionados',
      title: string,
      descricao: string,
      gItems: (VendaConsolidada & { itens_qtd?: number })[],
    ): ComissaoGroupInfo => {
      let subtotal = 0
      let subtotalLiquido = 0
      let totalQuantidade = 0
      const vendedoresSet = new Set<string>()

      for (const it of gItems) {
        subtotal += Number(it.total_linha) || 0
        subtotalLiquido += Number(it.valor_liquido) || 0
        totalQuantidade += Number(it.quantidade) || 0
        const vend = (it.vendedor_cliente || it.nome_vendedor || '').trim()
        if (vend) {
          vendedoresSet.add(vend)
        }
      }

      return {
        key,
        title,
        descricao,
        items: gItems,
        nfeGroups: buildNfeGroups(gItems),
        count: gItems.length,
        vendedoresCount: vendedoresSet.size,
        subtotal,
        subtotalLiquido,
        totalQuantidade,
      }
    }

    // Grupo 1: Comissionados (vendedores não iniciados com 'Roland DG Brasil > ')
    // Grupo 2: Não Comissionados (vendedores iniciados com 'Roland DG Brasil > ')
    return [
      calcGroup(
        'comissionados',
        'Comissionados',
        'Vendedores e canais externos',
        comissionadosItems,
      ),
      calcGroup(
        'nao_comissionados',
        'Não Comissionados',
        'Vendas diretas Roland DG Brasil',
        naoComissionadosItems,
      ),
    ]
  }, [items, groupByMode, buildNfeGroups])

  const toggleCollapseNfe = React.useCallback(
    (nfeKey: string) => {
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
    },
    [isGroupedByNfe, onToggleGroupByNfe],
  )

  const columns = RELATORIO_COLUMNS

  // Renderizador de linha de item de venda (reutilizado tanto no modo flat quanto no modo agrupado por JP-Class)
  const renderItemRow = React.useCallback(
    (
      item: VendaConsolidada & { itens_qtd?: number },
      itemIdx: number,
      group: {
        nfeKey: string
        displayNfe: string
        items: (VendaConsolidada & { itens_qtd?: number })[]
        hasMultiple: boolean
      },
    ) => {
      return (
        <VendasRelatorioRow
          key={item.id}
          item={item}
          itemIdx={itemIdx}
          nfeKey={group.nfeKey}
          displayNfe={group.displayNfe}
          groupItemsLength={group.items.length}
          hasMultiple={group.hasMultiple}
          isCollapsed={collapsedNfes.has(group.nfeKey)}
          isGroupedByNfe={isGroupedByNfe}
          columns={columns}
          columnWidths={columnWidths}
          expandedCols={expandedCols}
          onToggleCollapseNfe={toggleCollapseNfe}
        />
      )
    },
    [collapsedNfes, isGroupedByNfe, columns, columnWidths, expandedCols, toggleCollapseNfe],
  )

  return (
    <div className="w-full min-w-0 max-w-full">
      {/* Barra de controle: Agrupamento, NFs e Redefinir Larguras */}
      <div className="px-6 py-2.5 bg-slate-50/60 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        {/* Lado esquerdo: Seletor de agrupamento e controles */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Seletor de Agrupamento */}
          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-500 pl-2 pr-1 uppercase tracking-wider flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#0B6E99]" />
              Agrupar:
            </span>
            {allowedGroupByModes.includes('comissao') && (
              <button
                type="button"
                onClick={() => setGroupByMode('comissao')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  groupByMode === 'comissao'
                    ? 'bg-[#0B6E99] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Agrupar em 1. Comissionados e 2. Não Comissionados"
              >
                Comissão
                {groupByMode === 'comissao' && (
                  <span className="text-[10px] bg-white/20 px-1 rounded-sm">2</span>
                )}
              </button>
            )}
            {allowedGroupByModes.includes('none') && (
              <button
                type="button"
                onClick={() => setGroupByMode('none')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  groupByMode === 'none'
                    ? 'bg-slate-800 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Sem Agrupamento
              </button>
            )}
            {allowedGroupByModes.includes('jp_class') && (
              <button
                type="button"
                onClick={() => setGroupByMode('jp_class')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  groupByMode === 'jp_class'
                    ? 'bg-[#0B6E99] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                JP-Class
                {groupByMode === 'jp_class' && (
                  <span className="text-[10px] bg-white/20 px-1 rounded-sm">
                    {jpClassGroups.length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Botões Expandir Todos / Colapsar Todos para Comissão */}
          {groupByMode === 'comissao' && (
            <div className="inline-flex items-center gap-1 ml-1">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAllComissaoGroups}
                className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 hover:text-[#0B6E99] text-xs font-semibold gap-1 h-8"
                title="Expandir Comissionados e Não Comissionados"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                Expandir Grupos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAllComissaoGroups}
                className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 hover:text-[#0B6E99] text-xs font-semibold gap-1 h-8"
                title="Colapsar Comissionados e Não Comissionados"
              >
                <ChevronsDownUp className="w-3.5 h-3.5 text-[#0B6E99]" />
                Colapsar Grupos
              </Button>
            </div>
          )}

          {/* Botões Expandir Todos / Colapsar Todos para JP-Class */}
          {groupByMode === 'jp_class' && (
            <div className="inline-flex items-center gap-1 ml-1">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAllJpGroups}
                className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 hover:text-[#0B6E99] text-xs font-semibold gap-1 h-8"
                title="Expandir todos os grupos JP-Class"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                Expandir Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAllJpGroups}
                className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 hover:text-[#0B6E99] text-xs font-semibold gap-1 h-8"
                title="Colapsar todos os grupos JP-Class"
              >
                <ChevronsDownUp className="w-3.5 h-3.5 text-[#0B6E99]" />
                Colapsar Todos
              </Button>
            </div>
          )}

          {/* Botão de Colapsar / Expandir itens de NFe */}
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
                Expandir Itens NF
              </>
            ) : (
              <>
                <ChevronsDownUp className="w-3.5 h-3.5 text-[#0B6E99]" />
                Colapsar por NF
              </>
            )}
          </Button>

          {isGroupedByNfe && (
            <Badge
              variant="outline"
              className="bg-cyan-50 text-[#0B6E99] border-cyan-200 font-medium px-2 py-0.5 text-[11px]"
            >
              1 linha por NF
            </Badge>
          )}

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
                {groupByMode === 'comissao'
                  ? /* MODO AGRUPADO: 1. COMISSIONADOS e 2. NÃO COMISSIONADOS */
                    comissaoGroups.map((cGroup, gIndex) => {
                      const isCollapsed = collapsedComissaoGroups.has(cGroup.key)
                      const isComissionado = cGroup.key === 'comissionados'

                      return (
                        <React.Fragment key={cGroup.key}>
                          {/* Cabeçalho do Grupo (Nunca é escondido ao colapsar) */}
                          <ComissaoGroupHeader
                            groupKey={cGroup.key}
                            title={cGroup.title}
                            gIndex={gIndex}
                            isCollapsed={isCollapsed}
                            isComissionado={isComissionado}
                            count={cGroup.count}
                            vendedoresCount={cGroup.vendedoresCount}
                            totalQuantidade={cGroup.totalQuantidade}
                            subtotal={cGroup.subtotal}
                            subtotalLiquido={cGroup.subtotalLiquido}
                            columnsCount={columns.length}
                            onToggleCollapse={toggleCollapseComissaoGroup}
                          />

                          {/* Linhas filhas (Apenas exibidas se o grupo NÃO estiver colapsado) */}
                          {!isCollapsed &&
                            (cGroup.items.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={columns.length + 1}
                                  className="py-4 px-6 text-center text-xs text-slate-400 italic bg-slate-50/40"
                                >
                                  Nenhum registro para {cGroup.title} nos filtros atuais.
                                </td>
                              </tr>
                            ) : (
                              cGroup.nfeGroups.map((nfeGroup) => {
                                const isNfeCollapsed = collapsedNfes.has(nfeGroup.nfeKey)
                                const visibleItems = isNfeCollapsed
                                  ? [nfeGroup.items[0]]
                                  : nfeGroup.items

                                return (
                                  <React.Fragment key={`${cGroup.key}_${nfeGroup.nfeKey}`}>
                                    {visibleItems.map((item, itemIdx) =>
                                      renderItemRow(item, itemIdx, nfeGroup),
                                    )}
                                  </React.Fragment>
                                )
                              })
                            ))}
                        </React.Fragment>
                      )
                    })
                  : groupByMode === 'jp_class'
                    ? /* MODO AGRUPADO POR JP-CLASS */
                      jpClassGroups.map((jpGroup) => {
                        const isCollapsed = collapsedJpGroups.has(jpGroup.key)
                        const badgeStyle = getJpClassBadgeStyle(jpGroup.key)

                        return (
                          <React.Fragment key={jpGroup.key}>
                            {/* Cabeçalho do Grupo JP-Class */}
                            <JpClassGroupHeader
                              groupKey={jpGroup.key}
                              title={jpGroup.title}
                              isCollapsed={isCollapsed}
                              badgeClassName={badgeStyle.className}
                              count={jpGroup.count}
                              totalQuantidade={jpGroup.totalQuantidade}
                              subtotal={jpGroup.subtotal}
                              subtotalLiquido={jpGroup.subtotalLiquido}
                              columnsCount={columns.length}
                              onToggleCollapse={toggleCollapseJpGroup}
                            />

                            {/* Linhas detalhadas quando o grupo JP-Class estiver expandido */}
                            {!isCollapsed &&
                              jpGroup.nfeGroups.map((nfeGroup) => {
                                const isNfeCollapsed = collapsedNfes.has(nfeGroup.nfeKey)
                                const visibleItems = isNfeCollapsed
                                  ? [nfeGroup.items[0]]
                                  : nfeGroup.items

                                return (
                                  <React.Fragment key={`${jpGroup.key}_${nfeGroup.nfeKey}`}>
                                    {visibleItems.map((item, itemIdx) =>
                                      renderItemRow(item, itemIdx, nfeGroup),
                                    )}
                                  </React.Fragment>
                                )
                              })}
                          </React.Fragment>
                        )
                      })
                    : /* MODO SEM AGRUPAMENTO (FLAT / AGRUPADO POR NFE) */
                      groupedRows.map((group) => {
                        const isCollapsed = collapsedNfes.has(group.nfeKey)
                        const visibleItems = isCollapsed ? [group.items[0]] : group.items

                        return (
                          <React.Fragment key={group.nfeKey}>
                            {visibleItems.map((item, itemIdx) =>
                              renderItemRow(item, itemIdx, group),
                            )}
                          </React.Fragment>
                        )
                      })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação da Tabela (no modo Comissão opera em página única consolidada sem quebra de paginação) */}
      {!hidePagination && groupByMode !== 'comissao' && (
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
      )}
    </div>
  )
}
