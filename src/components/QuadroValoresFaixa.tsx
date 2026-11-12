import React from 'react'
import { Briefcase, Calculator } from 'lucide-react'
import {
  FAIXA_COMERCIAL_LABEL,
  FAIXA_CONTABIL_LABEL,
} from '@/lib/valor-titulos'
import type { SemanaValores } from '@/lib/semanas'

export interface QuadroFaixaColuna {
  titulo: string
  campo: 'valorTotalBruto' | 'valorLiquidoTotal' | 'valorTotalNfSemFrete' | 'valorTotalMercadoria' | 'custoTotal'
}

export interface QuadroValoresFaixaProps {
  faixaLabel: typeof FAIXA_COMERCIAL_LABEL | typeof FAIXA_CONTABIL_LABEL
  semanasCount: number
  colunas: QuadroFaixaColuna[]
  valoresPorSemana: SemanaValores[]
  totais: Record<string, number>
  valorCompacto: (v: number) => string
}

/**
 * Bloco de UMA FAIXA (Visão Comercial / Visão Contábil) do quadro
 * "Valores por Semana" do JP-Class: tabela Semana × indicadores da faixa,
 * com a linha "Total do Mês" (soma das semanas completas).
 */
function QuadroValoresFaixaComponent({
  faixaLabel,
  semanasCount,
  colunas,
  valoresPorSemana,
  totais,
  valorCompacto,
}: QuadroValoresFaixaProps) {
  const isComercial = faixaLabel === FAIXA_COMERCIAL_LABEL
  const IconeFaixa = isComercial ? Briefcase : Calculator
  const corFaixa = isComercial ? 'text-[#0B6E99]' : 'text-emerald-700'
  const bgFaixa = isComercial ? 'bg-sky-50/70' : 'bg-emerald-50/60'
  const badgeFaixa = isComercial
    ? 'bg-sky-100 text-sky-800 border-sky-300'
    : 'bg-emerald-100 text-emerald-800 border-emerald-300'

  return (
    <div>
      {/* Cabeçalho da faixa */}
      <div
        className={`px-4 py-2 flex items-center gap-2 border-b border-slate-100 ${bgFaixa}`}
      >
        <IconeFaixa className={`w-4 h-4 ${corFaixa}`} />
        <span
          className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${badgeFaixa}`}
        >
          {faixaLabel}
        </span>
        <span className="text-[10px] text-slate-500 font-medium">
          {semanasCount} {semanasCount === 1 ? 'semana' : 'semanas'} • valores consolidados
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            {/* Linha superior: métricas da faixa em colunas, na ordem oficial */}
            <tr className="bg-slate-50 text-slate-600">
              <th className="px-4 py-2 text-left font-bold border-b border-slate-200">Semana</th>
              {colunas.map((col) => (
                <th
                  key={col.campo}
                  className="px-4 py-2 text-right font-bold border-b border-slate-200 whitespace-nowrap"
                >
                  {col.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Linha abaixo: Semana 1, 2, 3, 4, 5 (apenas as semanas existentes no mês) */}
            {valoresPorSemana.map((v) => (
              <tr key={v.semana.numero} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-semibold text-slate-700 border-b border-slate-100 whitespace-nowrap">
                  {v.semana.nome}
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                    ({v.semana.inicioFormatado} a {v.semana.fimFormatado})
                  </span>
                </td>
                {colunas.map((col) => (
                  <td
                    key={col.campo}
                    className="px-4 py-2.5 text-right tabular-nums text-slate-900 border-b border-slate-100"
                  >
                    {valorCompacto(Number(v[col.campo]) || 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-bold">
              <td className="px-4 py-2.5 text-slate-800">Total do Mês</td>
              {colunas.map((col) => (
                <td
                  key={col.campo}
                  className="px-4 py-2.5 text-right tabular-nums text-slate-900"
                >
                  {valorCompacto(Number(totais[col.campo]) || 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

export const QuadroValoresFaixa = React.memo(QuadroValoresFaixaComponent)
