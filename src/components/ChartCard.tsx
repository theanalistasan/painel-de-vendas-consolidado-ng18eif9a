import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Expand } from 'lucide-react'

interface ChartCardProps {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  iconColor?: string
  children: React.ReactNode
}

export default function ChartCard({
  title,
  description,
  icon: Icon,
  iconColor,
  children,
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Card limpo com borda sutil cinza, sem sombras pesadas */}
      <Card className="group relative rounded-xl border border-gray-200 bg-white transition-all duration-200 hover:border-slate-300">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              {/* Título do Card de Gráfico com font-extrabold / font-bold */}
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
                {Icon && <Icon className={cn('w-4 h-4', iconColor || 'text-[#F47920]')} />}
                {title}
              </CardTitle>
              {description && (
                <CardDescription className="text-xs text-slate-500 font-medium">
                  {description}
                </CardDescription>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Expandir ${title}`}
              title="Expandir em tela cheia"
              className="p-1.5 rounded-lg text-slate-300 hover:text-[#F47920] hover:bg-orange-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#F47920]/40 shrink-0"
            >
              <Expand className="w-4 h-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-72 w-full">{children}</div>
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-none w-[95vw] h-[85vh] sm:rounded-2xl border border-gray-200 bg-white p-0 flex flex-col overflow-hidden">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="flex items-center gap-3 px-6 pt-6 pb-3 border-b border-slate-100">
            {Icon && (
              <div className="shrink-0">
                <Icon className={cn('w-5 h-5', iconColor || 'text-[#F47920]')} />
              </div>
            )}
            <div>
              <CardTitle className="text-lg font-extrabold text-slate-900 tracking-tight">
                {title}
              </CardTitle>
              {description && (
                <CardDescription className="text-sm text-slate-500 mt-0.5">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 w-full p-6">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}
