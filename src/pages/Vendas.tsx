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
} from 'lucide-react'
import { fetchVendas } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { VendaConsolidada, FilterState } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  exportToCSV,
  getGrupoColor,
} from '@/lib/formatters'
import FilterBar from '@/components/FilterBar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

const PAGE_SIZE = 20

type SortField = keyof VendaConsolidada | 'default'

export default function Vendas() {
  const [vendas, setVendas] = useState<VendaConsolidada[]>([])
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
  })

  const loadData = async () => {
    try {
      const data = await fetchVendas()
      setVendas(data)
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
    loadData()
  }, [])

  // Realtime subscription
  useRealtime<VendaConsolidada>('vendas', () => {
    loadData()
  })

  // Extract distinct filter options
  const filterOptions = useMemo(() => {
    const vcSet = new Set<string>()
    const vSet = new Set<string>()
    const giSet = new Set<string>()
    const eSet = new Set<string>()
    const uSet = new Set<string>()

    vendas.forEach((v) => {
      if (v.vendedor_cliente) vcSet.add(v.vendedor_cliente)
      if (v.nome_vendedor) vSet.add(v.nome_vendedor)
      if (v.grupo_item) giSet.add(v.grupo_item)
      if (v.estado) eSet.add(v.estado)
      if (v.utilizacao) uSet.add(v.utilizacao)
    })

    return {
      vendedorCliente: Array.from(vcSet).sort(),
      vendedor: Array.from(vSet).sort(),
      grupoItem: Array.from(giSet).sort(),
      estado: Array.from(eSet).sort(),
      utilizacao: Array.from(uSet).sort(),
    }
  }, [vendas])

  // Filter dataset
  const filteredVendas = useMemo(() => {
    return vendas.filter((v) => {
      // Date filters
      if (filters.dataDe) {
        const vDate = (v.data_lancamento || '').slice(0, 10)
        if (vDate && vDate < filters.dataDe) return false
      }
      if (filters.dataAte) {
        const vDate = (v.data_lancamento || '').slice(0, 10)
        if (vDate && vDate > filters.dataAte) return false
      }

      // Multi-selects
      if (
        filters.vendedorCliente.length > 0 &&
        !filters.vendedorCliente.includes(v.vendedor_cliente)
      ) {
        return false
      }

      if (filters.vendedor.length > 0 && !filters.vendedor.includes(v.nome_vendedor)) {
        return false
      }

      if (filters.grupoItem.length > 0 && !filters.grupoItem.includes(v.grupo_item)) {
        return false
      }

      if (filters.estado.length > 0 && !filters.estado.includes(v.estado)) {
        return false
      }

      if (filters.utilizacao.length > 0 && !filters.utilizacao.includes(v.utilizacao)) {
        return false
      }

      // Text search
      if (filters.search) {
        const q = filters.search.toLowerCase()
        const match =
          (v.nome_cliente || '').toLowerCase().includes(q) ||
          (v.codigo_cliente || '').toLowerCase().includes(q) ||
          (v.codigo_item || '').toLowerCase().includes(q) ||
          (v.descricao_item || '').toLowerCase().includes(q) ||
          (v.numero_nfe || '').toLowerCase().includes(q) ||
          (v.numero_sap || '').toLowerCase().includes(q) ||
          (v.vendedor_cliente || '').toLowerCase().includes(q) ||
          (v.cidade || '').toLowerCase().includes(q) ||
          (v.mercado || '').toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [vendas, filters])

  // Sort dataset
  const sortedVendas = useMemo(() => {
    const list = [...filteredVendas]
    if (sortField === 'default') return list

    list.sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (valA === undefined || valA === null) valA = ''
      if (valB === undefined || valB === null) valB = ''

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA
      }

      const strA = String(valA).toLowerCase()
      const strB = String(valB).toLowerCase()
      return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA)
    })

    return list
  }, [filteredVendas, sortField, sortDir])

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1)
  }, [filters, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedVendas.length / PAGE_SIZE))
  const paginatedVendas = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return sortedVendas.slice(start, start + PAGE_SIZE)
  }, [sortedVendas, page])

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
    if (sortedVendas.length === 0) {
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
      sortedVendas as unknown as Record<string, unknown>[],
      exportColumns,
    )

    toast({
      title: 'Exportação concluída',
      description: `${sortedVendas.length} registros exportados em formato Excel/CSV (UTF-8 BOM).`,
    })
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar with Text Search */}
      <FilterBar filters={filters} setFilters={setFilters} options={filterOptions} showSearch />

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
                {filteredVendas.length} linhas encontradas • Base mestre RacNew com enriquecimento
                NetSales
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
              {filteredVendas.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}
            </span>{' '}
            a{' '}
            <span className="font-semibold text-slate-800">
              {Math.min(page * PAGE_SIZE, filteredVendas.length)}
            </span>{' '}
            de <span className="font-semibold text-slate-800">{filteredVendas.length}</span>{' '}
            registros
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
