import { useState, useMemo } from 'react'
import { MapPin, TrendingUp, Layers, ChevronRight, Store, X, Phone, Navigation } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { REVENDAS_ROLAND_DG, type RevendaOficial } from '@/data/revendas'

export interface EstadoVendaItem {
  uf: string
  total: number
}

interface VendasPorEstadoProps {
  data: EstadoVendaItem[]
  selectedUf?: string | null
  onSelectUf?: (uf: string | null) => void
  revendasFaturamento?: Record<string, { faturamento: number; documentos: number; itens: number }>
  isExpanded?: boolean
}

// Mapeamento oficial dos estados do Brasil para suas respectivas regiões
export const UF_REGION_MAP: Record<string, { region: string; name: string }> = {
  // Norte
  AC: { region: 'Norte', name: 'Acre' },
  AP: { region: 'Norte', name: 'Amapá' },
  AM: { region: 'Norte', name: 'Amazonas' },
  PA: { region: 'Norte', name: 'Pará' },
  RO: { region: 'Norte', name: 'Rondônia' },
  RR: { region: 'Norte', name: 'Roraima' },
  TO: { region: 'Norte', name: 'Tocantins' },
  // Nordeste
  AL: { region: 'Nordeste', name: 'Alagoas' },
  BA: { region: 'Nordeste', name: 'Bahia' },
  CE: { region: 'Nordeste', name: 'Ceará' },
  MA: { region: 'Nordeste', name: 'Maranhão' },
  PB: { region: 'Nordeste', name: 'Paraíba' },
  PE: { region: 'Nordeste', name: 'Pernambuco' },
  PI: { region: 'Nordeste', name: 'Piauí' },
  RN: { region: 'Nordeste', name: 'Rio Grande do Norte' },
  SE: { region: 'Nordeste', name: 'Sergipe' },
  // Centro-Oeste
  DF: { region: 'Centro-Oeste', name: 'Distrito Federal' },
  GO: { region: 'Centro-Oeste', name: 'Goiás' },
  MT: { region: 'Centro-Oeste', name: 'Mato Grosso' },
  MS: { region: 'Centro-Oeste', name: 'Mato Grosso do Sul' },
  // Sudeste
  ES: { region: 'Sudeste', name: 'Espírito Santo' },
  MG: { region: 'Sudeste', name: 'Minas Gerais' },
  RJ: { region: 'Sudeste', name: 'Rio de Janeiro' },
  SP: { region: 'Sudeste', name: 'São Paulo' },
  // Sul
  PR: { region: 'Sul', name: 'Paraná' },
  RS: { region: 'Sul', name: 'Rio Grande do Sul' },
  SC: { region: 'Sul', name: 'Santa Catarina' },
}

export const REGIONS_ORDER = ['Sudeste', 'Sul', 'Nordeste', 'Centro-Oeste', 'Norte'] as const

// Posições e paths poligonais simplificados para o mapa SVG do Brasil (viewBox 0 0 600 600)
// Proporção geográfica estilizada com precisão visual de fronteiras relativas
export const BRAZIL_STATES_SVG: Record<
  string,
  {
    d: string
    labelX: number
    labelY: number
    name: string
    region: string
  }
