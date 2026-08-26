import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Table as TableIcon,
  UploadCloud,
  LogOut,
  Menu,
  X,
  Calendar,
  Layers,
  ShieldAlert,
  Users as UsersIcon,
  History,
  Database,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { isAdminUnlocked } from '@/components/AdminGuard'
import RolandLogo from '@/components/RolandLogo'
import { getCountsSummary } from '@/services/sales'
import { formatDateTime } from '@/lib/formatters'
import { useRealtime } from '@/hooks/use-realtime'

export default function Layout() {
  const { user, logout, isLoading } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [ultimaCarga, setUltimaCarga] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Buscar data da última carga para exibir no footer
  const loadStats = async () => {
    try {
      const counts = await getCountsSummary()
      if (counts?.ultimaCarga) {
        setUltimaCarga(counts.ultimaCarga)
      }
    } catch {
      // Silencioso em caso de erro
    }
  }

  useEffect(() => {
    loadStats()
  }, [])

  useRealtime('vendas', () => {
    loadStats()
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F172A] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400 font-medium">Carregando painel...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  const adminUnlocked = isAdminUnlocked()

  const navItems: Array<{
    title: string
    href: string
    icon: typeof LayoutDashboard
    adminOnly?: boolean
  }> = [
    {
      title: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
    },
    {
      title: 'Vendas',
      href: '/vendas',
      icon: TableIcon,
    },
    {
      title: 'Importar Dados',
      href: '/importar',
      icon: UploadCloud,
      adminOnly: true,
    },
    {
      title: 'Administração',
      href: '/admin',
      icon: ShieldAlert,
      adminOnly: true,
    },
    {
      title: 'Usuários',
      href: '/usuarios',
      icon: UsersIcon,
      adminOnly: true,
    },
    {
      title: 'Auditoria',
      href: '/auditoria',
      icon: History,
      adminOnly: true,
    },
  ].filter((item) => !item.adminOnly || adminUnlocked)

  // Page title mapping
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
        return 'Dashboard de Vendas'
      case '/vendas':
        return 'Relatório Consolidado de Vendas'
      case '/importar':
        return 'Importação e Consolidação de Bases'
      case '/admin':
        return 'Administração — Zerar Bases'
      case '/usuarios':
        return 'Gestão de Usuários'
      case '/auditoria':
        return 'Auditoria de Acessos'
      default:
        return 'Painel de Vendas'
    }
  }

  // Current formatted date in pt-BR
  const todayFormatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const formattedDateCapitalized = todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)

  const userInitials = (user.name || user.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('')

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const formattedUltimaCarga = ultimaCarga
    ? formatDateTime(ultimaCarga)
    : 'Aguardando primeira sincronização'

  return (
    <div className="flex min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex flex-col w-[260px] fixed inset-y-0 left-0 z-30 bg-[#0F172A] text-[#94A3B8] border-r border-slate-800/80">
        {/* Top Logo Roland DG + Brand Header */}
        <div className="pt-6 pb-4 px-6 flex flex-col items-center justify-center border-b border-slate-800/80 gap-3 bg-gradient-to-b from-[#141E33] to-[#0F172A]">
          {/* Logo Roland DG proeminente no topo (~180px largura) */}
          <div className="w-[180px] flex items-center justify-center py-1">
            <RolandLogo variant="white" showSubtitle={true} subtitle="Brasil" />
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 w-full justify-center">
            <span className="font-extrabold text-white text-xs tracking-tight uppercase">
              Painel de Vendas
            </span>
            <span className="text-[10px] text-[#0B6E99] font-bold tracking-wide">
              • Consolidado
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <NavLink
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-[#0B6E99] text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-slate-400')} />
                {item.title}
              </NavLink>
            )
          })}
        </nav>

        {/* Integration Status Badge */}
        <div className="px-4 py-3 mx-3 mb-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#0B6E99]/20 text-[#0B6E99]">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex flex-col text-xs">
            <span className="text-slate-200 font-bold">Bases Integradas</span>
            <span className="text-slate-400 text-[11px]">RacNew + NetSales + Prod</span>
          </div>
        </div>

        {/* User Footer Sidebar */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar className="w-8 h-8 border border-slate-700 bg-slate-900 text-[#0B6E99]">
                <AvatarFallback className="text-xs font-extrabold bg-[#0B6E99] text-white">
                  {userInitials || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-white truncate">
                  {user.name || 'Usuário'}
                </span>
                <span className="text-[11px] text-slate-400 truncate">{user.email}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="w-8 h-8 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg shrink-0"
              title="Sair da conta"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative flex flex-col w-[280px] max-w-[85vw] bg-[#0F172A] text-[#94A3B8] shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {/* Top Brand with close button */}
            <div className="p-4 flex flex-col border-b border-slate-800 bg-[#141E33]">
              <div className="flex items-center justify-between mb-2">
                <RolandLogo variant="white" showSubtitle={true} subtitle="Brasil" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="text-[11px] font-bold text-[#0B6E99] uppercase tracking-wider text-center pt-1 border-t border-slate-800/80">
                Painel de Vendas Consolidado
              </div>
            </div>

            {/* Mobile Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.href
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all',
                      isActive
                        ? 'bg-[#0B6E99] text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.title}
                  </NavLink>
                )
              })}
            </nav>

            {/* User Footer Mobile */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="w-8 h-8 bg-[#0B6E99] text-white">
                    <AvatarFallback className="text-xs font-bold">
                      {userInitials || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-bold text-white truncate">
                      {user.name || 'Usuário'}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate">{user.email}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="w-8 h-8 text-slate-400 hover:text-red-400 hover:bg-red-950/30"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen lg:pl-[260px]">
        {/* Header Escuro inspirado na identidade Roland DG Brasil (#0F172A / #141E33) */}
        <header className="sticky top-0 z-20 h-16 bg-[#0F172A] border-b border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white hover:text-[#0B6E99] hover:bg-slate-800 -ml-1"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5 text-white" />
            </Button>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
              {getPageTitle()}
            </h1>
          </div>

          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-300 bg-slate-800/90 px-3.5 py-1.5 rounded-full border border-slate-700 shadow-xs">
            <Calendar className="w-4 h-4 text-[#0B6E99] shrink-0" />
            <span className="hidden sm:inline">{formattedDateCapitalized}</span>
            <span className="sm:hidden">
              {new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
              }).format(new Date())}
            </span>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>

        {/* Footer Escuro inspirado na identidade Roland DG Brasil */}
        <footer className="bg-[#0F172A] text-slate-400 border-t border-slate-800 px-4 sm:px-6 lg:px-8 py-4 text-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-slate-200 font-bold">
                <span className="w-2 h-2 rounded-full bg-[#0B6E99] animate-pulse" />
                Roland DG Brasil
              </span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-300 font-medium">Painel de Vendas Consolidado</span>
            </div>

            <div className="flex items-center gap-2 text-slate-300 font-medium bg-slate-800/80 px-3 py-1 rounded-md border border-slate-700/60">
              <Database className="w-3.5 h-3.5 text-[#0B6E99]" />
              <span>
                Dados consolidados — última carga:{' '}
                <strong className="text-[#0B6E99] font-bold">{formattedUltimaCarga}</strong>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
