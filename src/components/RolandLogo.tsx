import React from 'react'
import { cn } from '@/lib/utils'

interface RolandLogoProps {
  className?: string
  variant?: 'white' | 'dark' | 'color'
  showSubtitle?: boolean
  subtitle?: string
}

export default function RolandLogo({
  className,
  variant = 'white',
  showSubtitle = false,
  subtitle = 'Brasil',
}: RolandLogoProps) {
  // Cores de acordo com a nova identidade visual Roland:
  // - Ícone: Retângulo superior azul (#0059C1), retângulo inferior cinza (#2D3748 em fundos claros, #94A3B8 em fundos escuros)
  // - Tipografia: "Roland" (sem "DG"), em preto/cinza escuro (#0F172A / #1E293B) para dark e branco (#FFFFFF) para white/color
  const isDarkVariant = variant === 'dark'
  const brandBlue = '#0059C1'
  const bottomBarColor = isDarkVariant ? '#2D3748' : '#94A3B8'
  const textColor = isDarkVariant ? '#1E293B' : '#FFFFFF'
  const subtitleColor = isDarkVariant ? '#64748B' : '#94A3B8'

  return (
    <div className={cn('inline-flex flex-col items-center select-none', className)}>
      <div className="flex items-center gap-2.5">
        {/* Bloco Gráfico Roland (Retângulo azul superior + Retângulo cinza inferior) */}
        <svg
          viewBox="0 0 54 26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-auto shrink-0"
          aria-hidden="true"
        >
          {/* Barra superior azul */}
          <rect x="0" y="0" width="54" height="17" fill={brandBlue} rx="0.5" />
          {/* Barra inferior cinza */}
          <rect x="0" y="20" width="54" height="6" fill={bottomBarColor} rx="0.5" />
        </svg>

        {/* Tipografia Roland */}
        <div className="flex flex-col leading-none">
          <span
            style={{ color: textColor }}
            className="text-2xl font-bold tracking-tight font-sans"
          >
            Roland
          </span>
          {showSubtitle && subtitle && (
            <span
              style={{ color: subtitleColor }}
              className="text-[9px] font-semibold tracking-[0.2em] uppercase mt-0.5"
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
