import React, { useMemo, useState } from 'react'
import {
  Network,
  Building2,
  Users,
  Briefcase,
  Phone,
  Mail,
  User,
  Pencil,
  Trash2,
  Search,
  ExternalLink,
  Layers,
  ChevronRight,
  Plus,
} from 'lucide-react'
import type { CanalCliente, CanalMeta } from '@/types/sales'
import { formatCurrency, MESES_PT_BR } from '@/lib/formatters'
import { Target } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface CanalDetailModalProps {
  canalNome: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  allItems: CanalCliente[]
  onEditItem: (item: CanalCliente) => void
  onDeleteItem: (item: CanalCliente) => void
  onNewContactForCanal?: (canalNome: string, defaultItem?: CanalCliente) => void
  metas?: CanalMeta[]
  onOpenMetaModal?: (canalNome: string, existingMeta?: CanalMeta) => void
}

export function CanalDetailModal({
  canalNome,
  open,
  onOpenChange,
  allItems,
  onEditItem,
  onDeleteItem,
  onNewContactForCanal,
  metas = [],
  onOpenMetaModal,
}: CanalDetailModalProps) {
  const [searchTerm, setSearchTerm] = useState('')

  // Filtra todos os registros pertencentes a este canal
  const canalRecords = useMemo(() => {
    if (!canalNome) return []
    const normalizedCanal = canalNome.trim().toLowerCase()
    return allItems.filter(
      (item) => (item.nome_canal || 'Sem Canal').trim().toLowerCase() === normalizedCanal,
    )
  }, [canalNome, allItems])

  // Consolidação dos dados do canal
  const consolidated = useMemo(() => {
    if (canalRecords.length === 0) {
      return {
        nomeCanal: canalNome || 'Canal não informado',
        deploy: 'Nenhum',
        deployNormalized: 'Nenhum',
        totalRegistros: 0,
        totalClientes: 0,
        totalContatos: 0,
        codigosSet: [] as string[],
        insidesSet: [] as string[],
        segmentosSet: [] as string[],
        statusList: [] as string[],
        ehCanal: true,
        clientesMap: new Map<string, { nome: string; cod: string; registros: CanalCliente[] }>(),
      }
    }

    const first = canalRecords[0]
    let deployNormalized = 'Nenhum'
    for (const r of canalRecords) {
      const dep = (r.deploy || '').trim().toUpperCase()
      if (dep.includes('AGIS')) {
        deployNormalized = 'AGIS'
        break
      }
      if (dep.includes('ROLAND')) {
        deployNormalized = 'Roland'
        break
      }
      if (r.deploy && r.deploy !== 'Nenhum') {
        deployNormalized = r.deploy.trim()
      }
    }

    const codigosSet = new Set<string>()
    const insidesSet = new Set<string>()
    const segmentosSet = new Set<string>()
    const statusSet = new Set<string>()
    const municipiosSet = new Set<string>()
    const estadosSet = new Set<string>()
    let contatosCount = 0
    let hasEhCanal = false
    let maxMetaValor: number | null = null

    // Agrupamento por cliente (COD + Razão Social)
    const clientesMap = new Map<
      string,
      {
        nome: string
        cod: string
        registros: CanalCliente[]
      }
    >()

    for (const r of canalRecords) {
      if (r.codigo_cliente) codigosSet.add(r.codigo_cliente.trim().toUpperCase())
      if (r.inside && r.inside.trim() && r.inside.trim().toUpperCase() !== 'SEM INSIDE') {
        insidesSet.add(r.inside.trim().toUpperCase())
      }
      if (r.segmento && r.segmento.trim()) {
        segmentosSet.add(r.segmento.trim())
      }
      if (r.status && r.status.trim()) {
        statusSet.add(r.status.trim())
      }
      if (r.municipio && r.municipio.trim()) {
        municipiosSet.add(r.municipio.trim())
      }
      if (r.estado && r.estado.trim()) {
        estadosSet.add(r.estado.trim().toUpperCase())
      }
      if (typeof r.meta_valor === 'number' && !isNaN(r.meta_valor) && r.meta_valor > 0) {
        if (maxMetaValor === null || r.meta_valor > maxMetaValor) {
          maxMetaValor = r.meta_valor
        }
      }
      if (r.contato && r.contato.trim()) {
        contatosCount++
      }
      if (r.eh_canal) {
        hasEhCanal = true
      }

      const clientKey = (r.codigo_cliente || r.nome_cliente || 'SEM_COD').trim().toUpperCase()
      if (!clientesMap.has(clientKey)) {
        clientesMap.set(clientKey, {
          nome: r.nome_cliente || 'Cliente não identificado',
          cod: r.codigo_cliente || '-',
          registros: [],
        })
      }
      clientesMap.get(clientKey)!.registros.push(r)
    }

    return {
      nomeCanal: canalNome || first.nome_canal || 'Sem Canal',
      deploy: deployNormalized,
      deployNormalized,
      totalRegistros: canalRecords.length,
      totalClientes: clientesMap.size,
      totalContatos: contatosCount,
      codigosSet: Array.from(codigosSet).sort(),
      insidesSet: Array.from(insidesSet).sort(),
      segmentosSet: Array.from(segmentosSet).sort(),
      statusList: Array.from(statusSet).sort(),
      municipiosSet: Array.from(municipiosSet).sort(),
      estadosSet: Array.from(estadosSet).sort(),
      metaValorConsolidado: maxMetaValor,
      ehCanal: hasEhCanal,
      clientesMap,
    }
  }, [canalNome, canalRecords])

  // Filtragem dos clientes pelo campo de busca
  const filteredClientes = useMemo(() => {
    const list = Array.from(consolidated.clientesMap.values())
    if (!searchTerm.trim()) return list
    const q = searchTerm.trim().toLowerCase()
    return list.filter((c) => {
      if (c.nome.toLowerCase().includes(q)) return true
      if (c.cod.toLowerCase().includes(q)) return true
      return c.registros.some(
        (r) =>
          (r.contato && r.contato.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.telefone && r.telefone.toLowerCase().includes(q)) ||
          (r.cargo && r.cargo.toLowerCase().includes(q)),
      )
    })
  }, [consolidated.clientesMap, searchTerm])

  // Metas cadastradas para este canal (calculadas incondicionalmente antes de qualquer return)
  const canalMetas = useMemo(() => {
    if (!canalNome) return []
    const target = canalNome.trim().toLowerCase()
    return metas
      .filter((m) => (m.nome_canal || '').trim().toLowerCase() === target)
      .sort((a, b) => b.periodo.localeCompare(a.periodo))
  }, [canalNome, metas])

  if (!canalNome) return null

  const isAgis = consolidated.deployNormalized.includes('AGIS')
  const isRoland = consolidated.deployNormalized.includes('Roland')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden">
        {/* Cabeçalho do Card */}
        <DialogHeader className="p-5 pb-4 border-b border-slate-100 bg-linear-to-r from-slate-50 via-cyan-50/30 to-white">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pr-6">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-xl bg-cyan-50 text-[#0B6E99] border border-cyan-100 shrink-0 mt-0.5">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">
                    {consolidated.nomeCanal}
                  </DialogTitle>
                  {isAgis ? (
                    <Badge className="bg-cyan-50 text-[#0B6E99] border-cyan-200 font-bold hover:bg-cyan-50 text-xs px-2.5">
                      AGIS (Revenda)
                    </Badge>
                  ) : isRoland ? (
                    <Badge className="bg-teal-50 text-teal-700 border-teal-200 font-bold hover:bg-teal-50 text-xs px-2.5">
                      Roland (Direta)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-500 border-slate-200 text-xs">
                      {consolidated.deployNormalized || 'Nenhum'}
                    </Badge>
                  )}
                  {consolidated.ehCanal ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold"
                    >
                      É Canal Oficial
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]"
                    >
                      Não Oficial
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-xs text-slate-500 mt-1 font-medium">
                  Card do Canal • Gestão consolidada de revendas vinculadas, contatos e alteração de
                  dados
                </DialogDescription>
              </div>
            </div>

            {/* Ação rápida para vincular novo cliente/contato ao canal */}
            {onNewContactForCanal && (
              <Button
                size="sm"
                onClick={() => {
                  const sample = canalRecords[0]
                  onNewContactForCanal(consolidated.nomeCanal, sample)
                }}
                className="bg-[#0B6E99] hover:bg-[#084F6E] text-white text-xs font-bold shrink-0 h-8 gap-1 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Vincular Cliente/Contato
              </Button>
            )}
          </div>

          {/* 4 KPIs de resumo do Canal */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
            <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">
                Clientes Vinculados
              </span>
              <span className="text-lg font-black text-slate-900 mt-0.5 block">
                {consolidated.totalClientes}
              </span>
              <span className="text-[10px] text-slate-400">revendas distintas</span>
            </div>

            <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">
                Contatos Registrados
              </span>
              <span className="text-lg font-black text-[#0B6E99] mt-0.5 block">
                {consolidated.totalContatos}
              </span>
              <span className="text-[10px] text-slate-400">com e-mail / tel</span>
            </div>

            <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">
                Códigos de Cliente (COD)
              </span>
              <span className="text-lg font-black text-teal-700 mt-0.5 block font-mono">
                {consolidated.codigosSet.length}
              </span>
              <span className="text-[10px] text-slate-400">chaves de faturamento</span>
            </div>

            <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block">
                Total de Registros
              </span>
              <span className="text-lg font-black text-slate-700 mt-0.5 block">
                {consolidated.totalRegistros}
              </span>
              <span className="text-[10px] text-slate-400">linhas na base única</span>
            </div>
          </div>

          {/* SEÇÃO DE METAS DO CANAL */}
          <div className="pt-2.5 pb-1">
            <div className="p-3 bg-linear-to-r from-teal-50/70 to-emerald-50/40 border border-teal-200/80 rounded-xl">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-teal-600 text-white shadow-2xs">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Metas Mensais do Canal
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Planejamento de faturamento para acompanhamento nos dashboards
                    </span>
                  </div>
                </div>

                {onOpenMetaModal && (
                  <Button
                    size="sm"
                    onClick={() => onOpenMetaModal(consolidated.nomeCanal)}
                    className="h-7 text-xs bg-teal-700 hover:bg-teal-800 text-white font-bold gap-1 shadow-2xs"
                  >
                    <Target className="w-3.5 h-3.5" />
                    {canalMetas.length === 0 ? 'Definir meta' : 'Nova meta / Período'}
                  </Button>
                )}
              </div>

              {canalMetas.length === 0 ? (
                <div className="mt-2 text-[11px] text-slate-500 bg-white/80 p-2.5 rounded-lg border border-teal-100 flex items-center justify-between">
                  <span>Nenhuma meta cadastrada para este canal ainda.</span>
                  {onOpenMetaModal && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenMetaModal(consolidated.nomeCanal)}
                      className="h-6 text-[11px] text-teal-700 hover:text-teal-900 hover:bg-teal-100/50 font-bold p-0 px-2"
                    >
                      Cadastrar primeira meta →
                    </Button>
                  )}
                </div>
              ) : (
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {canalMetas.map((m) => {
                    const mesNome = MESES_PT_BR[m.mes - 1] || `Mês ${m.mes}`
                    return (
                      <div
                        key={m.id}
                        className="bg-white p-2.5 rounded-lg border border-teal-100 flex items-center justify-between shadow-2xs hover:border-teal-300 transition-colors"
                      >
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight block">
                            {mesNome} / {m.ano}
                          </span>
                          <span className="text-sm font-extrabold text-teal-800 tabular-nums block">
                            {formatCurrency(m.valor_meta)}
                          </span>
                        </div>
                        {onOpenMetaModal && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onOpenMetaModal(consolidated.nomeCanal, m)}
                            className="h-7 px-2 text-xs text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                            title="Editar esta meta"
                          >
                            <Pencil className="w-3 h-3 text-teal-700" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tags Consolidadas: Insides, Segmentos e Códigos */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-2 text-[11px] text-slate-600">
            {consolidated.insidesSet.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500 flex items-center gap-1">
                  <User className="w-3 h-3 text-teal-600" />
                  Inside(s):
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {consolidated.insidesSet.map((ins) => (
                    <Badge
                      key={ins}
                      variant="outline"
                      className="bg-teal-50/60 text-teal-800 border-teal-200 text-[10px] px-1.5 py-0 font-semibold"
                    >
                      {ins}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {consolidated.segmentosSet.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500 flex items-center gap-1">
                  <Briefcase className="w-3 h-3 text-[#1895A8]" />
                  Segmento(s):
                </span>
                <span className="text-slate-700 truncate max-w-xs">
                  {consolidated.segmentosSet.join(', ')}
                </span>
              </div>
            )}

            {(consolidated.municipiosSet.length > 0 || consolidated.estadosSet.length > 0) && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500 flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-indigo-600" />
                  Localização:
                </span>
                <span className="text-slate-700 truncate max-w-xs">
                  {consolidated.municipiosSet.slice(0, 2).join(', ')}
                  {consolidated.estadosSet.length > 0 && ` (${consolidated.estadosSet.join(', ')})`}
                  {consolidated.municipiosSet.length > 2 &&
                    ` +${consolidated.municipiosSet.length - 2}`}
                </span>
              </div>
            )}

            {consolidated.metaValorConsolidado !== null && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500 flex items-center gap-1">
                  <Target className="w-3 h-3 text-emerald-600" />
                  Meta da Planilha:
                </span>
                <Badge
                  variant="outline"
                  className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-bold"
                >
                  {formatCurrency(consolidated.metaValorConsolidado)}
                </Badge>
              </div>
            )}

            {consolidated.codigosSet.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">COD(s):</span>
                <span className="font-mono text-[10px] font-bold text-[#0B6E99] truncate max-w-sm">
                  {consolidated.codigosSet.slice(0, 6).join(', ')}
                  {consolidated.codigosSet.length > 6 &&
                    ` +${consolidated.codigosSet.length - 6} outros`}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Barra de Busca de Clientes/Contatos dentro do Card */}
        <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar clientes, COD, contatos ou e-mails deste canal..."
              className="pl-9 h-8.5 text-xs rounded-lg border-slate-200 focus-visible:ring-[#0B6E99] bg-white"
            />
          </div>
          <span className="text-xs text-slate-500 font-semibold shrink-0">
            {filteredClientes.length} cliente(s) listado(s)
          </span>
        </div>

        {/* Lista de Clientes e Contatos com Ações de Alteração/Exclusão */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/30">
          {filteredClientes.length === 0 ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              <Building2 className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">
                Nenhum cliente ou contato encontrado
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tente ajustar o termo de busca acima
              </p>
            </div>
          ) : (
            filteredClientes.map((cliente) => (
              <Card
                key={`${cliente.cod}_${cliente.nome}`}
                className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden"
              >
                {/* Cabeçalho do Cliente */}
                <div className="p-3 bg-slate-50/70 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-cyan-50 text-[#0B6E99] border border-cyan-100">
                      <Building2 className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-xs">{cliente.nome}</span>
                        {cliente.cod && cliente.cod !== '-' && (
                          <Badge
                            variant="outline"
                            className="font-mono text-[10px] font-bold text-[#0B6E99] bg-cyan-50/50 border-cyan-200"
                          >
                            COD: {cliente.cod}
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="text-[9px] bg-slate-200/60 text-slate-700 px-1.5 py-0"
                        >
                          {cliente.registros.length} registro(s)
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabela de Contatos/Registros vinculados a este Cliente */}
                <div className="divide-y divide-slate-100">
                  {cliente.registros.map((reg) => (
                    <div
                      key={reg.id}
                      className="p-3 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <User className="w-3 h-3 text-slate-400" />
                            {reg.contato || (
                              <span className="text-slate-400 italic">Sem contato nominado</span>
                            )}
                          </span>
                          {reg.cargo && (
                            <Badge
                              variant="outline"
                              className="text-[10px] text-slate-600 border-slate-200 bg-slate-50"
                            >
                              {reg.cargo}
                            </Badge>
                          )}
                          {reg.status && (
                            <span className="text-[10px] text-slate-400">
                              • Status: {reg.status}
                            </span>
                          )}
                          {reg.inside && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-teal-50/50 text-teal-700 border-teal-200"
                            >
                              Inside: {reg.inside}
                            </Badge>
                          )}
                        </div>

                        {/* Dados de Comunicação: Email e Telefone */}
                        <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-500 pt-0.5">
                          {reg.email ? (
                            <a
                              href={`mailto:${reg.email}`}
                              className="text-[#0B6E99] hover:underline flex items-center gap-1 font-medium"
                              title={reg.email}
                            >
                              <Mail className="w-3 h-3 text-[#0B6E99] shrink-0" />
                              <span>{reg.email}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 flex items-center gap-1 text-[10px]">
                              <Mail className="w-3 h-3 text-slate-300" /> Sem e-mail
                            </span>
                          )}

                          {reg.telefone ? (
                            <span className="text-slate-600 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{reg.telefone}</span>
                            </span>
                          ) : null}

                          {reg.segmento ? (
                            <span className="text-slate-400 text-[10px] truncate max-w-[200px]">
                              Seg: {reg.segmento}
                            </span>
                          ) : null}

                          {reg.municipio || reg.estado ? (
                            <span className="text-slate-500 text-[10px] flex items-center gap-0.5 font-medium">
                              • {[reg.municipio, reg.estado].filter(Boolean).join(' - ')}
                            </span>
                          ) : null}

                          {typeof reg.meta_valor === 'number' && reg.meta_valor > 0 ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200 px-1 py-0"
                            >
                              Meta: {formatCurrency(reg.meta_valor)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      {/* Botões de Ação de Alteração / Exclusão de cada registro */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onEditItem(reg)}
                          className="h-7 px-2.5 text-xs text-slate-700 border-slate-200 hover:text-[#0B6E99] hover:border-cyan-300 hover:bg-cyan-50 font-semibold gap-1"
                          title="Alterar este registro no modal de edição"
                        >
                          <Pencil className="w-3 h-3 text-[#0B6E99]" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDeleteItem(reg)}
                          className="h-7 px-2 text-xs text-slate-500 border-slate-200 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50"
                          title="Excluir este registro"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Rodapé com Fechar e Totais */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Exibindo <strong className="text-slate-800">{filteredClientes.length}</strong> de{' '}
              <strong className="text-slate-800">{consolidated.totalClientes}</strong> clientes do
              canal
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-8 px-4 font-semibold"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