> = {
  // NORTE
  RR: {
    name: 'Roraima',
    region: 'Norte',
    labelX: 235,
    labelY: 90,
    d: 'M 215,60 L 255,60 L 265,100 L 235,130 L 210,105 Z',
  },
  AP: {
    name: 'Amapá',
    region: 'Norte',
    labelX: 355,
    labelY: 100,
    d: 'M 345,75 L 375,85 L 365,125 L 340,115 Z',
  },
  AM: {
    name: 'Amazonas',
    region: 'Norte',
    labelX: 145,
    labelY: 165,
    d: 'M 80,120 L 175,105 L 235,130 L 225,185 L 215,225 L 145,235 L 75,180 Z',
  },
  PA: {
    name: 'Pará',
    region: 'Norte',
    labelX: 310,
    labelY: 175,
    d: 'M 255,100 L 340,115 L 380,140 L 365,240 L 325,250 L 275,230 L 235,160 Z',
  },
  AC: {
    name: 'Acre',
    region: 'Norte',
    labelX: 55,
    labelY: 235,
    d: 'M 30,225 L 85,220 L 80,250 L 35,245 Z',
  },
  RO: {
    name: 'Rondônia',
    region: 'Norte',
    labelX: 150,
    labelY: 260,
    d: 'M 125,235 L 175,230 L 180,285 L 135,275 Z',
  },
  TO: {
    name: 'Tocantins',
    region: 'Norte',
    labelX: 345,
    labelY: 275,
    d: 'M 330,230 L 365,240 L 360,325 L 325,320 Z',
  },

  // NORDESTE
  MA: {
    name: 'Maranhão',
    region: 'Nordeste',
    labelX: 395,
    labelY: 195,
    d: 'M 370,145 L 420,165 L 425,230 L 375,235 Z',
  },
  PI: {
    name: 'Piauí',
    region: 'Nordeste',
    labelX: 435,
    labelY: 230,
    d: 'M 420,175 L 445,185 L 450,265 L 415,260 Z',
  },
  CE: {
    name: 'Ceará',
    region: 'Nordeste',
    labelX: 470,
    labelY: 185,
    d: 'M 445,170 L 490,175 L 485,215 L 450,205 Z',
  },
  RN: {
    name: 'Rio Grande do Norte',
    region: 'Nordeste',
    labelX: 515,
    labelY: 195,
    d: 'M 490,180 L 535,185 L 530,210 L 490,205 Z',
  },
  PB: {
    name: 'Paraíba',
    region: 'Nordeste',
    labelX: 520,
    labelY: 218,
    d: 'M 485,210 L 540,212 L 535,228 L 480,225 Z',
  },
  PE: {
    name: 'Pernambuco',
    region: 'Nordeste',
    labelX: 505,
    labelY: 240,
    d: 'M 450,225 L 545,230 L 535,250 L 455,245 Z',
  },
  AL: {
    name: 'Alagoas',
    region: 'Nordeste',
    labelX: 530,
    labelY: 260,
    d: 'M 510,248 L 545,252 L 530,270 L 505,262 Z',
  },
  SE: {
    name: 'Sergipe',
    region: 'Nordeste',
    labelX: 512,
    labelY: 280,
    d: 'M 495,265 L 525,270 L 515,290 L 490,282 Z',
  },
  BA: {
    name: 'Bahia',
    region: 'Nordeste',
    labelX: 440,
    labelY: 310,
    d: 'M 395,250 L 465,245 L 505,290 L 475,370 L 415,355 L 390,300 Z',
  },

  // CENTRO-OESTE
  MT: {
    name: 'Mato Grosso',
    region: 'Centro-Oeste',
    labelX: 245,
    labelY: 285,
    d: 'M 195,215 L 295,215 L 315,335 L 230,345 L 205,290 Z',
  },
  GO: {
    name: 'Goiás',
    region: 'Centro-Oeste',
    labelX: 335,
    labelY: 360,
    d: 'M 315,315 L 375,325 L 370,400 L 310,385 Z',
  },
  DF: {
    name: 'Distrito Federal',
    region: 'Centro-Oeste',
    labelX: 365,
    labelY: 345,
    d: 'M 358,340 L 372,340 L 372,352 L 358,352 Z',
  },
  MS: {
    name: 'Mato Grosso do Sul',
    region: 'Centro-Oeste',
    labelX: 265,
    labelY: 410,
    d: 'M 240,360 L 305,365 L 310,445 L 245,435 Z',
  },

  // SUDESTE
  MG: {
    name: 'Minas Gerais',
    region: 'Sudeste',
    labelX: 405,
    labelY: 395,
    d: 'M 370,335 L 445,350 L 470,410 L 405,445 L 355,410 Z',
  },
  ES: {
    name: 'Espírito Santo',
    region: 'Sudeste',
    labelX: 480,
    labelY: 400,
    d: 'M 465,375 L 495,385 L 485,425 L 460,415 Z',
  },
  RJ: {
    name: 'Rio de Janeiro',
    region: 'Sudeste',
    labelX: 450,
    labelY: 445,
    d: 'M 425,430 L 475,425 L 460,455 L 415,445 Z',
  },
  SP: {
    name: 'São Paulo',
    region: 'Sudeste',
    labelX: 345,
    labelY: 445,
    d: 'M 315,415 L 405,425 L 390,475 L 305,455 Z',
  },

  // SUL
  PR: {
    name: 'Paraná',
    region: 'Sul',
    labelX: 320,
    labelY: 485,
    d: 'M 290,455 L 375,465 L 360,510 L 285,495 Z',
  },
  SC: {
    name: 'Santa Catarina',
    region: 'Sul',
    labelX: 330,
    labelY: 525,
    d: 'M 295,505 L 365,510 L 350,545 L 290,530 Z',
  },
  RS: {
    name: 'Rio Grande do Sul',
    region: 'Sul',
    labelX: 305,
    labelY: 565,
    d: 'M 275,530 L 345,540 L 325,600 L 265,580 Z',
  },
}

