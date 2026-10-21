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
  className?: string
  action?: React.ReactNode
  children: React.ReactNode
}

export default function ChartCard({
  title,
  description,
  icon: Icon,
  iconColor,
  className,
  action,
  children,
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Card limpo com borda sutil cinza, expansão e redimensionamento 100% responsivos */}
      <Card
        className={cn(
          'group relative rounded-xl border border-gray-200 bg-white transition-all duration-200 hover:border-slate-300 w-full min-w-0 flex flex-col',
          className,
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              {/* Título do Card de Gráfico com font-extrabold / font-bold */}
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2 tracking-tight">
                {Icon && <Icon className={cn('w-4 h-4', iconColor || 'text-[#0B8A9E]')} />}
                <span className="truncate">{title}</span>
              </CardTitle>
              {description && (
                <CardDescription className="text-xs text-slate-500 font-medium truncate">
                  {description}
                </CardDescription>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {action}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label={`Expandir ${title}`}
                title="Expandir em tela cheia"
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#0B8A9E] hover:bg-cyan-50 transition-colors opacity-70 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#0B8A9E]/40 shrink-0"
              >
                <Expand className="w-4 h-4" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2 flex-1 w-full min-w-0">
          <div className="h-80 w-full min-w-0 flex flex-col">{children}</div>
        </CardContent>
      </Card>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-none w-[95vw] h-[85vh] sm:rounded-2xl border border-gray-200 bg-white p-0 flex flex-col overflow-hidden">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="shrink-0">
                  <Icon className={cn('w-5 h-5', iconColor || 'text-[#0B8A9E]')} />
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
            {action && <div className="flex items-center gap-2 pr-8">{action}</div>}
          </div>
          <div className="flex-1 min-h-0 w-full min-w-0 p-6 flex flex-col overflow-auto">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
