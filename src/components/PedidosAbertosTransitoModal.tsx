import React, { useState, useMemo, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Download,
  Mail,
  Phone,
  User,
  Building2,
  Truck,
  FileText,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  UserCheck,
} from 'lucide-react'
import { formatCurrency, formatNumber, formatDate } from '@/lib/formatters'
import type { PedidoAberto } from '@/types/sales'
import type { ClienteContatoInfo } from '@/services/pedidosAbertos'

export interface PedidoItemComTransito extends PedidoAberto {
  emTransitoQtd: number
}

export interface ClienteTransitoRelatorioItem {
  codigoCliente: string
  nomeCliente: string
  email: string
  contato: string
  telefone: string
  pedidosCount: number
  linhasCount: number
  valorTotal: number
  pedidos: PedidoItemComTransito[]
}

export type RelatorioTransitoSortField =
  | 'nomeCliente'
  | 'email'
  | 'contato'
  | 'telefone'
  | 'pedidosCount'
  | 'linhasCount'
  | 'valorTotal'

export type RelatorioTransitoSortDir = 'asc' | 'desc'

interface PedidosAbertosTransitoModalProps {
  isOpen: boolean
  onClose: () => void
  pedidos: PedidoAberto[]
  contatosMap: Map<string, ClienteContatoInfo>
  loadingContatos?: boolean
}

