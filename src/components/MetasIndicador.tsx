import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Target, TrendingUp, Briefcase, UserCheck, RefreshCw, Calendar } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, MESES_PT_BR } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import pb from '@/lib/pocketbase/client'
import { fetchCanaisMetas } from '@/services/canais'
import type { CanalMeta } from '@/types/sales'

export interface MetasIndicadorProps {
  /**
   * Mês inicial vindo do FilterBar (1-12 ou string)
   */
  filterMes?: number | string | null
  /**
   * Ano inicial vindo do FilterBar (number ou string)
   */
  filterAno?: number | string | null
  /**
   * Título customizado ou subtítulo
   */
  className?: string
}

interface ItemMetaRealizado {
  nome: string
  meta: number
  realizado: number
  percentual: number // arredondado inteiro
  detalhe?: string
}

export function MetasIndicador({ filterMes, filterAno, className }: MetasIndicadorProps) {
  const [activeTab, setActiveTab] = useState<'canal' | 'deploy' | 'inside'>('canal')
  const [metas, setMetas] = useState<CanalMeta[]>([])
  const [loading, setLoading] = useState(true)

  // Período selecionado localmente no bloco de metas
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const initialAno = Number(filterAno) > 2000 ? Number(filterAno) : currentYear
  const initialMes =
    Number(filterMes) >= 1 && Number(filterMes) <= 12 ? Number(filterMes) : currentMonth

  const [selectedAno, setSelectedAno] = useState<number>(initialAno)
  const [selectedMes, setSelectedMes] = useState<number>(initialMes)

  // Quando os filtros do dashboard mudarem, atualiza o período selecionado
  useEffect(() => {
    const numAno = Number(filterAno)
    if (numAno && numAno > 2000) {
      setSelectedAno(numAno)
    }
  }, [filterAno])

  useEffect(() => {
    const numMes = Number(filterMes)
    if (numMes && numMes >= 1 && numMes <= 12) {
      setSelectedMes(numMes)
    }
  }, [filterMes])

  const periodoStr = `${selectedAno}-${String(selectedMes).padStart(2, '0')}`

  // Carrega todas as metas cadastradas
  const loadMetasData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchCanaisMetas()
      setMetas(data || [])
    } catch (err) {
      console.error('Erro ao carregar metas em MetasIndicador:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMetasData()
  }, [loadMetasData])

  // Metas do período selecionado
  const metasDoPeriodo = useMemo(() => {
    return metas.filter((m) => m.periodo === periodoStr)
  }, [metas, periodoStr])

  // Busca do faturamento real do mês/ano selecionado na coleção `vendas` ou `resumo_vendas_mensal`
  // e mapeamento com os canais_clientes
  const [realizadoMapByCanal, setRealizadoMapByCanal] = useState<Record<string, number>>({})
  const [canaisMetaInfo, setCanaisMetaInfo] = useState<
    Record<string, { deploy: string; inside: string }>
  >({})
  const [loadingRealizado, setLoadingRealizado] = useState(false)

  const loadRealizadoData = useCallback(async () => {
    if (metasDoPeriodo.length === 0) {
      setRealizadoMapByCanal({})
      return
    }

    try {
      setLoadingRealizado(true)

      // 1. Carrega o mapa de canais_clientes para relacionar clientes e canais (eh_canal = true)
      const ccRecords = await pb.collection('canais_clientes').getFullList({
        filter: "eh_canal = true || eh_canal = 'true' || eh_canal = 'SIM' || eh_canal = 'Sim'",
        fields: 'codigo_cliente,nome_cliente,nome_canal,deploy,inside',
      })

      const codToCanal: Record<string, string[]> = {}
      const nomToCanal: Record<string, string[]> = {}
      const infoByCanal: Record<string, { deploy: string; inside: string }> = {}

      for (const rec of ccRecords) {
        const canal = (rec.nome_canal || '').trim()
        const cod = (rec.codigo_cliente || '').trim().toUpperCase()
        const nom = (rec.nome_cliente || '').trim().toUpperCase()
        let dep = (rec.deploy || '').trim().toUpperCase()
        if (dep.includes('AGIS')) dep = 'AGIS'
        else if (dep.includes('ROLAND')) dep = 'Roland'
        else dep = 'Nenhum'
        const ins = (rec.inside || '').trim().toUpperCase() || 'SEM INSIDE'

        if (canal) {
          if (!infoByCanal[canal]) {
            infoByCanal[canal] = { deploy: dep, inside: ins }
          }
          if (cod && cod !== '-') {
            if (!codToCanal[cod]) codToCanal[cod] = []
            if (!codToCanal[cod].includes(canal)) codToCanal[cod].push(canal)
          }
          if (nom) {
            if (!nomToCanal[nom]) nomToCanal[nom] = []
            if (!nomToCanal[nom].includes(canal)) nomToCanal[nom].push(canal)
          }
        }
      }
      setCanaisMetaInfo(infoByCanal)

      // 2. Consulta vendas do período (mês e ano) via resumo_vendas_mensal ou vendas
      // Como queremos o faturamento mensal real daquele mês:
      // data_lancamento no padrão YYYY-MM ou ano=selectedAno && mes=selectedMes
      const mesPrefix = `${selectedAno}-${String(selectedMes).padStart(2, '0')}`

      let salesRows: Array<{
        codigo_cliente?: string
        nome_cliente?: string
        total_linha?: number
      }> = []

      try {
        // Tenta primeiro resumo_vendas_mensal
        const resResumo = await pb
          .collection('resumo_vendas_mensal')
          .getFullList<Record<string, unknown>>({
            filter: `ano = ${selectedAno} && mes = ${selectedMes}`,
            fields: 'codigo_cliente,nome_cliente,total_linha',
          })
        salesRows = resResumo.map((r) => ({
          codigo_cliente: String(r.codigo_cliente || ''),
          nome_cliente: String(r.nome_cliente || ''),
          total_linha: Number(r.total_linha) || 0,
        }))
      } catch (_) {
        // Fallback para vendas
        try {
          const resVendas = await pb.collection('vendas').getFullList<Record<string, unknown>>({
            filter: `data_lancamento >= '${mesPrefix}-01' && data_lancamento <= '${mesPrefix}-31'`,
            fields: 'codigo_cliente,nome_cliente,total_linha',
          })
          salesRows = resVendas.map((r) => ({
            codigo_cliente: String(r.codigo_cliente || ''),
            nome_cliente: String(r.nome_cliente || ''),
            total_linha: Number(r.total_linha) || 0,
          }))
        } catch (vErr) {
          console.warn('Erro ao buscar vendas do período para metas:', vErr)
        }
      }

      // 3. Agrega faturamento por canal
      const canalRealMap: Record<string, number> = {}

      for (const row of salesRows) {
        const cod = (row.codigo_cliente || '').trim().toUpperCase()
        const nom = (row.nome_cliente || '').trim().toUpperCase()
        const valor = Number(row.total_linha) || 0
        if (valor === 0) continue

        let targetCanais = codToCanal[cod]
        if (!targetCanais || targetCanais.length === 0) {
          targetCanais = nomToCanal[nom]
        }

        if (targetCanais && targetCanais.length > 0) {
          const split = valor / targetCanais.length
          for (const c of targetCanais) {
            canalRealMap[c] = (canalRealMap[c] || 0) + split
          }
        }
      }

      setRealizadoMapByCanal(canalRealMap)
    } catch (err) {
      console.error('Erro ao calcular realizado de metas:', err)
    } finally {
      setLoadingRealizado(false)
    }
  }, [metasDoPeriodo, selectedAno, selectedMes])

  useEffect(() => {
    loadRealizadoData()
  }, [loadRealizadoData])

  // 1. Consolidação POR CANAL (somente canais com meta cadastrada no período)
  const itensPorCanal = useMemo<ItemMetaRealizado[]>(() => {
    const list: ItemMetaRealizado[] = []
    for (const m of metasDoPeriodo) {
      const canal = m.nome_canal
      const meta = Number(m.valor_meta) || 0
      const realizado = realizadoMapByCanal[canal] || 0
      const pct = meta > 0 ? Math.round((realizado / meta) * 100) : 0
      list.push({
        nome: canal,
        meta,
        realizado,
        percentual: pct,
        detalhe: canaisMetaInfo[canal]?.deploy || 'Deploy indefinido',
      })
    }
    // Ordenado por % alcançado (maior primeiro)
    return list.sort((a, b) => b.percentual - a.percentual)
  }, [metasDoPeriodo, realizadoMapByCanal, canaisMetaInfo])

  // 2. Consolidação POR CANAL DE FATURAMENTO (Deploy: AGIS vs Roland)
  // Regra: Somar metas e faturamento apenas dos canais vinculados que possuem meta no período
  const itensPorDeploy = useMemo<ItemMetaRealizado[]>(() => {
    const deployMap: Record<string, { meta: number; realizado: number; canaisQtd: number }> = {
      AGIS: { meta: 0, realizado: 0, canaisQtd: 0 },
      Roland: { meta: 0, realizado: 0, canaisQtd: 0 },
    }

    for (const m of metasDoPeriodo) {
      const canal = m.nome_canal
      const meta = Number(m.valor_meta) || 0
      const realizado = realizadoMapByCanal[canal] || 0
      const depInfo = (canaisMetaInfo[canal]?.deploy || '').toUpperCase()
      const key = depInfo.includes('AGIS') ? 'AGIS' : depInfo.includes('ROLAND') ? 'Roland' : null

      if (key && deployMap[key]) {
        deployMap[key].meta += meta
        deployMap[key].realizado += realizado
        deployMap[key].canaisQtd += 1
      }
    }

    const list: ItemMetaRealizado[] = []
    for (const k of ['AGIS', 'Roland'] as const) {
      const d = deployMap[k]
      if (d.meta > 0 || d.realizado > 0) {
        const pct = d.meta > 0 ? Math.round((d.realizado / d.meta) * 100) : 0
        list.push({
          nome: k === 'AGIS' ? 'AGIS (Revenda)' : 'Roland (Direta)',
          meta: d.meta,
          realizado: d.realizado,
          percentual: pct,
          detalhe: `${d.canaisQtd} canal(is) com meta`,
        })
      }
    }

    return list.sort((a, b) => b.percentual - a.percentual)
  }, [metasDoPeriodo, realizadoMapByCanal, canaisMetaInfo])

  // 3. Consolidação POR INSIDE
  const itensPorInside = useMemo<ItemMetaRealizado[]>(() => {
    const insideMap: Record<string, { meta: number; realizado: number; canaisQtd: number }> = {}

    for (const m of metasDoPeriodo) {
      const canal = m.nome_canal
      const meta = Number(m.valor_meta) || 0
      const realizado = realizadoMapByCanal[canal] || 0
      const ins = (canaisMetaInfo[canal]?.inside || 'SEM INSIDE').toUpperCase().trim()

      if (!insideMap[ins]) {
        insideMap[ins] = { meta: 0, realizado: 0, canaisQtd: 0 }
      }
      insideMap[ins].meta += meta
      insideMap[ins].realizado += realizado
      insideMap[ins].canaisQtd += 1
    }

    const list: ItemMetaRealizado[] = []
    for (const [ins, d] of Object.entries(insideMap)) {
      if (d.meta > 0 || d.realizado > 0) {
        const pct = d.meta > 0 ? Math.round((d.realizado / d.meta) * 100) : 0
        list.push({
          nome: ins,
          meta: d.meta,
          realizado: d.realizado,
          percentual: pct,
          detalhe: `${d.canaisQtd} canal(is) com meta`,
        })
      }
    }

    return list.sort((a, b) => b.percentual - a.percentual)
  }, [metasDoPeriodo, realizadoMapByCanal, canaisMetaInfo])

  // Total geral consolidado de todas as metas do período
  const totalGeral = useMemo(() => {
    const meta = itensPorCanal.reduce((acc, c) => acc + c.meta, 0)
    const realizado = itensPorCanal.reduce((acc, c) => acc + c.realizado, 0)
    const pct = meta > 0 ? Math.round((realizado / meta) * 100) : 0
    return { meta, realizado, pct, canaisCount: itensPorCanal.length }
  }, [itensPorCanal])

  const currentList =
    activeTab === 'canal' ? itensPorCanal : activeTab === 'deploy' ? itensPorDeploy : itensPorInside

  // Helper de cor para % de meta: verde (>= 100%), âmbar (70–99%), vermelho (< 70%)
  const getProgressColor = (pct: number) => {
    if (pct >= 100) {
      return {
        bar: 'bg-emerald-600',
        text: 'text-emerald-700',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      }
    }
    if (pct >= 70) {
      return {
        bar: 'bg-amber-500',
        text: 'text-amber-700',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
      }
    }
    return {
      bar: 'bg-rose-500',
      text: 'text-rose-700',
      badge: 'bg-rose-50 text-rose-700 border-rose-200',
    }
  }

  const isBusy = loading || loadingRealizado

  return (
    <Card
      className={cn(
        'rounded-xl border border-teal-200/80 bg-white shadow-xs overflow-hidden',
        className,
      )}
    >
      <CardHeader className="pb-3 border-b border-teal-100 bg-linear-to-r from-teal-50/60 via-white to-cyan-50/40">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-teal-700 text-white shadow-2xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-extrabold text-slate-900 tracking-tight">
                  Acompanhamento de Metas
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold bg-white text-teal-800 border-teal-200"
                >
                  {MESES_PT_BR[selectedMes - 1]} / {selectedAno}
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
                Consolidação de metas alcançadas por Canal, Canal de Faturamento (Deploy) e Inside
                Sales
              </CardDescription>
            </div>
          </div>

          {/* Seletores de Período e Botão de Atualizar */}
          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-teal-200 rounded-lg p-1 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-teal-700 ml-1.5" />
              <Select value={String(selectedMes)} onValueChange={(v) => setSelectedMes(Number(v))}>
                <SelectTrigger className="h-7 text-xs border-0 shadow-none font-bold text-slate-700 focus:ring-0 w-28">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent className="max-h-60 text-xs">
                  {MESES_PT_BR.map((m, idx) => (
                    <SelectItem key={m} value={String(idx + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(selectedAno)} onValueChange={(v) => setSelectedAno(Number(v))}>
                <SelectTrigger className="h-7 text-xs border-0 shadow-none font-bold text-slate-700 focus:ring-0 w-20">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadMetasData()
                loadRealizadoData()
              }}
              disabled={isBusy}
              className="h-8 px-2.5 text-xs text-teal-800 border-teal-200 hover:bg-teal-50 shadow-2xs"
              title="Atualizar dados de metas"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isBusy && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Resumo Consolidado do Período */}
        {totalGeral.canaisCount > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-teal-100/80">
            <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Meta Consolidada
              </span>
              <span className="text-sm sm:text-base font-black text-slate-900 tabular-nums">
                {formatCurrency(totalGeral.meta)}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Faturamento Real
              </span>
              <span className="text-sm sm:text-base font-black text-teal-700 tabular-nums">
                {formatCurrency(totalGeral.realizado)}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                % Alcançado Geral
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={cn(
                    'text-base sm:text-lg font-black tabular-nums',
                    getProgressColor(totalGeral.pct).text,
                  )}
                >
                  {totalGeral.pct}%
                </span>
                <span className="text-[10px] text-slate-400 font-medium">da meta</span>
              </div>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Canais com Meta
              </span>
              <span className="text-sm sm:text-base font-black text-[#0B6E99]">
                {totalGeral.canaisCount} canal(is)
              </span>
            </div>
          </div>
        )}

        {/* Abas dos 3 Recortes Solicitados */}
        <div className="flex items-center gap-1.5 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('canal')}
            className={cn(
              'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
              activeTab === 'canal'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-teal-50/60 border border-slate-200',
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Por Canal ({itensPorCanal.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deploy')}
            className={cn(
              'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
              activeTab === 'deploy'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-teal-50/60 border border-slate-200',
            )}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Por Canal de Faturamento ({itensPorDeploy.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inside')}
            className={cn(
              'px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer',
              activeTab === 'inside'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-teal-50/60 border border-slate-200',
            )}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Por Inside ({itensPorInside.length})</span>
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        {isBusy ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-600" />
            <p className="text-xs font-medium">Calculando atingimento de metas...</p>
          </div>
        ) : metasDoPeriodo.length === 0 ? (
          <div className="py-10 text-center">
            <Target className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold text-slate-700">
              Nenhuma meta cadastrada para {MESES_PT_BR[selectedMes - 1]} de {selectedAno}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
              Cadastre metas mensais no menu <strong>Canais</strong> para acompanhar o atingimento
              consolidado por canal, deploy (AGIS / Roland) e inside sales.
            </p>
          </div>
        ) : currentList.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Nenhum dado encontrado para o recorte selecionado.
          </div>
        ) : (
          <div className="space-y-3.5">
            {currentList.map((item) => {
              const colors = getProgressColor(item.percentual)
              const clampedWidth = Math.min(Math.max(item.percentual, 0), 100)

              return (
                <div
                  key={item.nome}
                  className="bg-slate-50/60 p-3 rounded-xl border border-slate-200/80 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900 tracking-tight">
                        {item.nome}
                      </span>
                      {item.detalhe && (
                        <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 font-medium">
                          {item.detalhe}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">
                          Real / Meta
                        </span>
                        <span className="text-xs font-extrabold text-slate-800 tabular-nums">
                          {formatCurrency(item.realizado)}
                          <span className="text-slate-400 font-normal"> / </span>
                          {formatCurrency(item.meta)}
                        </span>
                      </div>

                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-black px-2.5 py-1 min-w-[54px] text-center justify-center tabular-nums shadow-2xs',
                          colors.badge,
                        )}
                      >
                        {item.percentual}%
                      </Badge>
                    </div>
                  </div>

                  {/* Barra de Progresso com Paleta Roland DG / Metas */}
                  <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
                      style={{ width: `${clampedWidth}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
