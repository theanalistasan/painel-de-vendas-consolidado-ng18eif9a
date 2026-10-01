import React, { useEffect, useRef, useState } from 'react'
import {
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Package,
  Clock,
  Layers,
  DollarSign,
  TrendingUp,
  FileText,
  RotateCw,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Truck,
  Boxes,
} from 'lucide-react'
import { fetchPedidosAbertosList, fetchPedidosAbertosStats } from '@/services/pedidosAbertos'
import { fetchDashboardStats } from '@/services/sales'
import { logAudit } from '@/services/audit'
import type {
  PedidoAberto,
  CanalOption,
  CanalClienteOption,
  PedidosAbertosKpis,
} from '@/types/sales'
import { formatCurrency, formatNumber, formatDate, exportToCSV } from '@/lib/formatters'
import PedidosAbertosFilterBar, {
  PedidosAbertosFilters,
  EMPTY_PEDIDOS_ABERTOS_FILTERS,
} from '@/components/PedidosAbertosFilterBar'
import KpiCard from '@/components/KpiCard'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useTableSort } from '@/hooks/use-table-sort'

const PAGE_SIZE = 25

type SortField = Extract<keyof PedidoAberto, string>

export default function PedidosAbertos() {
  const [paginatedPedidos, setPaginatedPedidos] = useState<PedidoAberto[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalValor, setTotalValor] = useState(0)
  const [totalQtd, setTotalQtd] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const sort = useTableSort<SortField>()
  const { toast } = useToast()

  const [filters, setFilters] = useState<PedidosAbertosFilters>(() => ({
    ...EMPTY_PEDIDOS_ABERTOS_FILTERS,
  }))

  const [kpis, setKpis] = useState<PedidosAbertosKpis>({
    valorTotalAberto: 0,
    pedidosDistintos: 0,
    itensPendentes: 0,
    clientesDistintos: 0,
  })

  const [filterOptions, setFilterOptions] = useState<{
    canais?: CanalOption[]
    canaisClientes?: CanalClienteOption[]
    inside?: string[]
  }>({
    canais: [],
    canaisClientes: [],
    inside: [],
  })

  const [statsLoading, setStatsLoading] = useState(false)

  // Carrega opções de canais e KPIs de pedidos abertos
  const loadStats = async (activeFilters = filters) => {
    try {
      setStatsLoading(true)
      const [statsVendas, statsPedidos] = await Promise.all([
        fetchDashboardStats({}),
        fetchPedidosAbertosStats(activeFilters as unknown as Record<string, unknown>),
      ])

      if (statsPedidos?.kpis) {
        setKpis(statsPedidos.kpis)
      }

      if (statsVendas?.filterOptions) {
        setFilterOptions({
          canais: statsVendas.filterOptions.canais || [],
          canaisClientes: statsVendas.filterOptions.canaisClientes || [],
          inside: statsVendas.filterOptions.inside || [],
        })
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas de pedidos abertos:', err)
    } finally {
      setStatsLoading(false)
    }
  }

  // Carrega a lista paginada de pedidos em aberto
  const loadData = async (
    activeFilters = filters,
    targetPage = page,
    sortField = sort.field,
    sortDir = sort.dir,
    search = searchTerm,
  ) => {
    setLoading(true)
    try {
      const res = await fetchPedidosAbertosList({
        page: targetPage,
        perPage: PAGE_SIZE,
        sortField: sortField || 'data_pedido',
        sortDirection: sortDir || 'desc',
        search: search.trim() || undefined,
        filters: activeFilters as unknown as Record<string, unknown>,
      })

      setPaginatedPedidos(res.items || [])
      setTotalItems(res.totalItems || 0)
      setTotalPages(res.totalPages || 1)
      setTotalValor(res.totalValor || 0)
      setTotalQtd(res.totalQtd || 0)
    } catch (err: unknown) {
      console.error('Erro ao listar pedidos em aberto:', err)
      const msg =
        err instanceof Error ? err.message : 'Não foi possível carregar os pedidos em aberto.'
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar pedidos em aberto',
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    logAudit('pedidos_abertos_view', 'Acesso ao módulo Pedidos em Aberto (SAP)')
  }, [])

  useEffect(() => {
    loadStats(filters)
  }, [filters])

  useEffect(() => {
    loadData(filters, page, sort.field, sort.dir, searchTerm)
  }, [page, filters, sort.field, sort.dir])

  const handleApplyFilters = (applied: PedidosAbertosFilters) => {
    setPage(1)
    loadStats(applied)
    loadData(applied, 1, sort.field, sort.dir, searchTerm)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadData(filters, 1, sort.field, sort.dir, searchTerm)
  }

  const handleSort = (field: SortField) => {
    sort.toggle(field)
    setPage(1)
  }

  const handleExportCSV = async () => {
    if (totalItems === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum dado para exportar',
        description: 'Não há pedidos em aberto com os filtros atuais.',
      })
      return
    }

    setExporting(true)
    toast({
      title: 'Gerando exportação de Pedidos em Aberto...',
      description: 'Buscando todos os registros filtrados...',
    })

    try {
      // Busca até 1000 registros para exportação
      const res = await fetchPedidosAbertosList({
        page: 1,
        perPage: 1000,
        sortField: sort.field || 'data_pedido',
        sortDirection: sort.dir || 'desc',
        search: searchTerm.trim() || undefined,
        filters: filters as unknown as Record<string, unknown>,
      })

      const rows = res.items || []
      const exportCols = [
        { key: 'numero_pedido', label: 'Nº Pedido' },
        { key: 'linha', label: 'Linha' },
        { key: 'data_pedido', label: 'Data do Pedido' },
        { key: 'codigo_cliente', label: 'Código Cliente' },
        { key: 'nome_cliente', label: 'Nome Cliente' },
        { key: 'nome_canal', label: 'Canal' },
        { key: 'deploy', label: 'Deploy' },
        { key: 'inside', label: 'Inside' },
        { key: 'codigo_item', label: 'Código Item' },
        { key: 'descricao_item', label: 'Descrição Item' },
        { key: 'grupo_item', label: 'Grupo do Item' },
        { key: 'qtd_solicitada', label: 'Qtd Solicitada' },
        { key: 'qtd_aberto', label: 'Qtd Aberto' },
        { key: 'em_estoque', label: 'Em Estoque' },
        { key: 'em_transito', label: 'Em Trânsito' },
        { key: 'deposito', label: 'Depósito' },
        { key: 'preco_unitario', label: 'Preço Unitário' },
        { key: 'desconto_percentual', label: '% Desconto' },
        { key: 'preco_apos_desconto', label: 'Preço após desconto' },
        { key: 'valor_em_aberto', label: 'Valor em Aberto (R$)' },
        { key: 'status_linha', label: 'Status da Linha' },
        { key: 'status', label: 'Status' },
        { key: 'usuario_emitente', label: 'Usuário Emitente' },
        { key: 'origem', label: 'Origem' },
      ]

      const formatted = rows.map((r) => ({
        ...r,
        data_pedido: r.data_pedido ? formatDate(r.data_pedido) : '',
        valor_em_aberto: r.valor_em_aberto?.toFixed(2) || '0.00',
        preco_unitario: r.preco_unitario?.toFixed(2) || '0.00',
        preco_apos_desconto: r.preco_apos_desconto?.toFixed(2) || '0.00',
      }))

      const dateStr = new Date().toISOString().slice(0, 10)
      exportToCSV(
        `pedidos_em_aberto_sap_${dateStr}`,
        formatted as unknown as Record<string, unknown>[],
        exportCols,
      )

      toast({
        title: 'Exportação concluída!',
        description: `${rows.length} linhas de pedidos em aberto exportadas com sucesso.`,
      })
    } catch (err) {
      console.error('Erro na exportação:', err)
      toast({
        variant: 'destructive',
        title: 'Falha na exportação',
        description: 'Não foi possível gerar a planilha CSV.',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Clock className="w-5 h-5" />
            </span>
            Pedidos em Aberto (SAP)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Carteira de pedidos pendentes de faturamento, integrada ao cadastro de canais e catálogo
            Roland DG.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadStats()
              loadData()
            }}
            disabled={loading}
            className="text-xs h-9 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || totalItems === 0}
            className="text-xs h-9 gap-1.5 bg-[#0B6E99] hover:bg-[#085273] text-white"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </div>
      </div>

      {/* Filtros específicos de Pedidos em Aberto (Canais, Clientes, Deploy, Inside e Período) */}
      <PedidosAbertosFilterBar
        filters={filters}
        setFilters={setFilters}
        options={filterOptions}
        isLoading={loading || statsLoading}
        loadingMessage="Atualizando carteira de pedidos em aberto..."
        onApplyFilters={handleApplyFilters}
      />

      {/* 4 KPIs de Pedidos em Aberto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Valor Total em Aberto"
          value={kpis.valorTotalAberto}
          isCurrency
          icon={DollarSign}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
        />
        <KpiCard
          title="Nº de Pedidos Distintos"
          value={kpis.pedidosDistintos}
          decimals={0}
          icon={FileText}
          iconBgColor="bg-sky-50"
          iconColor="text-sky-600"
        />
        <KpiCard
          title="Itens / Linhas Pendentes"
          value={kpis.itensPendentes}
          decimals={0}
          icon={Boxes}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <KpiCard
          title="Clientes com Pedidos"
          value={kpis.clientesDistintos}
          decimals={0}
          icon={Building2}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      {/* Tabela de Relatório */}
      <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
        <CardHeader className="p-4 sm:p-5 border-b border-gray-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>Linhas de Pedidos Pendentes</span>
                <Badge
                  variant="secondary"
                  className="font-semibold text-xs bg-amber-100 text-amber-800"
                >
                  {formatNumber(totalItems)} registro(s)
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Total acumulado no recorte: {formatCurrency(totalValor)} ({formatNumber(totalQtd)}{' '}
                unidades pendentes)
              </CardDescription>
            </div>

            {/* Busca Rápida na Tabela */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar pedido, cliente ou item..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B6E99]/30 focus:border-[#0B6E99] w-60 sm:w-72"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="text-xs h-8 px-2.5">
                Filtrar
              </Button>
            </form>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                    onClick={() => handleSort('numero_pedido')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Nº Pedido / Linha</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                    onClick={() => handleSort('data_pedido')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Data</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                    onClick={() => handleSort('nome_cliente')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Cliente (Código)</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-3">Canal / Deploy</th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors"
                    onClick={() => handleSort('codigo_item')}
                  >
                    <div className="flex items-center gap-1">
                      <span>Item / Descrição</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors"
                    onClick={() => handleSort('qtd_aberto')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Qtd Aberto</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-3 text-right">Preço Liq.</th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors"
                    onClick={() => handleSort('valor_em_aberto')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Valor em Aberto</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="p-3 text-center">Status Linha</th>
                  <th className="p-3 text-center">Estoque / Trânsito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
                        <span>Carregando pedidos em aberto...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedPedidos.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-600">
                        Nenhum pedido em aberto encontrado
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Verifique os filtros selecionados ou importe a planilha do SAP na tela de
                        importação.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedPedidos.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors border-b border-slate-100/80"
                    >
                      {/* Pedido / Linha */}
                      <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-[#0B6E99] font-bold">
                            {item.numero_pedido}
                          </span>
                          <span className="text-[11px] text-slate-400">/ L{item.linha}</span>
                        </div>
                      </td>

                      {/* Data */}
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {item.data_pedido ? formatDate(item.data_pedido) : '-'}
                      </td>

                      {/* Cliente */}
                      <td className="p-3 min-w-[200px]">
                        <div
                          className="font-medium text-slate-800 truncate"
                          title={item.nome_cliente}
                        >
                          {item.nome_cliente || 'Cliente não identificado'}
                        </div>
                        {item.codigo_cliente && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            {item.codigo_cliente}
                          </div>
                        )}
                      </td>

                      {/* Canal / Deploy */}
                      <td className="p-3 whitespace-nowrap">
                        {item.nome_canal ? (
                          <div className="space-y-0.5">
                            <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                              {item.nome_canal}
                            </span>
                            {item.deploy && (
                              <div className="text-[10px] text-slate-500 font-medium">
                                Deploy: {item.deploy}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Sem canal</span>
                        )}
                      </td>

                      {/* Item / Descrição */}
                      <td className="p-3 min-w-[220px]">
                        <div className="font-mono text-xs font-semibold text-slate-800">
                          {item.codigo_item || '-'}
                        </div>
                        <div
                          className="text-[11px] text-slate-600 truncate"
                          title={item.descricao_item}
                        >
                          {item.descricao_item || '-'}
                        </div>
                        {item.grupo_item && (
                          <span className="inline-block text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">
                            Grupo: {item.grupo_item}
                          </span>
                        )}
                      </td>

                      {/* Qtd Aberto */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {formatNumber(item.qtd_aberto)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          de {formatNumber(item.qtd_solicitada)} ped.
                        </div>
                      </td>

                      {/* Preço Unitário Líquido */}
                      <td className="p-3 text-right text-slate-700 whitespace-nowrap font-medium">
                        {formatCurrency(item.preco_apos_desconto || item.preco_unitario)}
                        {item.desconto_percentual > 0 && (
                          <span className="block text-[10px] text-rose-500">
                            -{Math.round(item.desconto_percentual)}%
                          </span>
                        )}
                      </td>

                      {/* Valor em Aberto */}
                      <td className="p-3 text-right whitespace-nowrap font-bold text-amber-700">
                        {formatCurrency(item.valor_em_aberto)}
                      </td>

                      {/* Status Linha */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            item.status_linha?.toLowerCase() === 'fechada'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                          }
                        >
                          {item.status_linha || 'Aberta'}
                        </Badge>
                      </td>

                      {/* Estoque / Trânsito */}
                      <td className="p-3 text-center whitespace-nowrap text-[11px]">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`font-semibold ${
                              item.em_estoque > 0 ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                            title="Em Estoque"
                          >
                            Est: {formatNumber(item.em_estoque)}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span
                            className={`font-semibold ${
                              item.em_transito > 0 ? 'text-sky-600' : 'text-slate-400'
                            }`}
                            title="Em Trânsito"
                          >
                            Trân: {formatNumber(item.em_transito)}
                          </span>
                        </div>
                        {item.deposito && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Depósito: {item.deposito}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50">
              <div className="text-slate-500">
                Página <span className="font-bold text-slate-800">{page}</span> de{' '}
                <span className="font-bold text-slate-800">{totalPages}</span> —{' '}
                {formatNumber(totalItems)} registro(s) no total
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="h-8 text-xs gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <span className="px-2 font-bold text-slate-700">{page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="h-8 text-xs gap-1"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
