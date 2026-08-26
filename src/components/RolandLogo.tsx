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
  showSubtitle = true,
  subtitle = 'Brasil',
}: RolandLogoProps) {
  const isDark = variant === 'dark'
  const textColor = isDark ? '#0F172A' : '#FFFFFF'
  const rolandOrange = '#F47920' // Roland DG brand amber / orange

  return (
    <div className={cn('flex flex-col items-center select-none', className)}>
      <div className="flex items-center gap-2.5">
        {/* Roland DG Brand Geometric Icon / Mark */}
        <svg
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-8 h-8 shrink-0 drop-shadow-xs"
          aria-hidden="true"
        >
          {/* Outer Rounded Shield / Frame in Roland DG Amber */}
          <rect width="40" height="40" rx="8" fill={rolandOrange} />
          {/* Roland DG characteristic abstract printer / dynamic geometric bars */}
          <path d="M9 13H31V16.5H9V13ZM9 18.5H25V22H9V18.5ZM9 24H31V27.5H9V24Z" fill="#FFFFFF" />
          <circle cx="28.5" cy="20.25" r="2.25" fill="#FFFFFF" />
        </svg>

        {/* Roland DG Typography */}
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline tracking-tight font-black font-sans">
            <span
              style={{ color: textColor }}
              className="text-lg font-black tracking-[-0.03em] uppercase"
            >
              Roland
            </span>
            <span
              style={{ color: rolandOrange }}
              className="text-lg font-black ml-1 tracking-tight"
            >
              DG
            </span>
          </div>
          {showSubtitle && (
            <div className="flex items-center justify-between w-full pt-0.5">
              <span
                style={{ color: isDark ? '#64748B' : '#94A3B8' }}
                className="text-[9px] font-bold tracking-[0.22em] uppercase"
              >
                {subtitle}
              </span>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: rolandOrange }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