export function VendasPorEstadoIndicador({
  data,
  selectedUf: externalSelectedUf,
  onSelectUf,
  revendasFaturamento,
  isExpanded = false,
}: VendasPorEstadoProps) {
  const [internalSelectedUf, setInternalSelectedUf] = useState<string | null>(null)
  const [hoveredUf, setHoveredUf] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedRevenda, setSelectedRevenda] = useState<RevendaOficial | null>(null)
  const [hoveredRevenda, setHoveredRevenda] = useState<RevendaOficial | null>(null)
  const [showRevendasPins, setShowRevendasPins] = useState<boolean>(true)

  const activeSelectedUf =
    externalSelectedUf !== undefined ? externalSelectedUf : internalSelectedUf

  const handleSelectUf = (uf: string | null) => {
    if (onSelectUf) {
      onSelectUf(uf)
    } else {
      setInternalSelectedUf(uf)
    }
  }

  // Mapa de UF -> total
  const ufMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of data) {
      if (item.uf) {
        map.set(item.uf.toUpperCase().trim(), item.total || 0)
      }
    }
    return map
  }, [data])

  const totalGeral = useMemo(() => {
    return Array.from(ufMap.values()).reduce((acc, curr) => acc + curr, 0)
  }, [ufMap])

  // Agrupamento por região com ranking e ordenação por faturamento desc
  const regionStats = useMemo(() => {
    const byRegion: Record<
      string,
      { total: number; estados: { uf: string; name: string; total: number }[] }
    > = {
      Sudeste: { total: 0, estados: [] },
      Sul: { total: 0, estados: [] },
      Nordeste: { total: 0, estados: [] },
      'Centro-Oeste': { total: 0, estados: [] },
      Norte: { total: 0, estados: [] },
    }

    // Inicializa todos os estados em suas regiões
    for (const [uf, info] of Object.entries(UF_REGION_MAP)) {
      const valor = ufMap.get(uf) || 0
      const reg = info.region
      if (byRegion[reg]) {
        byRegion[reg].total += valor
        byRegion[reg].estados.push({
          uf,
          name: info.name,
          total: valor,
        })
      }
    }

    // Ordena os estados de cada região pelo faturamento desc
    for (const reg of Object.keys(byRegion)) {
      byRegion[reg].estados.sort((a, b) => b.total - a.total)
    }

    // Retorna array de regiões ordenadas por total decrescente
    return Object.entries(byRegion)
      .map(([regiao, val]) => ({
        regiao,
        total: val.total,
        percentual: totalGeral > 0 ? (val.total / totalGeral) * 100 : 0,
        estados: val.estados,
      }))
      .sort((a, b) => b.total - a.total)
  }, [ufMap, totalGeral])

  // Valor máximo por estado para normalizar cor de intensidade
  const maxEstadoValor = useMemo(() => {
    let max = 0
    for (const val of ufMap.values()) {
      if (val > max) max = val
    }
    return max || 1
  }, [ufMap])

  // Helper para calcular cor de intensidade com a paleta oficial Roland DG:
  // Base cinza suave quando zerado -> Ciano claro -> Ciano escuro -> Azul Royal #0B6E99
  const getFillColor = (uf: string) => {
    const valor = ufMap.get(uf) || 0
    const isSelected = activeSelectedUf === uf
    const isHovered = hoveredUf === uf

    if (isSelected) {
      return '#0B6E99' // Azul destaque primário
    }
    if (isHovered) {
      return '#1895A8' // Ciano hover
    }
    if (valor === 0) {
      return '#E2E8F0' // Slate 200 neutro para estados sem vendas no filtro
    }

    const ratio = Math.min(1, Math.max(0.15, valor / maxEstadoValor))

    // Gradiente entre ciano suave (ex: #99E1EC) e azul profundo (#0B6E99)
    if (ratio > 0.65) return '#0B6E99'
    if (ratio > 0.35) return '#14829E'
    if (ratio > 0.15) return '#1895A8'
    return '#67C1D1'
  }

  const activeUfInfo = useMemo(() => {
    const uf = hoveredUf || activeSelectedUf
    if (!uf) return null
    const meta = UF_REGION_MAP[uf]
    const valor = ufMap.get(uf) || 0
    const percent = totalGeral > 0 ? (valor / totalGeral) * 100 : 0
    return {
      uf,
      name: meta?.name || uf,
      region: meta?.region || 'Brasil',
      total: valor,
      percentual: percent,
    }
  }, [hoveredUf, activeSelectedUf, ufMap, totalGeral])

  return (
    <div className="space-y-4">
      {/* Top Header Resumo com Regiões Ranquedas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {regionStats.map((item, idx) => {
          const isRegActive = selectedRegion === item.regiao
          return (
            <button
              key={item.regiao}
              type="button"
              onClick={() => setSelectedRegion(isRegActive ? null : item.regiao)}
              className={cn(
                'p-2.5 rounded-lg border text-left transition-all',
                isRegActive
                  ? 'border-[#0B6E99] bg-cyan-50/60 ring-2 ring-[#0B6E99]/30'
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70',
              )}
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1">
                <span className="flex items-center gap-1 truncate">
                  <span className="text-[10px] text-slate-400">#{idx + 1}</span>
                  {item.regiao}
                </span>
                <span className="text-[#0B6E99] font-extrabold text-[10px]">
                  {item.percentual.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs sm:text-sm font-extrabold text-slate-900 truncate tabular-nums">
                {formatCurrency(item.total)}
              </div>
            </button>
          )
        })}
      </div>

      {/* Grid: Mapa do Brasil (esquerda) + Ranquamento detalhado por Região e Estado (direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2">
        {/* Coluna 1: Mapa do Brasil Interativo */}
        <div className="lg:col-span-7 flex flex-col items-center bg-slate-50/50 rounded-xl border border-slate-200 p-4">
          <div className="w-full flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-700">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#0B6E99]" />
                <span>Mapa de Intensidade &amp; Revendas</span>
              </div>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-slate-600 bg-white">
                {REVENDAS_ROLAND_DG.length} Revendas Oficiais
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRevendasPins((prev) => !prev)}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border transition-colors',
                  showRevendasPins
                    ? 'bg-[#0B6E99] text-white border-[#0B6E99]'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',
                )}
                title="Alternar visibilidade dos pinos das revendas autorizadas"
              >
                <Store className="w-3 h-3" />
                <span>Pinos de Revendas</span>
              </button>

              {activeSelectedUf && (
                <button
                  type="button"
                  onClick={() => handleSelectUf(null)}
                  className="text-[11px] font-bold text-[#0B6E99] hover:underline"
                >
                  Limpar UF ({activeSelectedUf})
                </button>
              )}
            </div>
          </div>

          {/* SVG do Mapa do Brasil */}
          <div
            className={cn(
              'w-full aspect-square relative flex items-center justify-center transition-all',
              isExpanded ? 'max-w-[560px] lg:max-w-[620px]' : 'max-w-[420px]',
            )}
          >
            <svg
              viewBox="0 0 600 600"
              className="w-full h-full drop-shadow-xs select-none"
              style={{ overflow: 'visible' }}
            >
              <g>
                {Object.entries(BRAZIL_STATES_SVG).map(([uf, info]) => {
                  const isHovered = hoveredUf === uf
                  const isSelected = activeSelectedUf === uf
                  const isRegionHighlight = selectedRegion && info.region === selectedRegion
                  const fillColor = getFillColor(uf)

                  return (
                    <g
                      key={uf}
                      className="cursor-pointer transition-transform duration-100"
                      onMouseEnter={() => setHoveredUf(uf)}
                      onMouseLeave={() => setHoveredUf(null)}
                      onClick={() => handleSelectUf(isSelected ? null : uf)}
                    >
                      <path
                        d={info.d}
                        fill={fillColor}
                        stroke={isSelected ? '#084F6E' : isHovered ? '#0B6E99' : '#FFFFFF'}
                        strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                        className={cn(
                          'transition-all',
                          isRegionHighlight && !isSelected && 'stroke-[#0B6E99] stroke-2',
                        )}
                      />
                      {/* Sigla no centro do estado */}
                      <text
                        x={info.labelX}
                        y={info.labelY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        className={cn(
                          'text-[10px] font-bold pointer-events-none select-none',
                          isSelected || (ufMap.get(uf) || 0) > maxEstadoValor * 0.35
                            ? 'fill-white'
                            : 'fill-slate-700',
                        )}
                        style={{ fontSize: '11px', fontWeight: 700 }}
                      >
                        {uf}
                      </text>
                    </g>
                  )
                })}
              </g>

              {/* Camada de Pinos de Revendas Oficiais Roland DG */}
              {showRevendasPins && (
                <g className="revendas-pins">
                  {REVENDAS_ROLAND_DG.map((rev) => {
                    const isRevSelected = selectedRevenda?.id === rev.id
                    const isRevHovered = hoveredRevenda?.id === rev.id
                    const faturamentoInfo = revendasFaturamento?.[rev.id]
                    const faturamentoValor = faturamentoInfo?.faturamento || 0
                    const hasVendas = faturamentoValor > 0

                    return (
                      <g
                        key={rev.id}
                        className="cursor-pointer transition-transform duration-150"
                        transform={`translate(${rev.svgX}, ${rev.svgY})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedRevenda((prev) => (prev?.id === rev.id ? null : rev))
                        }}
                        onMouseEnter={() => setHoveredRevenda(rev)}
                        onMouseLeave={() => setHoveredRevenda(null)}
                      >
                        {/* Anel pulsante sutil para revenda selecionada */}
                        {isRevSelected && (
                          <circle
                            r="14"
                            fill="none"
                            stroke="#0B6E99"
                            strokeWidth="2.5"
                            className="animate-ping opacity-60"
                          />
                        )}

                        {/* Halo externo para contraste e clique */}
                        <circle
                          r={isRevSelected ? 9 : isRevHovered ? 8 : 6.5}
                          fill="#FFFFFF"
                          stroke={isRevSelected ? '#084F6E' : '#0B6E99'}
                          strokeWidth={isRevSelected ? 2.5 : 1.5}
                          className="drop-shadow-sm transition-all"
                        />

                        {/* Ponto central colorido: Azul Roland com vendas, ou Ciano se 0 */}
                        <circle
                          r={isRevSelected ? 5.5 : isRevHovered ? 5 : 3.8}
                          fill={isRevSelected ? '#0B6E99' : hasVendas ? '#0B6E99' : '#14829E'}
                        />

                        {/* Ícone interno micro (ponto branco para destacar) */}
                        <circle r="1.5" fill="#FFFFFF" />

                        {/* Tooltip SVG rápido no hover quando não selecionado */}
                        {isRevHovered && !isRevSelected && (
                          <g transform="translate(0, -18)" className="pointer-events-none">
                            <rect
                              x="-55"
                              y="-18"
                              width="110"
                              height="18"
                              rx="4"
                              fill="#0F172A"
                              fillOpacity="0.92"
                            />
                            <text
                              x="0"
                              y="-7"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#FFFFFF"
                              fontSize="9"
                              fontWeight="700"
                            >
                              {rev.nome} ({rev.uf})
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </g>
              )}
            </svg>
          </div>

          {/* Card Flutuante / Detalhe de Revenda Selecionada ou UF ativa */}
          {selectedRevenda ? (
            <div className="w-full mt-3 p-3.5 bg-gradient-to-r from-cyan-50/90 to-blue-50/70 rounded-lg border border-[#0B6E99]/40 shadow-xs text-xs animate-in fade-in duration-150">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0B6E99] text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {selectedRevenda.nome}
                      </span>
                      <Badge className="bg-[#0B6E99] text-white font-bold text-[10px] px-1.5 py-0 h-4">
                        {selectedRevenda.uf}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="bg-white/80 text-slate-700 text-[10px] px-1.5 py-0 h-4 border border-slate-200"
                      >
                        Revenda Autorizada
                      </Badge>
                    </div>

                    {selectedRevenda.razaoSocialSite &&
                      selectedRevenda.razaoSocialSite !== selectedRevenda.nome && (
                        <div className="text-[11px] text-slate-600 font-medium">
                          {selectedRevenda.razaoSocialSite}
                        </div>
                      )}

                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-0.5">
                      <Navigation className="w-3 h-3 text-[#0B6E99] shrink-0" />
                      <span>
                        {selectedRevenda.cidade} - {selectedRevenda.uf}
                        {selectedRevenda.endereco && ` • ${selectedRevenda.endereco}`}
                      </span>
                    </div>

                    {selectedRevenda.telefone && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{selectedRevenda.telefone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedRevenda(null)}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-colors mb-1"
                    title="Fechar detalhe da revenda"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Faturamento no Filtro
                    </div>
                    <div className="font-extrabold text-[#0B6E99] text-base tabular-nums leading-tight">
                      {formatCurrency(revendasFaturamento?.[selectedRevenda.id]?.faturamento || 0)}
                    </div>
                    {revendasFaturamento?.[selectedRevenda.id]?.documentos ? (
                      <div className="text-[10px] text-slate-500 font-medium">
                        {revendasFaturamento[selectedRevenda.id].documentos} doc(s) •{' '}
                        {revendasFaturamento[selectedRevenda.id].itens} item(ns)
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic font-medium">
                        Sem faturamento no período/filtros ativos
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full mt-3 p-3 bg-white rounded-lg border border-slate-200 shadow-xs flex items-center justify-between text-xs min-h-[50px]">
              {activeUfInfo ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-[#0B6E99] text-white font-bold">{activeUfInfo.uf}</Badge>
                    <div>
                      <div className="font-extrabold text-slate-900 leading-tight">
                        {activeUfInfo.name}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Região {activeUfInfo.region}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-extrabold text-[#0B6E99] text-sm tabular-nums">
                      {formatCurrency(activeUfInfo.total)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      {activeUfInfo.percentual.toFixed(1)}% do faturamento ativo
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-slate-500 text-xs flex items-center justify-between w-full py-0.5">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <Store className="w-3.5 h-3.5 text-[#0B6E99]" />
                    <span>Clique em qualquer pino no mapa para ver o faturamento da revenda.</span>
                  </span>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Passe o mouse na UF para detalhes regionais
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Legenda de Intensidade */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-3 text-[11px] text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#E2E8F0] inline-block border border-slate-300" />
                Sem vendas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0B6E99] inline-block border border-white ring-1 ring-slate-300" />
                Pino de Revenda Oficial
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span>Menor</span>
              <div className="flex h-2.5 w-24 rounded-xs overflow-hidden">
                <span className="flex-1 bg-[#67C1D1]" />
                <span className="flex-1 bg-[#1895A8]" />
                <span className="flex-1 bg-[#14829E]" />
                <span className="flex-1 bg-[#0B6E99]" />
              </div>
              <span>Maior</span>
            </div>
          </div>
        </div>

        {/* Coluna 2: Ranking por Região & Estados */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Layers className="w-4 h-4 text-[#0B6E99]" />
              <span>Ranking por Região &amp; UF</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Total: {formatCurrency(totalGeral)}
            </span>
          </div>

          <div
            className={cn(
              'space-y-3 overflow-y-auto pr-1',
              isExpanded ? 'max-h-[620px]' : 'max-h-[460px]',
            )}
          >
            {regionStats.map((item) => {
              const isRegionOpen = !selectedRegion || selectedRegion === item.regiao
              const estadosComVenda = item.estados.filter((e) => e.total > 0)
              const outrosEstados = item.estados.filter((e) => e.total === 0)

              return (
                <div
                  key={item.regiao}
                  className={cn(
                    'rounded-xl border transition-all overflow-hidden',
                    selectedRegion === item.regiao
                      ? 'border-[#0B6E99] bg-white ring-1 ring-[#0B6E99]/30'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  {/* Cabeçalho da Região */}
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedRegion(selectedRegion === item.regiao ? null : item.regiao)
                    }
                    className="w-full p-3 flex items-center justify-between text-left bg-slate-50/70 hover:bg-slate-100/60 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                        <span>Região {item.regiao}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 h-4 font-bold bg-cyan-100 text-[#084F6E]"
                        >
                          {item.percentual.toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {estadosComVenda.length} de {item.estados.length} estados com vendas
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-extrabold text-slate-900 tabular-nums">
                        {formatCurrency(item.total)}
                      </div>
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 ml-auto text-slate-400 transition-transform duration-200',
                          selectedRegion === item.regiao ? 'rotate-90 text-[#0B6E99]' : '',
                        )}
                      />
                    </div>
                  </button>

                  {/* Barra de progresso da Região */}
                  <div className="w-full bg-slate-100 h-1">
                    <div
                      className="bg-[#0B6E99] h-1 transition-all duration-300"
                      style={{ width: `${Math.min(100, item.percentual)}%` }}
                    />
                  </div>

                  {/* Lista de Estados da Região */}
                  {isRegionOpen && (
                    <div className="p-2 space-y-1 divide-y divide-slate-100 text-xs">
                      {estadosComVenda.map((est) => {
                        const isUfSelected = activeSelectedUf === est.uf
                        const percentReg = item.total > 0 ? (est.total / item.total) * 100 : 0

                        return (
                          <div
                            key={est.uf}
                            onClick={() => handleSelectUf(isUfSelected ? null : est.uf)}
                            onMouseEnter={() => setHoveredUf(est.uf)}
                            onMouseLeave={() => setHoveredUf(null)}
                            className={cn(
                              'pt-1.5 pb-1 px-2 rounded-md flex items-center justify-between cursor-pointer transition-colors',
                              isUfSelected
                                ? 'bg-cyan-50 text-cyan-950 font-bold border border-cyan-200'
                                : 'hover:bg-slate-50 text-slate-700',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'w-6 h-5 rounded flex items-center justify-center text-[10px] font-extrabold',
                                  isUfSelected
                                    ? 'bg-[#0B6E99] text-white'
                                    : 'bg-slate-100 text-slate-800',
                                )}
                              >
                                {est.uf}
                              </span>
                              <span className="truncate max-w-[140px] text-xs font-semibold">
                                {est.name}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="font-extrabold text-slate-900 tabular-nums text-xs">
                                {formatCurrency(est.total)}
                              </span>
                              <span className="text-[10px] text-slate-400 block font-medium">
                                {percentReg.toFixed(1)}% da região
                              </span>
                            </div>
                          </div>
                        )
                      })}

                      {outrosEstados.length > 0 && (
                        <div className="pt-2 px-2 text-[11px] text-slate-400 italic">
                          Sem vendas ativas: {outrosEstados.map((e) => e.uf).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
