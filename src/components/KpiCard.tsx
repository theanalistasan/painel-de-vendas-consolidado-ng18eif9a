import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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

  const formattedNumber = () => {
    if (isCurrency) {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(displayVal)
    }
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.round(displayVal))
  }

  return (
    <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
          {title}
        </CardTitle>
        <div className={cn('p-2.5 rounded-xl flex items-center justify-center', iconBgColor)}>
          <Icon className={cn('w-5 h-5', iconColor)} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
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
  )
}
