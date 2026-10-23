import React, { useMemo, useState, useEffect } from 'react'
import {
  PackageCheck,
  PackageX,
  TrendingUp,
  BarChart2,
  Calendar,
  AlertCircle,
  HelpCircle,
  Clock,
  Layers,
  ArrowRight,
  Boxes,
  Truck,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { PedidoAberto } from '@/types/sales'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ChartCard from '@/components/ChartCard'
import { PedidosAbertosEstoqueFisicoModal } from '@/components/PedidosAbertosEstoqueFisicoModal'
import { PedidosAbertosTransitoModal } from '@/components/PedidosAbertosTransitoModal'
import { fetchClientesContatosMap, ClienteContatoInfo } from '@/services/pedidosAbertos'
import type { PedidosAbertosFilters } from '@/components/PedidosAbertosFilterBar'

const ROLAND_BLUE = '#0B6E99'
const TEAL_ACCENT = '#0D9488'
const AMBER_ACCENT = '#D97706'
const SLATE_MUTED = '#64748B'

interface PedidosAbertosDashboardProps {
  pedidos: PedidoAberto[]
  isLoading?: boolean
  filters?: PedidosAbertosFilters
}

interface CanalChartItem {
  canal: string
  valor: number
  pedidosQtd: number
  itensQtd: number
  isSemCanal?: boolean
  pct: number
}

interface MesChartItem {
  key: string // YYYY-MM
  label: string // MMM/AA
  pedidos: number
  valor: number
  itens: number
}

export default function PedidosAbertosDashboard({
  pedidos,
  isLoading = false,
  filters,
}: PedidosAbertosDashboardProps) {
  const navigate = useNavigate()

  const handleConsultarEstoqueFaltante = () => {
    const params = new URLSearchParams()
    if (filters?.canal && filters.canal.length > 0) {
      params.set('canal', filters.canal.join(','))
    }
    if (filters?.canalClientes && filters.canalClientes.length > 0) {
      params.set('canalClientes', filters.canalClientes.join(','))
    }
    if (filters?.deploy && filters.deploy.length > 0) {
      params.set('deploy', filters.deploy.join(','))
    }
    if (filters?.inside && filters.inside.length > 0) {
      params.set('inside', filters.inside.join(','))
    }
    if (filters?.ehCanal !== undefined && filters.ehCanal !== null && filters.ehCanal !== '') {
      params.set('ehCanal', String(filters.ehCanal))
    }
    const qs = params.toString()
    navigate(qs ? `/estoque-faltante?${qs}` : '/estoque-faltante')
  }
  // 1. Agrupamento por Nº Pedido e cálculo das visões de Estoque
  // Totalizadores gerais de carteira
  const carteiraGeral = useMemo(() => {
    const ordersMap = new Map<string, number>()
    for (const item of pedidos) {
      const orderNum = (item.numero_pedido || item.id || '').trim()
      if (!orderNum) continue
      const valor = Number(item.valor_em_aberto) || 0
      ordersMap.set(orderNum, (ordersMap.get(orderNum) || 0) + valor)
    }
    const totalPedidos = ordersMap.size
    let totalValor = 0
    for (const val of ordersMap.values()) {
      totalValor += val
    }
    return { totalPedidos, totalValor }
  }, [pedidos])

  // Indicador 1: Pedidos com Itens em Trânsito (campo em_transito > 0)
  // Recorte reflete APENAS pedidos/linhas com estoque em trânsito
  const transitoStats = useMemo(() => {
    const ordersMap = new Map<
      string,
      {
        valorTransito: number
        itensCount: number
        qtdTransito: number
      }
    >()

    for (const item of pedidos) {
      const transito = Number(item.em_transito) || 0
      if (transito <= 0) continue

      const orderNum = (item.numero_pedido || item.id || '').trim()
      if (!orderNum) continue

      const valor = Number(item.valor_em_aberto) || 0

      let existing = ordersMap.get(orderNum)
      if (!existing) {
        existing = {
          valorTransito: 0,
          itensCount: 0,
          qtdTransito: 0,
        }
        ordersMap.set(orderNum, existing)
      }

      existing.valorTransito += valor
      existing.itensCount += 1
      existing.qtdTransito += transito
    }

    let comTransitoPedidos = 0
    let comTransitoValor = 0
    let comTransitoItens = 0

    for (const order of ordersMap.values()) {
      comTransitoPedidos += 1
      comTransitoValor += order.valorTransito
      comTransitoItens += order.itensCount
    }

    const { totalPedidos, totalValor } = carteiraGeral

    return {
      pedidos: comTransitoPedidos,
      valor: comTransitoValor,
      itens: comTransitoItens,
      pctPedidos: totalPedidos > 0 ? Math.round((comTransitoPedidos / totalPedidos) * 100) : 0,
      pctValor: totalValor > 0 ? Math.round((comTransitoValor / totalValor) * 100) : 0,
    }
  }, [pedidos, carteiraGeral])

  // Indicador Card 2: Pedidos sem Itens no Estoque (mantido)
  const semEstoqueStats = useMemo(() => {
    const ordersMap = new Map<
      string,
      {
        valorTotal: number
        hasEstoque: boolean
        itemsCount: number
      }
    >()

    for (const item of pedidos) {
      const orderNum = (item.numero_pedido || item.id || '').trim()
      if (!orderNum) continue

      const valor = Number(item.valor_em_aberto) || 0
      const estoque = Number(item.em_estoque) || 0

      let existing = ordersMap.get(orderNum)
      if (!existing) {
        existing = {
          valorTotal: 0,
          hasEstoque: false,
          itemsCount: 0,
        }
        ordersMap.set(orderNum, existing)
      }

      existing.valorTotal += valor
      existing.itemsCount += 1
      if (estoque > 0) {
        existing.hasEstoque = true
      }
    }

    let semEstoquePedidos = 0
    let semEstoqueValor = 0
    let semEstoqueItens = 0

    for (const order of ordersMap.values()) {
      if (!order.hasEstoque) {
        semEstoquePedidos += 1
        semEstoqueValor += order.valorTotal
        semEstoqueItens += order.itemsCount
      }
    }

    const { totalPedidos, totalValor } = carteiraGeral

    return {
      pedidos: semEstoquePedidos,
      valor: semEstoqueValor,
      itens: semEstoqueItens,
      pctPedidos: totalPedidos > 0 ? Math.round((semEstoquePedidos / totalPedidos) * 100) : 0,
      pctValor: totalValor > 0 ? Math.round((semEstoqueValor / totalValor) * 100) : 0,
    }
  }, [pedidos, carteiraGeral])

  // 2. Visão "Valor por Canal" e valor total das revendas sem canal
  const { canaisData, totalValorCanais, valorSemCanal, pctSemCanal } = useMemo(() => {
    // Mapa: canalKey -> { nome: string, valor: number, pedidosSet: Set<string>, itensCount: number, isSemCanal: boolean }
    const canalMap = new Map<
      string,
      {
        nome: string
        valor: number
        pedidosSet: Set<string>
        itensCount: number
        isSemCanal: boolean
      }
    >()

    let totalGeral = 0
    let valSemCanal = 0

    for (const item of pedidos) {
      const rawCanal = (item.nome_canal || '').trim()
      const isSemCanal = !rawCanal
      const canalKey = isSemCanal ? '__SEM_CANAL__' : rawCanal.toUpperCase()
      const canalNome = isSemCanal ? 'Sem Canal' : rawCanal
      const valor = Number(item.valor_em_aberto) || 0
      const orderNum = (item.numero_pedido || item.id || '').trim()

      totalGeral += valor
      if (isSemCanal) {
        valSemCanal += valor
      }

      let entry = canalMap.get(canalKey)
      if (!entry) {
        entry = {
          nome: canalNome,
          valor: 0,
          pedidosSet: new Set<string>(),
          itensCount: 0,
          isSemCanal,
        }
        canalMap.set(canalKey, entry)
      }

      entry.valor += valor
      entry.itensCount += 1
      if (orderNum) {
        entry.pedidosSet.add(orderNum)
      }
    }

    const items: CanalChartItem[] = []
    let semCanalEntry: CanalChartItem | null = null

    for (const entry of canalMap.values()) {
      const pct = totalGeral > 0 ? (entry.valor / totalGeral) * 100 : 0
      const item: CanalChartItem = {
        canal: entry.nome,
        valor: entry.valor,
        pedidosQtd: entry.pedidosSet.size,
        itensQtd: entry.itensCount,
        isSemCanal: entry.isSemCanal,
        pct: Math.round(pct),
      }
      if (entry.isSemCanal) {
        semCanalEntry = item
      } else {
        items.push(item)
      }
    }

    // Ordena os canais vinculados por maior valor em aberto
    items.sort((a, b) => b.valor - a.valor)

    // Se houver revendas sem canal, insere a entrada final "Sem Canal" destacada
    if (semCanalEntry) {
      items.push(semCanalEntry)
    }

    return {
      canaisData: items,
      totalValorCanais: totalGeral,
      valorSemCanal: valSemCanal,
      pctSemCanal: totalGeral > 0 ? Math.round((valSemCanal / totalGeral) * 100) : 0,
    }
  }, [pedidos])

  // 3. Visão "Pedidos Abertos por Mês" (cronológico por data_pedido)
  const mesesData: MesChartItem[] = useMemo(() => {
    // Mapa: YYYY-MM -> { key, label, pedidosSet: Set<string>, valor: number, itens: number }
    const map = new Map<
      string,
      {
        key: string
        label: string
        pedidosSet: Set<string>
        valor: number
        itens: number
      }
    >()

    const nomeMesesAbrev = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]

    for (const item of pedidos) {
      if (!item.data_pedido) continue
      // Formato esperado: YYYY-MM-DD... ou ISO
      const rawDate = String(item.data_pedido).slice(0, 10)
      if (rawDate.length < 7) continue

      const yearMonth = rawDate.slice(0, 7) // "YYYY-MM"
      const [yearStr, monthStr] = yearMonth.split('-')
      const monthNum = parseInt(monthStr, 10)
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) continue

      const label = `${nomeMesesAbrev[monthNum - 1]}/${yearStr.slice(2)}`
      const valor = Number(item.valor_em_aberto) || 0
      const orderNum = (item.numero_pedido || item.id || '').trim()

      let entry = map.get(yearMonth)
      if (!entry) {
        entry = {
          key: yearMonth,
          label,
          pedidosSet: new Set<string>(),
          valor: 0,
          itens: 0,
        }
        map.set(yearMonth, entry)
      }

      entry.valor += valor
      entry.itens += 1
      if (orderNum) {
        entry.pedidosSet.add(orderNum)
      }
    }

    // Ordenação cronológica crescente (YYYY-MM)
    const sortedKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))

    return sortedKeys.map((k) => {
      const entry = map.get(k)!
      return {
        key: entry.key,
        label: entry.label,
        pedidos: entry.pedidosSet.size || entry.itens,
        valor: entry.valor,
        itens: entry.itens,
      }
    })
  }, [pedidos])

  // Estado e carregamento para os modais (Estoque Físico e Trânsito)
  const [modalEstoqueFisicoOpen, setModalEstoqueFisicoOpen] = useState(false)
  const [modalTransitoOpen, setModalTransitoOpen] = useState(false)
  const [contatosMap, setContatosMap] = useState<Map<string, ClienteContatoInfo>>(new Map())
  const [loadingContatos, setLoadingContatos] = useState(false)
  const [contatosLoaded, setContatosLoaded] = useState(false)

  const ensureContatosLoaded = async () => {
    if (!contatosLoaded && !loadingContatos) {
      setLoadingContatos(true)
      try {
        const map = await fetchClientesContatosMap()
        setContatosMap(map)
        setContatosLoaded(true)
      } catch (err) {
        console.warn('Erro ao carregar contatos de clientes para relatório:', err)
      } finally {
        setLoadingContatos(false)
      }
    }
  }

  const handleOpenRelatorioEstoqueFisico = async () => {
    setModalEstoqueFisicoOpen(true)
    await ensureContatosLoaded()
  }

  const handleOpenRelatorioTransito = async () => {
    setModalTransitoOpen(true)
    await ensureContatosLoaded()
  }

  // Estatísticas específicas de "Pedidos com itens em Estoque Físico":
  // Status Linha 'Aberta' e Estoque Físico > 0 (desconsiderando em_transito)
  const estoqueFisicoAbertaStats = useMemo(() => {
    const ordersMap = new Map<
      string,
      {
        hasEstoqueFisicoAberta: boolean
        valorTotal: number
        itensCount: number
      }
    >()

    for (const item of pedidos) {
      const orderNum = (item.numero_pedido || item.id || '').trim()
      if (!orderNum) continue

      const status = (item.status_linha || '').trim().toLowerCase()
      const isAberta = status === 'aberta'

      // Estoque físico direto (campo em_estoque). Se não existir, deduz estoque_atual - em_transito
      const estoqueFisico =
        item.em_estoque !== undefined && item.em_estoque !== null
          ? Number(item.em_estoque)
          : Number(item.estoque_atual || 0) - Number(item.em_transito || 0)

      const hasFisico = isAberta && estoqueFisico > 0
      const valor = Number(item.valor_em_aberto) || 0

      let existing = ordersMap.get(orderNum)
      if (!existing) {
        existing = {
          hasEstoqueFisicoAberta: false,
          valorTotal: 0,
          itensCount: 0,
        }
        ordersMap.set(orderNum, existing)
      }

      if (hasFisico) {
        existing.hasEstoqueFisicoAberta = true
        existing.valorTotal += valor
        existing.itensCount += 1
      }
    }

    let pedidosCount = 0
    let valorTotal = 0
    let itensCount = 0

    for (const order of ordersMap.values()) {
      if (order.hasEstoqueFisicoAberta) {
        pedidosCount += 1
        valorTotal += order.valorTotal
        itensCount += order.itensCount
      }
    }

    return {
      pedidos: pedidosCount,
      valor: valorTotal,
      itens: itensCount,
      pctPedidos:
        carteiraGeral.totalPedidos > 0
          ? Math.round((pedidosCount / carteiraGeral.totalPedidos) * 100)
          : 0,
      pctValor:
        carteiraGeral.totalValor > 0
          ? Math.round((valorTotal / carteiraGeral.totalValor) * 100)
          : 0,
    }
  }, [pedidos, carteiraGeral])

  const hasData = pedidos.length > 0

  return (
    <div className="space-y-4">
      {/* Título da Seção de Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#0B6E99]/10 text-[#0B6E99]">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Dashboard de Pedidos em Aberto
              <Badge
                variant="outline"
                className="text-[10px] bg-slate-50 border-slate-200 text-slate-600 font-semibold"
              >
                {isLoading
                  ? 'Calculando...'
                  : `${formatNumber(carteiraGeral.totalPedidos)} pedidos • ${formatCurrency(carteiraGeral.totalValor)}`}
              </Badge>
            </h3>
            <p className="text-xs text-slate-500">
              Visão consolidada de disponibilidade de estoque, faturamento por canal e distribuição
              mensal
            </p>
          </div>
        </div>
      </div>

      {/* Grid Superior: Coluna Esquerda (Card 1: Pedidos com Itens em Transito + Card Indicador ABAIXO: Pedidos com itens em Estoque Físico) e Coluna Direita (Card 2: Pedidos sem Itens no Estoque) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Coluna 1: Card 1 (Pedidos com Itens em Transito) e Card Indicador ABAIXO (Pedidos com itens em Estoque Físico) */}
        <div className="space-y-4 flex flex-col">
          {/* Card 1: Pedidos com Itens em Transito */}
          <Card className="border border-sky-200/90 bg-gradient-to-br from-white via-white to-sky-50/40 shadow-xs rounded-xl overflow-hidden hover:border-sky-300 transition-all flex-1">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-sky-100/80 text-sky-700">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Pedidos com Itens em Transito
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Ao menos uma linha com estoque em trânsito (em_transito &gt; 0)
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold"
                >
                  {transitoStats.pctPedidos}% dos pedidos
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-sky-100/70">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Pedidos
                  </p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-sky-700">
                      {formatNumber(transitoStats.pedidos)}
                    </span>
                    <span className="text-xs text-slate-400">
                      / {formatNumber(carteiraGeral.totalPedidos)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatNumber(transitoStats.itens)} linha(s) em trânsito
                  </p>
                </div>

                <div className="border-l border-sky-100/90 pl-3">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Valor em Aberto
                  </p>
                  <div className="mt-0.5">
                    <span className="text-lg sm:text-xl font-black text-slate-900 block truncate">
                      {formatCurrency(transitoStats.valor)}
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-700 font-semibold mt-0.5">
                    {transitoStats.pctValor}% do valor total em carteira
                  </p>
                </div>
              </div>

              {/* Barra de progresso visual */}
              <div className="mt-3 pt-2">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                  <div
                    className="bg-sky-500 h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, transitoStats.pctValor))}%`,
                    }}
                  />
                </div>
              </div>

              {/* Botão de Ação: "Ver pedidos" abre relatório de trânsito em ordem alfabética */}
              <div className="mt-3 pt-2.5 border-t border-sky-100/70 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Relatório com e-mail, contato e telefone p/ acompanhamento
                </span>
                <Button
                  size="sm"
                  type="button"
                  onClick={handleOpenRelatorioTransito}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-xs ml-auto"
                >
                  <span>Ver pedidos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Indicador ABAIXO de Pedidos com Itens em Transito:
              Pedidos com itens em Estoque Físico:
              Linhas com Status 'Aberta' e Estoque Físico > 0 (sem considerar em trânsito)
              com botão "Ver pedidos" para abrir o relatório em ordem alfabética por cliente com Nome, E-mail, Contato e Telefone */}
          <Card className="border border-teal-200/90 bg-gradient-to-br from-white via-teal-50/20 to-teal-50/50 shadow-xs rounded-xl overflow-hidden hover:border-teal-300 transition-all">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-teal-600 text-white shadow-2xs">
                    <Boxes className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>Pedidos com itens em Estoque Físico</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-teal-50 text-teal-800 border-teal-300 font-bold py-0"
                      >
                        Pronto p/ Faturar
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      Status Linha 'Aberta' com estoque físico atual &gt; 0 (desconsidera em
                      trânsito)
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-teal-100 text-teal-900 border border-teal-200 text-xs font-bold"
                >
                  {estoqueFisicoAbertaStats.pctPedidos}% dos pedidos
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-teal-100">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Pedidos Aptos
                  </p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-teal-700">
                      {formatNumber(estoqueFisicoAbertaStats.pedidos)}
                    </span>
                    <span className="text-xs text-slate-400">
                      / {formatNumber(carteiraGeral.totalPedidos)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatNumber(estoqueFisicoAbertaStats.itens)} linha(s) aberta(s)
                  </p>
                </div>

                <div className="border-l border-teal-100 pl-3">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Valor Realizável
                  </p>
                  <div className="mt-0.5">
                    <span className="text-lg sm:text-xl font-black text-slate-900 block truncate">
                      {formatCurrency(estoqueFisicoAbertaStats.valor)}
                    </span>
                  </div>
                  <p className="text-[11px] text-teal-700 font-semibold mt-0.5">
                    Estoque físico disponível imediato
                  </p>
                </div>
              </div>

              {/* Botão de Ação: "Ver pedidos" abre relatório alfabético por cliente com contatos */}
              <div className="mt-3 pt-2.5 border-t border-teal-100/70 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Relatório com e-mail, contato e telefone p/ vendedor
                </span>
                <Button
                  size="sm"
                  type="button"
                  onClick={handleOpenRelatorioEstoqueFisico}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-xs ml-auto"
                >
                  <span>Ver pedidos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card 2: Pedidos sem Itens no Estoque */}
        <Card className="border border-amber-200/80 bg-gradient-to-br from-white via-white to-amber-50/40 shadow-xs rounded-xl overflow-hidden hover:border-amber-300 transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100/70 text-amber-700">
                  <PackageX className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Pedidos sem Itens no Estoque
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Nenhuma linha disponível em estoque (aguardando produção/importação)
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold"
              >
                {semEstoqueStats.pctPedidos}% dos pedidos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-100/60">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Pedidos
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-amber-700">
                    {formatNumber(semEstoqueStats.pedidos)}
                  </span>
                  <span className="text-xs text-slate-400">
                    / {formatNumber(carteiraGeral.totalPedidos)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {formatNumber(semEstoqueStats.itens)} linha(s) pendente(s)
                </p>
              </div>

              <div className="border-l border-amber-100/80 pl-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Valor em Aberto
                </p>
                <div className="mt-0.5">
                  <span className="text-lg sm:text-xl font-black text-slate-900 block truncate">
                    {formatCurrency(semEstoqueStats.valor)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 font-semibold mt-0.5">
                  {semEstoqueStats.pctValor}% do valor total em carteira
                </p>
              </div>
            </div>

            {/* Barra de progresso visual */}
            <div className="mt-3 pt-2">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, semEstoqueStats.pctValor))}%`,
                  }}
                />
              </div>
            </div>

            {/* Botão Consultar Estoque Faltante */}
            <div className="mt-3 pt-2 border-t border-amber-100/60 flex items-center justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleConsultarEstoqueFaltante}
                className="border-amber-300 text-amber-900 hover:bg-amber-100/80 hover:text-amber-950 font-bold text-xs h-8 px-3 gap-1.5 shadow-2xs"
              >
                <PackageX className="w-3.5 h-3.5 text-amber-700" />
                Consultar Estoque Faltante
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid Inferior: Valor por Canal & Pedidos por Mês */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico / Lista Visual: Valor por Canal (com destaque para "Sem Canal") */}
        <Card className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden flex flex-col">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#0B6E99]/10 text-[#0B6E99]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Valor por Canal
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Distribuição da carteira em aberto por canal da rede
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Total Geral
                </span>
                <span className="text-xs font-black text-[#0B6E99]">
                  {formatCurrency(totalValorCanais)}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 flex-1 flex flex-col">
            {!hasData || canaisData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 text-slate-300 mb-1" />
                <p className="text-xs font-semibold text-slate-600">
                  Nenhum dado de canal encontrado no recorte
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {canaisData.map((item, idx) => {
                  const maxValor = canaisData[0]?.valor || 1
                  const barWidth = Math.min(100, Math.max(3, (item.valor / maxValor) * 100))

                  return (
                    <div
                      key={item.canal + idx}
                      className={`p-2.5 rounded-lg border transition-colors ${
                        item.isSemCanal
                          ? 'bg-slate-50 border-slate-300/80'
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.isSemCanal ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-800">
                              <HelpCircle className="w-3 h-3 text-slate-500" />
                              Sem Canal (Revendas sem vínculo)
                            </span>
                          ) : (
                            <span className="font-bold text-slate-800 truncate" title={item.canal}>
                              {item.canal}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            ({item.pedidosQtd} ped.)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {item.pct}%
                          </span>
                          <span
                            className={`font-black ${
                              item.isSemCanal ? 'text-slate-800' : 'text-[#0B6E99]'
                            }`}
                          >
                            {formatCurrency(item.valor)}
                          </span>
                        </div>
                      </div>

                      {/* Barra de preenchimento */}
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.isSemCanal
                              ? 'bg-gradient-to-r from-slate-400 to-slate-500'
                              : 'bg-gradient-to-r from-[#0B6E99] to-[#085273]'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Destaque / Rodapé com total de Revendas sem canal */}
            {valorSemCanal > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg">
                <span className="text-slate-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Valor total das revendas sem canal:
                </span>
                <span className="font-extrabold text-slate-800">
                  {formatCurrency(valorSemCanal)}{' '}
                  <span className="text-[10px] text-slate-500 font-normal">({pctSemCanal}%)</span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico: Pedidos Abertos por Mês (Recharts BarChart ordenado cronologicamente) */}
        <ChartCard
          title="Pedidos Abertos por Mês"
          description="Evolução cronológica por data de emissão do pedido (SAP)"
          icon={Calendar}
          iconColor="text-[#0B6E99]"
        >
          {mesesData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Calendar className="w-8 h-8 text-slate-300 mb-1" />
              <p className="text-xs font-semibold text-slate-600">
                Nenhum dado temporal encontrado
              </p>
              <p className="text-[11px] text-slate-400">
                Ajuste os filtros de período para visualizar
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mesesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: SLATE_MUTED, fontSize: 11 }}
                />
                <YAxis
                  yAxisId="valor"
                  orientation="left"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="pedidos"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip
                  formatter={(val: number | string | undefined, name: string) => {
                    const n = typeof val === 'number' ? val : Number(val) || 0
                    if (name === 'valor') {
                      return [formatCurrency(n), 'Valor em Aberto']
                    }
                    if (name === 'pedidos') {
                      return [`${formatNumber(n)} pedido(s)`, 'Pedidos Distintos']
                    }
                    return [n, name]
                  }}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '12px',
                    padding: '8px 12px',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={32}
                  formatter={(value) => (
                    <span className="text-xs font-bold text-slate-700">
                      {value === 'valor' ? 'Valor em Aberto (R$)' : 'Nº de Pedidos'}
                    </span>
                  )}
                />
                <Bar
                  yAxisId="valor"
                  dataKey="valor"
                  name="valor"
                  fill={ROLAND_BLUE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="pedidos"
                  dataKey="pedidos"
                  name="pedidos"
                  fill={TEAL_ACCENT}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Modal do Relatório: Pedidos com itens em Estoque Físico (Status Linha 'Aberta' e Estoque Físico > 0) */}
      <PedidosAbertosEstoqueFisicoModal
        isOpen={modalEstoqueFisicoOpen}
        onClose={() => setModalEstoqueFisicoOpen(false)}
        pedidos={pedidos}
        contatosMap={contatosMap}
        loadingContatos={loadingContatos}
      />

      {/* Modal do Relatório: Pedidos com Itens em Transito (Estoque em Trânsito > 0) */}
      <PedidosAbertosTransitoModal
        isOpen={modalTransitoOpen}
        onClose={() => setModalTransitoOpen(false)}
        pedidos={pedidos}
        contatosMap={contatosMap}
        loadingContatos={loadingContatos}
      />
    </div>
  )
}
