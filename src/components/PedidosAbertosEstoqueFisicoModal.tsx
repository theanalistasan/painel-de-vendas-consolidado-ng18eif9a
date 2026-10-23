import React, { useState, useMemo } from 'react'
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
  Search,
  Download,
  Mail,
  Phone,
  User,
  Building2,
  PackageCheck,
  FileText,
  DollarSign,
  ChevronRight,
  ChevronDown,
  Layers,
  ExternalLink,
} from 'lucide-react'
import { formatCurrency, formatNumber, formatDate } from '@/lib/formatters'
import { PedidoAberto } from '@/types/sales'
import { ClienteContatoInfo } from '@/services/pedidosAbertos'

export interface PedidoItemComEstoqueFisico extends PedidoAberto {
  estoqueFisico: number
}

export interface ClienteRelatorioItem {
  codigoCliente: string
  nomeCliente: string
  email: string
  contato: string
  telefone: string
  pedidosCount: number
  linhasCount: number
  valorTotal: number
  pedidos: PedidoItemComEstoqueFisico[]
}

interface PedidosAbertosEstoqueFisicoModalProps {
  isOpen: boolean
  onClose: () => void
  pedidos: PedidoAberto[]
  contatosMap: Map<string, ClienteContatoInfo>
  loadingContatos?: boolean
}

