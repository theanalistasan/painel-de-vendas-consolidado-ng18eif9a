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
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  LayoutGrid,
  Network,
  ClipboardList,
  AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { isAdminUnlocked } from '@/components/AdminGuard'
import RolandLogo from '@/components/RolandLogo'
import { FloatingAiWidget } from '@/components/FloatingAiWidget'
import { getCountsSummary } from '@/services/sales'
import { formatDateTime } from '@/lib/formatters'
import { useRealtime } from '@/hooks/use-realtime'

export default function Layout() {
  const { user, logout, isLoading } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [ultimaCarga, setUltimaCarga] = useState<string | null>(null)
  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [gestaoOpen, setGestaoOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isPedidosAbertosActive = location.pathname === '/pedidos-abertos'
  const isEstoqueFaltanteActive = location.pathname === '/estoque-faltante'
  const isCanaisPageActive = location.pathname === '/canais'
  const isFiltrosGlobaisActive = location.pathname === '/dashboard/filtros'

  const isDashboardActive =
    location.pathname === '/' ||
    location.pathname === '/dashboard/geral' ||
    location.pathname === '/dashboard/canais' ||
    location.pathname === '/dashboard/filtros' ||
    location.pathname === '/vendas'

  const isJpClassActive = location.pathname === '/jp-class'

  const isGeralActive =
    location.pathname === '/' ||
    location.pathname === '/dashboard/geral' ||
    location.pathname === '/vendas'
  const isDashboardCanaisActive = location.pathname === '/dashboard/canais'

  const isGestaoActive =
    location.pathname === '/importar' ||
    location.pathname === '/admin' ||
    location.pathname === '/usuarios' ||
    location.pathname === '/auditoria'

  const isImportarActive = location.pathname === '/importar'
  const isAdminActive = location.pathname === '/admin'
  const isUsuariosActive = location.pathname === '/usuarios'
  const isAuditoriaActive = location.pathname === '/auditoria'

  // Garantir que se a rota atual for dashboard, o submenu fica expandido
  useEffect(() => {
    if (isDashboardActive) {
      setDashboardOpen(true)
    }
  }, [isDashboardActive])

  // Garantir que se a rota atual for do módulo Gestão, o submenu fica expandido
  useEffect(() => {
    if (isGestaoActive) {
      setGestaoOpen(true)
    }
  }, [isGestaoActive])

  const toggleDesktopSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar_collapsed', String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

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
    try {
      const fullPath = location.pathname + location.search
      sessionStorage.setItem('redirect_after_login', fullPath)
    } catch {
      // ignore
    }
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  const isUserAdmin = user?.role === 'admin'

  const gestaoItems = [
    {
      title: 'Importar Dados',
      href: '/importar',
      icon: UploadCloud,
      isActive: isImportarActive,
    },
    {
      title: 'Administração',
      href: '/admin',
      icon: ShieldAlert,
      isActive: isAdminActive,
    },
    {
      title: 'Usuários',
      href: '/usuarios',
      icon: UsersIcon,
      isActive: isUsuariosActive,
    },
    {
      title: 'Auditoria',
      href: '/auditoria',
      icon: History,
      isActive: isAuditoriaActive,
    },
  ]

  // Page title mapping
  const getPageTitle = () => {
    switch (location.pathname) {
      case '/':
      case '/dashboard/geral':
        return 'Dashboard — Visão Geral'
      case '/dashboard/canais':
        return 'Dashboard — Visão Canais'
      case '/jp-class':
        return 'JP-Class — Vendas por Semanas'
      case '/vendas':
        return 'Relatório Consolidado de Vendas'
      case '/pedidos-abertos':
        return 'Relatório de Pedidos em Aberto (SAP)'
      case '/estoque-faltante':
        return 'Estoque Faltante & MRP (SAP)'
      case '/canais':
        return 'Manutenção de Canais'
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
      <aside
        className={cn(
          'hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-[#0F172A] text-[#94A3B8] border-r border-slate-800/80 transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-[72px]' : 'w-[260px]',
        )}
      >
        {/* Top Logo Roland + Brand Header */}
        <div
          className={cn(
            'flex flex-col items-center justify-center border-b border-slate-800/80 bg-gradient-to-b from-[#141E33] to-[#0F172A] transition-all',
            sidebarCollapsed ? 'pt-5 pb-4 px-2 gap-2' : 'pt-6 pb-4 px-6 gap-3',
          )}
        >
          {/* Logo Roland proeminente no topo */}
          <div className="flex items-center justify-center py-1">
            {sidebarCollapsed ? (
              <span
                className="font-black text-[#0B6E99] text-xl tracking-tighter"
                title="Roland DG"
              >
                R
              </span>
            ) : (
              <RolandLogo variant="white" showSubtitle={false} />
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 w-full justify-center">
              <span className="font-extrabold text-white text-xs tracking-tight uppercase">
                Painel de Vendas
              </span>
              <span className="text-[10px] text-[#0B6E99] font-bold tracking-wide">
                • Consolidado
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          {/* Item Dashboard com Submenu (Visão Geral & Visão Canais) */}
          <div className="space-y-1">
            {sidebarCollapsed ? (
              // No modo colapsado, link direto para Visão Geral com tooltip
              <NavLink
                to="/dashboard/geral"
                title="Dashboard (Visão Geral & Visão Canais)"
                className={cn(
                  'flex items-center justify-center w-10 h-10 mx-auto rounded-full text-sm font-medium transition-all duration-200',
                  isDashboardActive
                    ? 'bg-[#0B6E99] text-white shadow-sm font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
                )}
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
              </NavLink>
            ) : (
              // No modo expandido, cabeçalho expansível do Dashboard
              <div>
                <button
                  type="button"
                  onClick={() => setDashboardOpen((prev) => !prev)}
                  className={cn(
                    'w-full flex items-center justify-between rounded-full text-sm font-medium transition-all duration-200 px-3.5 py-2.5',
                    isDashboardActive
                      ? 'bg-slate-800/90 text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <LayoutDashboard
                      className={cn(
                        'w-4 h-4 shrink-0',
                        isDashboardActive ? 'text-[#0B6E99]' : 'text-slate-400',
                      )}
                    />
                    <span className="truncate">Dashboard</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 transition-transform duration-200 text-slate-400',
                      dashboardOpen ? 'rotate-180' : '',
                    )}
                  />
                </button>

                {/* Submenu de Visões */}
                {dashboardOpen && (
                  <div className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-1">
                    {/* Filtros Globais (primeiro item, acima de Visão Geral) */}
                    <NavLink
                      to="/dashboard/filtros"
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-150',
                        isFiltrosGlobaisActive
                          ? 'bg-[#0B6E99] text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                      )}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Filtros Globais</span>
                    </NavLink>

                    <NavLink
                      to="/dashboard/geral"
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-150',
                        isGeralActive
                          ? 'bg-[#0B6E99] text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                      )}
                    >
                      <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Visão Geral</span>
                    </NavLink>

                    <NavLink
                      to="/dashboard/canais"
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-150',
                        isDashboardCanaisActive
                          ? 'bg-[#0B6E99] text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                      )}
                    >
                      <Network className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Visão Canais</span>
                    </NavLink>

                    {/* Manutenção de Canais (ex-item "Canais" do extinto grupo Canais) */}
                    <NavLink
                      to="/canais"
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-150',
                        isCanaisPageActive
                          ? 'bg-[#0B6E99] text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                      )}
                    >
                      <Network className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Manutenção de Canais</span>
                    </NavLink>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Item JP-Class posicionado abaixo de Dashboard */}
          <div className="space-y-1">
            <NavLink
              to="/jp-class"
              title={sidebarCollapsed ? 'JP-Class' : undefined}
              className={cn(
                'flex items-center rounded-full text-sm font-medium transition-all duration-200',
                sidebarCollapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'gap-3 px-3.5 py-2.5',
                isJpClassActive
                  ? 'bg-[#0B6E99] text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
              )}
            >
              <Layers
                className={cn(
                  'w-4 h-4 shrink-0',
                  isJpClassActive ? 'text-white' : 'text-slate-400',
                )}
              />
              {!sidebarCollapsed && <span className="truncate">JP-Class</span>}
            </NavLink>
          </div>

          {/* Pedidos em Aberto e Estoque Faltante: itens de 1º nível logo abaixo de JP-Class */}
          <div className="space-y-1">
            <NavLink
              to="/pedidos-abertos"
              title={sidebarCollapsed ? 'Pedidos em Aberto' : undefined}
              className={cn(
                'flex items-center rounded-full text-sm font-medium transition-all duration-200',
                sidebarCollapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'gap-3 px-3.5 py-2.5',
                isPedidosAbertosActive
                  ? 'bg-[#0B6E99] text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
              )}
            >
              <ClipboardList
                className={cn(
                  'w-4 h-4 shrink-0',
                  isPedidosAbertosActive ? 'text-white' : 'text-slate-400',
                )}
              />
              {!sidebarCollapsed && <span className="truncate">Pedidos em Aberto</span>}
            </NavLink>
          </div>
          <div className="space-y-1">
            <NavLink
              to="/estoque-faltante"
              title={sidebarCollapsed ? 'Estoque Faltante' : undefined}
              className={cn(
                'flex items-center rounded-full text-sm font-medium transition-all duration-200',
                sidebarCollapsed ? 'justify-center w-10 h-10 mx-auto px-0' : 'gap-3 px-3.5 py-2.5',
                isEstoqueFaltanteActive
                  ? 'bg-[#0B6E99] text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-4 h-4 shrink-0',
                  isEstoqueFaltanteActive ? 'text-white' : 'text-slate-400',
                )}
              />
              {!sidebarCollapsed && <span className="truncate">Estoque Faltante</span>}
            </NavLink>
          </div>

          {/* Módulo Gestão: Agrupa Importar Dados, Administração, Usuários e Auditoria (apenas Administrador) */}
          {isUserAdmin && (
            <div className="space-y-1 pt-1 border-t border-slate-800/60 mt-2">
              {sidebarCollapsed ? (
                // No modo colapsado, link para a primeira tela de gestão com tooltip indicando o módulo
                <NavLink
                  to="/importar"
                  title="Gestão (Importar, Administração, Usuários, Auditoria)"
                  className={cn(
                    'flex items-center justify-center w-10 h-10 mx-auto rounded-full text-sm font-medium transition-all duration-200',
                    isGestaoActive
                      ? 'bg-[#0B6E99] text-white shadow-sm font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
                  )}
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                </NavLink>
              ) : (
                // No modo expandido, cabeçalho expansível do módulo Gestão
                <div>
                  <button
                    type="button"
                    onClick={() => setGestaoOpen((prev) => !prev)}
                    className={cn(
                      'w-full flex items-center justify-between rounded-full text-sm font-medium transition-all duration-200 px-3.5 py-2.5',
                      isGestaoActive
                        ? 'bg-slate-800/90 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert
                        className={cn(
                          'w-4 h-4 shrink-0',
                          isGestaoActive ? 'text-[#0B6E99]' : 'text-slate-400',
                        )}
                      />
                      <span className="truncate">Gestão</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform duration-200 text-slate-400',
                        gestaoOpen ? 'rotate-180' : '',
                      )}
                    />
                  </button>

                  {/* Submenu de Gestão */}
                  {gestaoOpen && (
                    <div className="mt-1 ml-4 pl-3 border-l border-slate-800 space-y-1">
                      {gestaoItems.map((item) => {
                        const Icon = item.icon
                        return (
                          <NavLink
                            key={item.href}
                            to={item.href}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all duration-150',
                              item.isActive
                                ? 'bg-[#0B6E99] text-white font-bold shadow-xs'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/60',
                            )}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Integration Status Badge */}
        {!sidebarCollapsed ? (
          <div className="px-4 py-3 mx-3 mb-3 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#0B6E99]/20 text-[#0B6E99] shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="flex flex-col text-xs min-w-0">
              <span className="text-slate-200 font-bold truncate">Bases Integradas</span>
              <span className="text-slate-400 text-[11px] truncate">RacNew + NetSales + Prod</span>
            </div>
          </div>
        ) : (
          <div
            className="flex justify-center mb-3"
            title="Bases Integradas: RacNew + NetSales + Prod"
          >
            <div className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/50 text-[#0B6E99]">
              <Layers className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* User Footer Sidebar */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60">
          <div
            className={cn(
              'flex items-center rounded-lg hover:bg-slate-800/50 transition-colors',
              sidebarCollapsed ? 'justify-center p-1' : 'justify-between gap-2 p-2',
            )}
          >
            <div
              className="flex items-center gap-2.5 min-w-0"
              title={sidebarCollapsed ? `${user.name || 'Usuário'} (${user.email})` : undefined}
            >
              <Avatar className="w-8 h-8 border border-slate-700 bg-slate-900 text-[#0B6E99] shrink-0">
                <AvatarFallback className="text-xs font-extrabold bg-[#0B6E99] text-white">
                  {userInitials || 'U'}
                </AvatarFallback>
              </Avatar>
              {!sidebarCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-white truncate">
                    {user.name || 'Usuário'}
                  </span>
                  <span className="text-[11px] text-slate-400 truncate">{user.email}</span>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="w-8 h-8 text-slate-400 hover:text-red-400 hover:bg-red-950/30 rounded-lg shrink-0"
                title="Sair da conta"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
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
                <RolandLogo variant="white" showSubtitle={false} />
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
              {/* Dashboard Mobile com Submenu */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setDashboardOpen((prev) => !prev)}
                  className={cn(
                    'w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm font-medium transition-all',
                    isDashboardActive
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <LayoutDashboard
                      className={cn(
                        'w-4 h-4',
                        isDashboardActive ? 'text-[#0B6E99]' : 'text-slate-400',
                      )}
                    />
                    <span>Dashboard</span>
                  </div>
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 transition-transform duration-200 text-slate-400',
                      dashboardOpen ? 'rotate-180' : '',
                    )}
                  />
                </button>

                {dashboardOpen && (
                  <div className="ml-4 pl-3 border-l border-slate-800 space-y-1">
                    {/* Filtros Globais (primeiro item, acima de Visão Geral) */}
                    <NavLink
                      to="/dashboard/filtros"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                        isFiltrosGlobaisActive
                          ? 'bg-[#0B6E99] text-white font-bold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800',
                      )}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                      <span>Filtros Globais</span>
                    </NavLink>

                    <NavLink
                      to="/dashboard/geral"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                        isGeralActive
                          ? 'bg-[#0B6E99] text-white font-bold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800',
                      )}
                    >
                      <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                      <span>Visão Geral</span>
                    </NavLink>

                    <NavLink
                      to="/dashboard/canais"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                        isDashboardCanaisActive
                          ? 'bg-[#0B6E99] text-white font-bold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800',
                      )}
                    >
                      <Network className="w-3.5 h-3.5 shrink-0" />
                      <span>Visão Canais</span>
                    </NavLink>

                    {/* Manutenção de Canais (ex-item "Canais" do extinto grupo Canais) */}
                    <NavLink
                      to="/canais"
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                        isCanaisPageActive
                          ? 'bg-[#0B6E99] text-white font-bold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800',
                      )}
                    >
                      <Network className="w-3.5 h-3.5 shrink-0" />
                      <span>Manutenção de Canais</span>
                    </NavLink>
                  </div>
                )}
              </div>

              {/* Item JP-Class Mobile posicionado abaixo de Dashboard */}
              <div className="space-y-1">
                <NavLink
                  to="/jp-class"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all',
                    isJpClassActive
                      ? 'bg-[#0B6E99] text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                  )}
                >
                  <Layers className="w-4 h-4" />
                  <span>JP-Class</span>
                </NavLink>
              </div>

              {/* Pedidos em Aberto e Estoque Faltante: itens de 1º nível logo abaixo de JP-Class */}
              <div className="space-y-1">
                <NavLink
                  to="/pedidos-abertos"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all',
                    isPedidosAbertosActive
                      ? 'bg-[#0B6E99] text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                  )}
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Pedidos em Aberto</span>
                </NavLink>
              </div>
              <div className="space-y-1">
                <NavLink
                  to="/estoque-faltante"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-full text-sm font-medium transition-all',
                    isEstoqueFaltanteActive
                      ? 'bg-[#0B6E99] text-white font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                  )}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Estoque Faltante</span>
                </NavLink>
              </div>

              {/* Módulo Gestão Mobile: Importar, Admin, Usuários e Auditoria (apenas Administrador) */}
              {isUserAdmin && (
                <div className="space-y-1 pt-1 border-t border-slate-800/60 mt-2">
                  <button
                    type="button"
                    onClick={() => setGestaoOpen((prev) => !prev)}
                    className={cn(
                      'w-full flex items-center justify-between px-3.5 py-2.5 rounded-full text-sm font-medium transition-all',
                      isGestaoActive
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert
                        className={cn(
                          'w-4 h-4',
                          isGestaoActive ? 'text-[#0B6E99]' : 'text-slate-400',
                        )}
                      />
                      <span>Gestão</span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-4 h-4 transition-transform duration-200 text-slate-400',
                        gestaoOpen ? 'rotate-180' : '',
                      )}
                    />
                  </button>

                  {gestaoOpen && (
                    <div className="ml-4 pl-3 border-l border-slate-800 space-y-1">
                      {gestaoItems.map((item) => {
                        const Icon = item.icon
                        return (
                          <NavLink
                            key={item.href}
                            to={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2 rounded-full text-xs font-medium transition-all',
                              item.isActive
                                ? 'bg-[#0B6E99] text-white font-bold'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800',
                            )}
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.title}</span>
                          </NavLink>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
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
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen min-w-0 max-w-full transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]',
        )}
      >
        {/* Header Escuro inspirado na identidade Roland DG Brasil (#0F172A / #141E33) */}
        <header className="sticky top-0 z-20 h-16 bg-[#0F172A] border-b border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            {/* Botão Mobile para abrir o menu lateral */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white hover:text-[#0B6E99] hover:bg-slate-800 -ml-1"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
              title="Abrir menu"
            >
              <Menu className="w-5 h-5 text-white" />
            </Button>

            {/* Botão Desktop de Colapsar / Expandir Sidebar no lado esquerdo do Header */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDesktopSidebar}
              className="hidden lg:inline-flex text-slate-300 hover:text-white hover:bg-slate-800 -ml-2 h-9 w-9 rounded-lg"
              aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              title={sidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="w-5 h-5 text-[#0B6E99]" />
              ) : (
                <PanelLeftClose className="w-5 h-5 text-slate-400" />
              )}
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
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 max-w-full overflow-x-hidden">
          <Outlet />
        </main>

        {/* Assistente Inteligente IA Flutuante */}
        <FloatingAiWidget />

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
