import React from 'react'
import {
  Clock,
  DollarSign,
  FileText,
  Boxes,
  Building2,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  ShoppingBag,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import type { PedidosAbertosStatsResult } from '@/types/sales'

interface PedidosAbertosWidgetProps {
  stats: PedidosAbertosStatsResult | null
  loading?: boolean
  canalContext?: boolean
}

export default function PedidosAbertosWidget({
  stats,
  loading = false,
  canalContext = false,
}: PedidosAbertosWidgetProps) {
  const kpis = stats?.kpis || {
    valorTotalAberto: 0,
    pedidosDistintos: 0,
    itensPendentes: 0,
    clientesDistintos: 0,
  }

  const ranking = stats?.rankingClientes || []

  return (
    <Card className="rounded-xl border border-amber-200/80 bg-white shadow-xs overflow-hidden">
      {/* Header com destaque na cor âmbar e Roland DG */}
      <CardHeader className="p-4 sm:p-5 bg-gradient-to-r from-amber-50/70 via-white to-amber-50/30 border-b border-amber-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Pedidos em Aberto (SAP)
                </CardTitle>
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-bold uppercase tracking-wider"
                >
                  Carteira Pendente
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                {canalContext
                  ? 'Pedidos em aberto filtrados pelo contexto de Canais (Deploy/Inside) e período'
                  : 'Visão consolidada de pedidos em aberto cruzada com o ritmo de compra dos clientes'}
              </CardDescription>
            </div>
          </div>

          <Link to="/pedidos-abertos">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 gap-1.5 border-amber-200 text-amber-900 hover:bg-amber-50 hover:text-amber-950"
            >
              Ver relatório completo
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {/* 4 Mini KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-amber-100/70">
          <div className="bg-white/80 p-3 rounded-lg border border-amber-100 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
              <span>Valor Total em Aberto</span>
              <DollarSign className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-amber-800 tabular-nums">
              {formatCurrency(kpis.valorTotalAberto)}
            </div>
          </div>

          <div className="bg-white/80 p-3 rounded-lg border border-amber-100 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
              <span>Nº Pedidos Distintos</span>
              <FileText className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-slate-800 tabular-nums">
              {formatNumber(kpis.pedidosDistintos)}
            </div>
          </div>

          <div className="bg-white/80 p-3 rounded-lg border border-amber-100 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
              <span>Itens / Linhas Pendentes</span>
              <Boxes className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-slate-800 tabular-nums">
              {formatNumber(kpis.itensPendentes)}
            </div>
          </div>

          <div className="bg-white/80 p-3 rounded-lg border border-amber-100 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 mb-1">
              <span>Clientes com Pedidos</span>
              <Building2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-base sm:text-lg font-extrabold text-slate-800 tabular-nums">
              {formatNumber(kpis.clientesDistintos)}
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Conteúdo: Ranking de Clientes cruzando Venda Realizada vs Em Aberto (Ritmo de Compra) */}
      <CardContent className="p-0">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-amber-600" />
              Ritmo de Compra por Cliente — Venda Realizada vs Carteira em Aberto
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Compara o faturamento já realizado com os pedidos ainda pendentes de faturamento no
              recorte ativo.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="p-3 pl-4">Cliente / Canal</th>
                <th className="p-3 text-center">Pedidos</th>
                <th className="p-3 text-center">Itens Pend.</th>
                <th className="p-3 text-right">Venda Realizada</th>
                <th className="p-3 text-right">Em Aberto (SAP)</th>
                <th className="p-3 text-right">Total Potencial</th>
                <th className="p-3 text-center pr-4">% Em Aberto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      <span>Carregando ritmo de compra dos clientes...</span>
                    </div>
                  </td>
                </tr>
              ) : ranking.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                    <p className="font-semibold text-slate-600">
                      Nenhum pedido em aberto no recorte atual
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Ajuste os filtros ou importe uma planilha atualizada de Pedidos em Aberto do
                      SAP.
                    </p>
                  </td>
                </tr>
              ) : (
                ranking.slice(0, 10).map((cli, idx) => (
                  <tr
                    key={cli.codigo_cliente || cli.nome_cliente || idx}
                    className="hover:bg-amber-50/40 transition-colors"
                  >
                    <td className="p-3 pl-4 min-w-[200px]">
                      <div
                        className="font-semibold text-slate-900 truncate"
                        title={cli.nome_cliente}
                      >
                        {cli.nome_cliente}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        {cli.codigo_cliente && (
                          <span className="font-mono text-slate-400">{cli.codigo_cliente}</span>
                        )}
                        {cli.nome_canal && (
                          <span className="inline-block text-[#0B6E99] font-medium">
                            • {cli.nome_canal} {cli.deploy ? `(${cli.deploy})` : ''}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-center font-bold text-slate-700 whitespace-nowrap">
                      {formatNumber(cli.qtd_pedidos)}
                    </td>

                    <td className="p-3 text-center text-slate-600 whitespace-nowrap">
                      {formatNumber(cli.qtd_itens)}
                    </td>

                    <td className="p-3 text-right font-medium text-emerald-700 whitespace-nowrap">
                      {formatCurrency(cli.venda_realizada)}
                    </td>

                    <td className="p-3 text-right font-bold text-amber-700 whitespace-nowrap">
                      {formatCurrency(cli.valor_em_aberto)}
                    </td>

                    <td className="p-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                      {formatCurrency(cli.total_potencial)}
                    </td>

                    <td className="p-3 pr-4 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, cli.taxa_em_aberto))}%` }}
                          />
                        </div>
                        <span className="font-bold text-xs text-amber-800 w-8 text-right">
                          {cli.taxa_em_aberto}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
