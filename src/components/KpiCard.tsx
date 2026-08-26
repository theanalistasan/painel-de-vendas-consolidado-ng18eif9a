import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Expand } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: number
  prefix?: string
  suffix?: string
  isCurrency?: boolean
  decimals?: number
  icon: React.ComponentType<{ className?: string }>
  iconBgColor: string
  iconColor: string
  deltaPercent?: number
  comparisonText?: string
}

export default function KpiCard({
  title,
  value,
  prefix = '',
  suffix = '',
  isCurrency = false,
  decimals = 0,
  icon: Icon,
  iconBgColor,
  iconColor,
  deltaPercent,
  comparisonText = 'vs período anterior',
}: KpiCardProps) {
  const [displayVal, setDisplayVal] = useState<number>(0)
  const [expanded, setExpanded] = useState(false)

  // Animated Count-Up (600ms ease-out)
  useEffect(() => {
    let startTime: number | null = null
    const duration = 600
    const startVal = displayVal
    const endVal = value

    if (startVal === endVal) return

    let animationFrameId: number

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startVal + (endVal - startVal) * easeOut

      setDisplayVal(current)

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step)
      } else {
        setDisplayVal(endVal)
      }
    }

    animationFrameId = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [value])

  const formattedNumber = (val: number = displayVal) => {
    if (isCurrency) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(val)
    }
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.round(val))
  }

  return (
    <>
      {/* Card limpo com borda sutil cinza, sem sombras pesadas (estilo Roland DG) */}
      <Card className="group relative rounded-xl border border-gray-200 bg-white transition-all duration-200 hover:border-slate-300">
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xs font-bold text-slate-500 tracking-wide uppercase">
            {title}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Expandir ${title}`}
              title="Expandir em tela cheia"
              className="p-1.5 rounded-lg text-slate-300 hover:text-[#F47920] hover:bg-orange-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#F47920]/40"
            >
              <Expand className="w-4 h-4" />
            </button>
            <div className={cn('p-2.5 rounded-xl flex items-center justify-center', iconBgColor)}>
              <Icon className={cn('w-5 h-5', iconColor)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Tipografia Extrabold nos números grandes do KPI */}
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {!isCurrency && prefix}
            {formattedNumber()}
            {!isCurrency && suffix}
          </div>

          {deltaPercent !== undefined && (
            <div className="flex items-center gap-1.5 mt-2 text-xs">
              <span
                className={cn(
                  'font-bold px-1.5 py-0.5 rounded-md flex items-center',
                  deltaPercent >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
                )}
              >
                {deltaPercent >= 0 ? '+' : ''}
                {deltaPercent.toFixed(1)}%
              </span>
              <span className="text-slate-400 font-medium text-[11px]">{comparisonText}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-none w-[95vw] h-[85vh] sm:rounded-2xl border border-gray-200 bg-white p-0 flex flex-col items-center justify-center gap-8 overflow-hidden">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="flex flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="flex items-center gap-3">
              <div className={cn('p-3 rounded-2xl flex items-center justify-center', iconBgColor)}>
                <Icon className={cn('w-7 h-7', iconColor)} />
              </div>
              <span className="text-base sm:text-lg font-bold text-slate-500 tracking-wide uppercase">
                {title}
              </span>
            </div>

            {/* Modal com tipografia extrabold */}
            <div className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-extrabold tracking-tight text-slate-900 tabular-nums break-all leading-tight">
              {!isCurrency && prefix}
              {formattedNumber(value)}
              {!isCurrency && suffix}
            </div>

            {deltaPercent !== undefined && (
              <div className="flex items-center gap-2 text-base sm:text-lg">
                <span
                  className={cn(
                    'font-bold px-2.5 py-1 rounded-lg flex items-center',
                    deltaPercent >= 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-700',
                  )}
                >
                  {deltaPercent >= 0 ? '+' : ''}
                  {deltaPercent.toFixed(1)}%
                </span>
                <span className="text-slate-400 font-medium text-sm sm:text-base">
                  {comparisonText}
                </span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