export function PedidosAbertosEstoqueFisicoModal({
  isOpen,
  onClose,
  pedidos,
  contatosMap,
  loadingContatos = false,
}: PedidosAbertosEstoqueFisicoModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())

  // Filtra itens com Status Linha 'Aberta' e Estoque Físico > 0 (desconsiderando estoque em trânsito)
  const itensElegiveis: PedidoItemComEstoqueFisico[] = useMemo(() => {
    return pedidos
      .filter((item) => {
        const status = (item.status_linha || '').trim().toLowerCase()
        if (status !== 'aberta') return false

        // Estoque físico direto (campo em_estoque). Se não existir, deduz estoque_atual - em_transito
        const estoqueFisico =
          item.em_estoque !== undefined && item.em_estoque !== null
            ? Number(item.em_estoque)
            : Number(item.estoque_atual || 0) - Number(item.em_transito || 0)

        return estoqueFisico > 0
      })
      .map((item) => {
        const estoqueFisico =
          item.em_estoque !== undefined && item.em_estoque !== null
            ? Number(item.em_estoque)
            : Number(item.estoque_atual || 0) - Number(item.em_transito || 0)
        return {
          ...item,
          estoqueFisico,
        }
      })
  }, [pedidos])

  // Agrupa por cliente e ordena em ORDEM ALFABÉTICA POR CLIENTE
  const clientesRelatorio: ClienteRelatorioItem[] = useMemo(() => {
    const map = new Map<
      string,
      {
        codigoCliente: string
        nomeCliente: string
        pedidosMap: Map<string, PedidoItemComEstoqueFisico[]>
        itens: PedidoItemComEstoqueFisico[]
      }
    >()

    for (const item of itensElegiveis) {
      const nomeCliente = (item.nome_cliente || 'Cliente não identificado').trim()
      const codigoCliente = (item.codigo_cliente || '').trim()
      const groupKey = nomeCliente.toLowerCase()

      let entry = map.get(groupKey)
      if (!entry) {
        entry = {
          codigoCliente,
          nomeCliente,
          pedidosMap: new Map(),
          itens: [],
        }
        map.set(groupKey, entry)
      } else if (!entry.codigoCliente && codigoCliente) {
        entry.codigoCliente = codigoCliente
      }

      entry.itens.push(item)
    }

    const result: ClienteRelatorioItem[] = []

    for (const entry of map.values()) {
      // Procura informações de contato por código ou por nome no contatosMap
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

    // Regra obrigatória do usuário: Ordenado em ORDEM ALFABÉTICA POR CLIENTE
    result.sort((a, b) =>
      a.nomeCliente.localeCompare(b.nomeCliente, 'pt-BR', { sensitivity: 'base' }),
    )

    return result
  }, [itensElegiveis, contatosMap])

  // Filtragem local por termo de busca (cliente, email, contato, telefone, pedido, item)
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

      // Procura dentro dos pedidos/itens do cliente
      return c.pedidos.some(
        (p) =>
          (p.numero_pedido || '').toLowerCase().includes(term) ||
          (p.codigo_item || '').toLowerCase().includes(term) ||
          (p.descricao_item || '').toLowerCase().includes(term),
      )
    })
  }, [clientesRelatorio, searchTerm])

  const totalPedidosDistintos = useMemo(() => {
    const set = new Set<string>()
    for (const c of clientesRelatorio) {
      for (const p of c.pedidos) {
        const num = (p.numero_pedido || p.id || '').trim()
        if (num) set.add(num)
      }
    }
    return set.size
  }, [clientesRelatorio])

  const valorTotalGeral = useMemo(() => {
    return clientesRelatorio.reduce((acc, c) => acc + c.valorTotal, 0)
  }, [clientesRelatorio])

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
    setExpandedClients(new Set(filteredClientes.map((c) => c.nomeCliente)))
  }

  const collapseAll = () => {
    setExpandedClients(new Set())
  }

  // Exportar para CSV com as colunas exigidas + resumo
  const handleExportCsv = () => {
    if (filteredClientes.length === 0) return

    const header = [
      'Nome do Cliente',
      'Código Cliente',
      'E-mail',
      'Contato',
      'Telefone',
      'Qtd Pedidos',
      'Qtd Linhas',
      'Valor Total em Aberto (R$)',
    ]

    const rows = filteredClientes.map((c) => [
      `"${c.nomeCliente.replace(/"/g, '""')}"`,
      `"${c.codigoCliente.replace(/"/g, '""')}"`,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${c.contato.replace(/"/g, '""')}"`,
      `"${c.telefone.replace(/"/g, '""')}"`,
      c.pedidosCount,
      c.linhasCount,
      c.valorTotal.toFixed(2),
    ])

    const csvContent = '\uFEFF' + [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `relatorio_pedidos_linha_aberta_estoque_fisico_${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden sm:rounded-2xl">
        {/* Cabeçalho do Modal */}
        <DialogHeader className="p-5 pb-3 border-b border-slate-100 bg-gradient-to-r from-teal-50/70 via-white to-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-600 text-white shadow-xs">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>Relatório de Pedidos para Realização / Fechamento</span>
                  <Badge
                    variant="outline"
                    className="bg-teal-50 text-teal-700 border-teal-200 text-xs font-bold"
                  >
                    Linha Aberta + Estoque Físico &gt; 0
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Lista ordenada alfabeticamente por cliente com dados de contato (E-mail, Contato e
                  Telefone) para contato imediato pelo vendedor
                </DialogDescription>
              </div>
            </div>

            {/* Totalizadores rápidos */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-2xs text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Clientes</p>
                <p className="text-sm font-black text-slate-800">
                  {formatNumber(filteredClientes.length)}
                </p>
              </div>
              <div className="bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shadow-2xs text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Pedidos</p>
                <p className="text-sm font-black text-teal-700">
                  {formatNumber(totalPedidosDistintos)}
                </p>
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

        {/* Barra de Filtros e Ações */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Buscar por cliente, e-mail, contato, telefone, pedido ou item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-white border-slate-200 focus-visible:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={expandAll}
              disabled={filteredClientes.length === 0}
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
              disabled={filteredClientes.length === 0}
              className="h-8 text-xs font-bold gap-1.5 bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* Tabela do Relatório com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingContatos && (
            <div className="p-2.5 rounded-lg bg-teal-50/80 border border-teal-100 text-teal-800 text-xs flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
              <span>Carregando dados complementares de contato dos clientes...</span>
            </div>
          )}

          {filteredClientes.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <PackageCheck className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5] mb-2" />
              <p className="text-sm font-bold text-slate-600">Nenhum pedido encontrado</p>
              <p className="text-xs text-slate-400 mt-1">
                Não há pedidos com Status Linha 'Aberta' e estoque físico disponível &gt; 0 no
                momento.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100/80 text-slate-700 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-8"></th>
                    <th className="py-3 px-3">Nome do Cliente</th>
                    <th className="py-3 px-3">E-mail</th>
                    <th className="py-3 px-3">Contato</th>
                    <th className="py-3 px-3">Telefone</th>
                    <th className="py-3 px-3 text-center">Pedidos</th>
                    <th className="py-3 px-3 text-center">Linhas</th>
                    <th className="py-3 px-3 text-right">Valor em Aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredClientes.map((cliente) => {
                    const isExpanded = expandedClients.has(cliente.nomeCliente)

                    return (
                      <React.Fragment key={cliente.nomeCliente}>
                        {/* Linha Principal do Cliente com as 4 colunas exigidas */}
                        <tr
                          onClick={() => toggleExpand(cliente.nomeCliente)}
                          className="hover:bg-teal-50/40 transition-colors cursor-pointer group"
                        >
                          <td className="py-2.5 px-3 text-center text-slate-400">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-teal-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 group-hover:text-teal-600 transition-colors" />
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3.5 h-3.5 text-teal-700 flex-shrink-0" />
                              <div>
                                <span className="font-bold text-slate-900 group-hover:text-teal-800 transition-colors">
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
                                className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 hover:underline font-medium"
                              >
                                <Mail className="w-3 h-3 text-teal-600" />
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
                                className="inline-flex items-center gap-1.5 text-slate-800 hover:text-teal-700 font-medium font-mono"
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
                              <div className="bg-white border border-teal-100 rounded-lg p-3 shadow-xs space-y-2">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-3.5 h-3.5 text-teal-700" />
                                    <span className="font-bold text-[11px] text-slate-800 uppercase tracking-wide">
                                      Linhas com Estoque Físico Disponível ({cliente.pedidos.length}
                                      )
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-500">
                                    Status da Linha:{' '}
                                    <strong className="text-amber-600">Aberta</strong>
                                  </span>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-[11px] text-left">
                                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px]">
                                      <tr>
                                        <th className="py-1.5 px-2">Nº Pedido</th>
                                        <th className="py-1.5 px-2">Data</th>
                                        <th className="py-1.5 px-2">Item / Código</th>
                                        <th className="py-1.5 px-2">Descrição</th>
                                        <th className="py-1.5 px-2 text-center">Qtd Aberta</th>
                                        <th className="py-1.5 px-2 text-center">Estoque Físico</th>
                                        <th className="py-1.5 px-2 text-right">Valor em Aberto</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {cliente.pedidos.map((item, idx) => (
                                        <tr key={item.id || idx} className="hover:bg-slate-50/60">
                                          <td className="py-1.5 px-2 font-mono font-bold text-teal-800">
                                            {item.numero_pedido || '-'}
                                          </td>
                                          <td className="py-1.5 px-2 text-slate-600">
                                            {formatDate(item.data_pedido)}
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
                                          <td className="py-1.5 px-2 text-center font-bold text-slate-800">
                                            {formatNumber(
                                              Number(item.saldo_aberto || item.quantidade) || 0,
                                            )}
                                          </td>
                                          <td className="py-1.5 px-2 text-center">
                                            <Badge
                                              variant="outline"
                                              className="bg-emerald-50 text-emerald-800 border-emerald-300 font-bold text-[10px] py-0 h-5"
                                            >
                                              {formatNumber(item.estoqueFisico)} un.
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
            Exibindo <strong>{formatNumber(filteredClientes.length)}</strong> cliente(s) ordenados
            de A a Z.
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
