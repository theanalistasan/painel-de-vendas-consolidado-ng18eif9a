import React, { useEffect, useMemo, useState } from 'react'
import {
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Package,
  Layers,
  FileSpreadsheet,
  RefreshCw,
  DollarSign,
  TrendingUp,
  FileText,
  RotateCcw,
} from 'lucide-react'
import { fetchVendasList, fetchDashboardStats } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { VendaConsolidada, FilterState } from '@/types/sales'
import { isDevolucao } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  exportToCSV,
  getGrupoColor,
  extractAno,
  extractMes,
  extractDia,
} from '@/lib/formatters'
import FilterBar from '@/components/FilterBar'
import KpiCard from '@/components/KpiCard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

const PAGE_SIZE = 20

type SortField = keyof VendaConsolidada | 'default'

export default function Vendas() {
  const [paginatedVendas, setPaginatedVendas] = useState<VendaConsolidada[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('data_lancamento')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const { toast } = useToast()

  const [filters, setFilters] = useState<FilterState>({
    dataDe: '',
    dataAte: '',
    vendedorCliente: [],
    vendedor: [],
    grupoItem: [],
    estado: [],
    utilizacao: [],
    search: '',
    ano: '',
    mes: '',
    dia: '',
    tipoDevolucao: '',
  })

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
    anos: [] as number[],
    meses: [] as number[],
    dias: [] as number[],
  })

  // Carrega opções de filtro e KPIs via endpoint do dashboard
  const loadStats = async () => {
    try {
      const stats = await fetchDashboardStats(filters as unknown as Record<string, unknown>)
      if (stats) {
        setKpis({
          faturamento: stats.kpis?.faturamento || 0,
          valorLiquido: stats.kpis?.valorLiquido || 0,
          itensVendidos: stats.kpis?.itensVendidos || 0,
          documentos: stats.kpis?.documentos || 0,
          devolucoes: 0,
        })
        if (stats.filterOptions) {
          setFilterOptions(stats.filterOptions)
        }
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas:', err)
    }
  }

  // Carrega a página atual de vendas via endpoint paginado
  const loadData = async () => {
    setLoading(true)
    try {
      const sortString =
        sortField === 'default'
          ? '-data_lancamento'
          : `${sortDir === 'desc' ? '-' : ''}${String(sortField)}`
      const res = await fetchVendasList({
        page,
        perPage: PAGE_SIZE,
        sort: sortString,
        filters: filters as unknown as Record<string, unknown>,
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
    loadStats()
  }, [filters])

  useEffect(() => {
    loadData()
  }, [page, sortField, sortDir, filters])

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1)
  }, [filters, sortField, sortDir])

  // Realtime subscription
  useRealtime<VendaConsolidada>('vendas', () => {
    loadStats()
    loadData()
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Column definitions for Table & Export (exact order requested)
  const columns = [
    { key: 'data_lancamento', label: 'Data de Lançamento', type: 'date' },
    { key: 'numero_nfe', label: 'Nº NFe', type: 'text' },
    { key: 'numero_sap', label: 'Número SAP', type: 'text' },
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

  const handleExportCSV = () => {
    if (paginatedVendas.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum dado para exportar',
        description: 'A lista atual está vazia com os filtros selecionados.',
      })
      return
    }

    const exportColumns = columns.map((c) => ({
      key: c.key,
      label: c.label,
    }))

    const dateStr = new Date().toISOString().slice(0, 10)
    exportToCSV(
      `vendas_consolidadas_${dateStr}`,
      paginatedVendas as unknown as Record<string, unknown>[],
      exportColumns,
    )

    toast({
      title: 'Exportação concluída',
      description: `${paginatedVendas.length} registros exportados em formato Excel/CSV (UTF-8 BOM).`,
    })
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar with Text Search */}
      <FilterBar filters={filters} setFilters={setFilters} options={filterOptions} showSearch />

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
                {totalItems} linhas encontradas • Base mestre RacNew com enriquecimento NetSales
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCSV}
                className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold gap-1.5 shadow-2xs"
              >
                <Download className="w-4 h-4 text-indigo-600" />
                Exportar CSV
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
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key as SortField)}
                        className="py-3 px-3.5 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{col.label}</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-700" />
                          {sortField === col.key && (
                            <span className="text-[10px] text-indigo-600 font-bold">
                              {sortDir === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedVendas.map((item) => (
                    <tr key={item.id} className="hover:bg-indigo-50/20 transition-colors group">
                      {/* 1. Data de Lancamento */}
                      <td className="py-2.5 px-3.5 font-medium text-slate-700">
                        {formatDate(item.data_lancamento)}
                      </td>

                      {/* 2. Nº NFe */}
                      <td className="py-2.5 px-3.5 font-mono font-semibold text-slate-900">
                        {item.numero_nfe || '-'}
                      </td>

                      {/* 3. Número SAP */}
                      <td className="py-2.5 px-3.5 font-mono text-slate-600">
                        {item.numero_sap || '-'}
                      </td>

                      {/* 4. Código do Cliente */}
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
                      <td className="py-2.5 px-3.5 text-slate-700">{item.nome_vendedor || '-'}</td>

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
                      <td className="py-2.5 px-3.5 text-slate-700">{item.utilizacao || '-'}</td>

                      {/* 19. Estado */}
                      <td className="py-2.5 px-3.5 text-center font-semibold text-slate-800">
                        {item.estado || '-'}
                      </td>

                      {/* 20. Cidade */}
                      <td className="py-2.5 px-3.5 text-slate-700">{item.cidade || '-'}</td>

                      {/* 21. Classificação (NetSales) */}
                      <td className="py-2.5 px-3.5 text-slate-700">{item.classificacao || '-'}</td>

                      {/* 22. Grupo do Cliente (NetSales) */}
                      <td className="py-2.5 px-3.5 text-slate-600">{item.grupo_cliente || '-'}</td>

                      {/* 23. Mercado (NetSales) */}
                      <td className="py-2.5 px-3.5 text-slate-600">{item.mercado || '-'}</td>

                      {/* 24. Usuário Emitente (NetSales) */}
                      <td className="py-2.5 px-3.5 text-slate-500 font-mono text-[11px]">
                        {item.usuario_emissor_pedido || '-'}
                      </td>
                    </tr>
                  ))}
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