export function PedidosAbertosTransitoModal({
  isOpen,
  onClose,
  pedidos,
  contatosMap,
  loadingContatos = false,
}: PedidosAbertosTransitoModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedInside, setSelectedInside] = useState<string>('todos')
  const [sortField, setSortField] = useState<RelatorioTransitoSortField>('nomeCliente')
  const [sortDir, setSortDir] = useState<RelatorioTransitoSortDir>('asc')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  // Restaura estado inicial de filtros e ordenação ao abrir/fechar modal
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('')
      setSelectedInside('todos')
      setSortField('nomeCliente')
      setSortDir('asc')
      setExpandedClients(new Set())
    }
  }, [isOpen])

  // Filtra itens APENAS com Estoque em Trânsito > 0 (campo em_transito > 0)
  const itensElegiveis: PedidoItemComTransito[] = useMemo(() => {
    return pedidos
      .filter((item) => (Number(item.em_transito) || 0) > 0)
      .map((item) => ({
        ...item,
        emTransitoQtd: Number(item.em_transito) || 0,
      }))
  }, [pedidos])

  // Extrai lista única de insides presentes nos pedidos elegíveis
  const { insideOptions, hasSemInside } = useMemo(() => {
    const set = new Set<string>()
    let semInside = false

    for (const item of itensElegiveis) {
      const ins = (item.inside || '').trim()
      if (ins && ins.toUpperCase() !== 'SEM INSIDE' && ins !== '-') {
        set.add(ins.toUpperCase())
      } else {
        semInside = true
      }
    }

    return {
      insideOptions: Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      hasSemInside: semInside,
    }
  }, [itensElegiveis])

  // Recorta apenas os pedidos do Inside selecionado
  const itensFiltradosPorInside = useMemo(() => {
    if (!selectedInside || selectedInside === 'todos') {
      return itensElegiveis
    }
    if (selectedInside === 'SEM_INSIDE') {
      return itensElegiveis.filter((it) => {
        const ins = (it.inside || '').trim().toUpperCase()
        return !ins || ins === 'SEM INSIDE' || ins === '-'
      })
    }
    return itensElegiveis.filter(
      (it) => (it.inside || '').trim().toUpperCase() === selectedInside.toUpperCase(),
    )
  }, [itensElegiveis, selectedInside])

  // Agrupa por cliente a partir dos pedidos filtrados por Inside
  const clientesRelatorio: ClienteTransitoRelatorioItem[] = useMemo(() => {
    const map = new Map<
      string,
      {
        codigoCliente: string
        nomeCliente: string
        itens: PedidoItemComTransito[]
      }
    >()

    for (const item of itensFiltradosPorInside) {
      const nomeCliente = (item.nome_cliente || 'Cliente não identificado').trim()
      const codigoCliente = (item.codigo_cliente || '').trim()
      const groupKey = nomeCliente.toLowerCase()

      let entry = map.get(groupKey)
      if (!entry) {
        entry = {
          codigoCliente,
          nomeCliente,
          itens: [],
        }
        map.set(groupKey, entry)
      } else if (!entry.codigoCliente && codigoCliente) {
        entry.codigoCliente = codigoCliente
      }

      entry.itens.push(item)
    }

    const result: ClienteTransitoRelatorioItem[] = []

    for (const entry of map.values()) {
      const codNorm = entry.codigoCliente.trim().toUpperCase()
      const nomeNorm = entry.nomeCliente.trim().toUpperCase()

      const contatoInfo =
        (codNorm ? contatosMap.get(codNorm) : undefined) || contatosMap.get(nomeNorm)

      const email = (contatoInfo?.email || '').trim()
      const contato = (contatoInfo?.contato || '').trim()
      const telefone = (contatoInfo?.telefone || '').trim()

      const pedidosDistintos = new Set(
        entry.itens.map((it) => (it.numero_pedido || it.id || '').trim()).filter(Boolean),
      )

      const valorTotal = entry.itens.reduce((acc, it) => acc + (Number(it.valor_em_aberto) || 0), 0)

      result.push({
        codigoCliente: entry.codigoCliente,
        nomeCliente: entry.nomeCliente,
        email: email || '-',
        contato: contato || '-',
        telefone: telefone || '-',
        pedidosCount: pedidosDistintos.size,
        linhasCount: entry.itens.length,
        valorTotal,
        pedidos: entry.itens,
      })
    }

    return result
  }, [itensFiltradosPorInside, contatosMap])

  // Filtragem local por busca
  const filteredClientes = useMemo(() => {
    if (!searchTerm.trim()) return clientesRelatorio

    const term = searchTerm.toLowerCase().trim()
    return clientesRelatorio.filter((c) => {
      const matchHeader =
        c.nomeCliente.toLowerCase().includes(term) ||
        c.codigoCliente.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.contato.toLowerCase().includes(term) ||
        c.telefone.toLowerCase().includes(term)

      if (matchHeader) return true

      return c.pedidos.some(
        (p) =>
          (p.numero_pedido || '').toLowerCase().includes(term) ||
          (p.codigo_item || '').toLowerCase().includes(term) ||
          (p.descricao_item || '').toLowerCase().includes(term),
      )
    })
  }, [clientesRelatorio, searchTerm])

  // Ordenação
  const sortedClientes = useMemo(() => {
    const list = [...filteredClientes]
    list.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'nomeCliente':
          cmp = a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR', { sensitivity: 'base' })
          break
        case 'email': {
          const valA = a.email === '-' ? '' : a.email
          const valB = b.email === '-' ? '' : b.email
          cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' })
          break
        }
        case 'contato': {
          const valA = a.contato === '-' ? '' : a.contato
          const valB = b.contato === '-' ? '' : b.contato
          cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' })
          break
        }
        case 'telefone': {
          const valA = a.telefone === '-' ? '' : a.telefone
          const valB = b.telefone === '-' ? '' : b.telefone
          cmp = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' })
          break
        }
        case 'pedidosCount':
          cmp = a.pedidosCount - b.pedidosCount
          break
        case 'linhasCount':
          cmp = a.linhasCount - b.linhasCount
          break
        case 'valorTotal':
          cmp = a.valorTotal - b.valorTotal
          break
        default:
          cmp = 0
      }

      if (cmp !== 0) {
        return sortDir === 'asc' ? cmp : -cmp
      }

      return a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR', { sensitivity: 'base' })
    })
    return list
  }, [filteredClientes, sortField, sortDir])

  const totalPedidosDistintos = useMemo(() => {
    const set = new Set<string>()
    for (const c of sortedClientes) {
      for (const p of c.pedidos) {
        const num = (p.numero_pedido || p.id || '').trim()
        if (num) set.add(num)
      }
    }
    return set.size
  }, [sortedClientes])

  const totalLinhas = useMemo(() => {
    return sortedClientes.reduce((acc, c) => acc + c.linhasCount, 0)
  }, [sortedClientes])

  const valorTotalGeral = useMemo(() => {
    return sortedClientes.reduce((acc, c) => acc + c.valorTotal, 0)
  }, [sortedClientes])

  const handleSort = (field: RelatorioTransitoSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(
        field === 'pedidosCount' || field === 'linhasCount' || field === 'valorTotal'
          ? 'desc'
          : 'asc',
      )
    }
  }

  const renderSortIcon = (field: RelatorioTransitoSortField) => {
    if (sortField === field) {
      return sortDir === 'asc' ? (
        <ArrowUp className="w-3.5 h-3.5 text-sky-700 shrink-0" />
      ) : (
        <ArrowDown className="w-3.5 h-3.5 text-sky-700 shrink-0" />
      )
    }
    return (
      <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
    )
  }

  const toggleExpand = (nomeCliente: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev)
      if (next.has(nomeCliente)) {
        next.delete(nomeCliente)
      } else {
        next.add(nomeCliente)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedClients(new Set(sortedClientes.map((c) => c.nomeCliente)))
  }

  const collapseAll = () => {
    setExpandedClients(new Set())
  }

  const handleExportCsv = () => {
    if (sortedClientes.length === 0) return

    const header = [
      'Código Vendedor',
      'Nome Vendedor',
      'Código Cliente',
      'Nome do Cliente',
      'E-mail',
      'Contato',
      'Telefone',
      'Qtd Pedidos',
      'Qtd Linhas',
      'Valor Total em Aberto (R$)',
    ]

    const rows = sortedClientes.map((c) => {
      const primeiroItem = c.pedidos[0]
      const codVend = primeiroItem?.codigo_vendedor || ''
      const nomeVend = primeiroItem?.nome_vendedor || ''
      return [
        `"${codVend.replace(/"/g, '""')}"`,
        `"${nomeVend.replace(/"/g, '""')}"`,
        `"${c.codigoCliente.replace(/"/g, '""')}"`,
        `"${c.nomeCliente.replace(/"/g, '""')}"`,
        `"${c.email.replace(/"/g, '""')}"`,
        `"${c.contato.replace(/"/g, '""')}"`,
        `"${c.telefone.replace(/"/g, '""')}"`,
        c.pedidosCount,
        c.linhasCount,
        c.valorTotal.toFixed(2),
      ]
    })
    const csvContent = '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    const suffix = selectedInside !== 'todos' ? `_inside_${selectedInside.toLowerCase()}` : ''
    link.setAttribute(
      'download',
      `relatorio_pedidos_itens_em_transito${suffix}_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden sm:rounded-2xl">
        {/* Cabeçalho do Modal */}
        <DialogHeader className="p-5 pb-3 border-b border-slate-100 bg-gradient-to-r from-sky-50/70 via-white to-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-600 text-white shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>Relatório de Pedidos com Itens em Trânsito</span>
                  <Badge
                    variant="outline"
                    className="bg-sky-50 text-sky-700 border-sky-200 text-xs font-bold"
                  >
                    Estoque em Trânsito &gt; 0
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Lista detalhada de pedidos com itens em trânsito e contatos dos clientes para
                  acompanhamento e previsão. Clique no cabeçalho de qualquer coluna para ordenar.
                </DialogDescription>
              </div>
            </div>

            {/* Totalizadores rápidos */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-2xs text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Clientes</p>
                <p className="text-sm font-black text-slate-800">
                  {formatNumber(sortedClientes.length)}
                </p>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-2xs text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Pedidos</p>
                <p className="text-sm font-black text-sky-700">
                  {formatNumber(totalPedidosDistintos)}
                </p>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-2xs text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">
                  Linhas Trânsito
                </p>
                <p className="text-sm font-black text-sky-800">{formatNumber(totalLinhas)}</p>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-2xs text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">
                  Valor em Aberto
                </p>
                <p className="text-sm font-black text-slate-900">
                  {formatCurrency(valorTotalGeral)}
                </p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Barra de Filtros (Busca + Filtro por Inside) e Ações */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 max-w-xl">
            {/* Campo de Busca */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Buscar por cliente, e-mail, contato, telefone, pedido ou item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-white border-slate-200 focus-visible:ring-sky-500"
              />
            </div>

            {/* Seletor de Inside */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="min-w-[170px]">
                <Select
                  value={selectedInside}
                  onValueChange={(val) => {
                    setSelectedInside(val)
                    setExpandedClients(new Set())
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-white border-slate-200 focus:ring-sky-500 font-medium">
                    <div className="flex items-center gap-1.5 truncate">
                      <UserCheck className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="text-slate-500 text-[11px]">Inside:</span>
                      <SelectValue placeholder="Todos os Inside" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os Inside</SelectItem>
                    {insideOptions.map((inside) => (
                      <SelectItem key={inside} value={inside}>
                        {inside}
                      </SelectItem>
                    ))}
                    {hasSemInside && <SelectItem value="SEM_INSIDE">Sem Inside</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={expandAll}
              disabled={sortedClientes.length === 0}
              className="h-8 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              Expandir Todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={collapseAll}
              disabled={expandedClients.size === 0}
              className="h-8 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              Colapsar Todos
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={sortedClientes.length === 0}
              className="h-8 text-xs font-bold gap-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Tabela do Relatório com Rolagem e Cabeçalhos Classificáveis */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingContatos && (
            <div className="p-2.5 rounded-lg bg-sky-50/80 border border-sky-100 text-sky-800 text-xs flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
              <span>Carregando dados complementares de contato dos clientes...</span>
            </div>
          )}

          {sortedClientes.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Truck className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5] mb-2" />
              <p className="text-sm font-bold text-slate-600">
                Nenhum pedido em trânsito encontrado
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {selectedInside !== 'todos'
                  ? `Não há pedidos com itens em trânsito (em_transito > 0) para o Inside '${selectedInside}'.`
                  : 'Não há pedidos com itens em estoque em trânsito (em_transito > 0) no recorte atual.'}
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100/80 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-8"></th>
                    {/* 1. Nome do Cliente */}
                    <th
                      onClick={() => handleSort('nomeCliente')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por Nome do Cliente"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Nome do Cliente</span>
                        {renderSortIcon('nomeCliente')}
                      </div>
                    </th>
                    {/* 2. E-mail */}
                    <th
                      onClick={() => handleSort('email')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por E-mail"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>E-mail</span>
                        {renderSortIcon('email')}
                      </div>
                    </th>
                    {/* 3. Contato */}
                    <th
                      onClick={() => handleSort('contato')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por Contato"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Contato</span>
                        {renderSortIcon('contato')}
                      </div>
                    </th>
                    {/* 4. Telefone */}
                    <th
                      onClick={() => handleSort('telefone')}
                      className="py-3 px-3 cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por Telefone"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Telefone</span>
                        {renderSortIcon('telefone')}
                      </div>
                    </th>
                    {/* 5. Pedidos */}
                    <th
                      onClick={() => handleSort('pedidosCount')}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por Quantidade de Pedidos"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Pedidos</span>
                        {renderSortIcon('pedidosCount')}
                      </div>
                    </th>
                    {/* 6. Linhas em Trânsito */}
                    <th
                      onClick={() => handleSort('linhasCount')}
                      className="py-3 px-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por Quantidade de Linhas em Trânsito"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Linhas Trânsito</span>
                        {renderSortIcon('linhasCount')}
                      </div>
                    </th>
                    {/* 7. Valor em Aberto */}
                    <th
                      onClick={() => handleSort('valorTotal')}
                      className="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                      title="Clique para ordenar por Valor em Aberto"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>Valor em Aberto</span>
                        {renderSortIcon('valorTotal')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedClientes.map((cliente) => {
                    const isExpanded = expandedClients.has(cliente.nomeCliente)

                    return (
                      <React.Fragment key={cliente.nomeCliente}>
                        {/* Linha Principal do Cliente */}
                        <tr
                          onClick={() => toggleExpand(cliente.nomeCliente)}
                          className="hover:bg-sky-50/40 transition-colors cursor-pointer group"
                        >
                          <td className="py-2.5 px-3 text-center text-slate-400">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-sky-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 group-hover:text-sky-600 transition-colors" />
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                              <div>
                                <span className="font-bold text-slate-900 group-hover:text-sky-800 transition-colors">
                                  {cliente.nomeCliente}
                                </span>
                                {cliente.codigoCliente && (
                                  <span className="text-[10px] text-slate-400 block font-mono">
                                    {cliente.codigoCliente}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {cliente.email !== '-' ? (
                              <a
                                href={`mailto:${cliente.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 text-sky-700 hover:text-sky-900 hover:underline font-medium"
                              >
                                <Mail className="w-3 h-3 text-sky-600" />
                                {cliente.email}
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {cliente.contato !== '-' ? (
                              <div className="inline-flex items-center gap-1.5 font-medium">
                                <User className="w-3 h-3 text-slate-500" />
                                {cliente.contato}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {cliente.telefone !== '-' ? (
                              <a
                                href={`tel:${cliente.telefone.replace(/\D/g, '')}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 text-slate-800 hover:text-sky-700 font-medium font-mono"
                              >
                                <Phone className="w-3 h-3 text-emerald-600" />
                                {cliente.telefone}
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-slate-800 font-bold border border-slate-200"
                            >
                              {cliente.pedidosCount}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-xs font-semibold text-slate-600">
                              {cliente.linhasCount}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-bold text-slate-900">
                              {formatCurrency(cliente.valorTotal)}
                            </span>
                          </td>
                        </tr>

                        {/* Linhas de Detalhes dos Pedidos e Itens deste Cliente */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={8} className="p-3 pl-8">
                              <div className="bg-white border border-sky-100 rounded-lg p-3 shadow-xs space-y-2">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-sky-700" />
                                    <span className="font-bold text-[11px] text-slate-800 uppercase tracking-wide">
                                      Linhas com Estoque em Trânsito ({cliente.pedidos.length})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[11px]">
                                    {selectedInside !== 'todos' && (
                                      <span className="text-sky-800 font-semibold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                        Inside: {selectedInside}
                                      </span>
                                    )}
                                    <span className="text-slate-500">
                                      Critério:{' '}
                                      <strong className="text-sky-700">em_transito &gt; 0</strong>
                                    </span>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] text-left">
                                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                                      <tr>
                                        <th className="py-1.5 px-2">Nº Pedido</th>
                                        <th className="py-1.5 px-2">Data</th>
                                        <th className="py-1.5 px-2">Cód. Vendedor</th>
                                        <th className="py-1.5 px-2">Nome Vendedor</th>
                                        <th className="py-1.5 px-2">Cód. Cliente</th>
                                        <th className="py-1.5 px-2">Nome Cliente</th>
                                        <th className="py-1.5 px-2">Item / Código</th>
                                        <th className="py-1.5 px-2">Descrição</th>
                                        <th className="py-1.5 px-2">Inside</th>
                                        <th className="py-1.5 px-2 text-center">Qtd Aberta</th>
                                        <th className="py-1.5 px-2 text-center">Em Trânsito</th>
                                        <th className="py-1.5 px-2 text-right">Valor em Aberto</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {cliente.pedidos.map((item, idx) => (
                                        <tr key={item.id || idx} className="hover:bg-slate-50/60">
                                          <td className="py-1.5 px-2 font-mono font-bold text-sky-800">
                                            {item.numero_pedido || '-'}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-600">
                                            {formatDate(item.data_pedido)}
                                          </td>
                                          <td className="py-1.5 px-2 font-mono text-slate-700">
                                            {item.codigo_vendedor || '-'}
                                          </td>
                                          <td
                                            className="py-1.5 px-2 text-slate-800 max-w-[140px] truncate"
                                            title={item.nome_vendedor}
                                          >
                                            {item.nome_vendedor || '-'}
                                          </td>
                                          <td className="py-1.5 px-2 font-mono text-slate-700">
                                            {item.codigo_cliente || '-'}
                                          </td>
                                          <td
                                            className="py-1.5 px-2 text-slate-800 max-w-[150px] truncate font-medium"
                                            title={item.nome_cliente}
                                          >
                                            {item.nome_cliente || '-'}
                                          </td>
                                          <td className="py-1.5 px-2 font-mono text-slate-800">
                                            {item.codigo_item || '-'}
                                          </td>
                                          <td
                                            className="py-1.5 px-2 text-slate-700 max-w-xs truncate"
                                            title={item.descricao_item}
                                          >
                                            {item.descricao_item || '-'}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-600 font-medium">
                                            {item.inside ? (
                                              <Badge
                                                variant="outline"
                                                className="text-[9px] py-0 h-4 bg-slate-50 border-slate-200 text-slate-700 font-semibold"
                                              >
                                                {item.inside}
                                              </Badge>
                                            ) : (
                                              <span className="text-slate-400 italic text-[10px]">
                                                -
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 text-center font-bold text-slate-800">
                                            {formatNumber(
                                              Number(item.saldo_aberto || item.quantidade) || 0,
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 text-center">
                                            <Badge
                                              variant="outline"
                                              className="bg-sky-50 text-sky-800 border-sky-300 font-bold text-[10px] py-0 h-5"
                                            >
                                              {formatNumber(item.emTransitoQtd)} un.
                                            </Badge>
                                          </td>
                                          <td className="py-1.5 px-2 text-right font-semibold text-slate-900">
                                            {formatCurrency(Number(item.valor_em_aberto) || 0)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
          <p className="text-slate-500 text-[11px]">
            Exibindo <strong>{formatNumber(sortedClientes.length)}</strong> cliente(s)
            {selectedInside !== 'todos' ? (
              <span>
                {' '}
                filtrado(s) pelo Inside <strong>{selectedInside}</strong>
              </span>
            ) : null}
            {sortField === 'nomeCliente'
              ? sortDir === 'asc'
                ? ' ordenados de A a Z.'
                : ' ordenados de Z a A.'
              : ` ordenados por ${
                  sortField === 'valorTotal'
                    ? 'valor em aberto'
                    : sortField === 'pedidosCount'
                      ? 'quantidade de pedidos'
                      : sortField === 'linhasCount'
                        ? 'quantidade de linhas'
                        : sortField === 'email'
                          ? 'e-mail'
                          : sortField === 'contato'
                            ? 'contato'
                            : 'telefone'
                } (${sortDir === 'asc' ? 'crescente' : 'decrescente'}).`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 text-xs font-semibold px-4"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
