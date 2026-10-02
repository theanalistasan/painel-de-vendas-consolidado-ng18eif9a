import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { History, ChevronLeft, ChevronRight, Search, Filter, Loader2 } from 'lucide-react'
import { fetchAuditLogs, type AuditLog, type AuditAction } from '@/services/audit'
import { fetchUsers, type UserRecord } from '@/services/users'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

const PER_PAGE = 15

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Login',
  logout: 'Logout',
  admin_access: 'Acesso Admin',
  import_access: 'Acesso Importar',
  pedidos_abertos_view: 'Acesso Pedidos em Aberto',
  pedidos_abertos_import: 'Importação Pedidos SAP',
  estoque_sap_import: 'Importação Estoque SAP',
}

const ACTION_BADGE: Record<AuditAction, string> = {
  login: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  logout: 'bg-slate-200 text-slate-600 hover:bg-slate-200',
  admin_access: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  import_access: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  pedidos_abertos_view: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  pedidos_abertos_import: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  estoque_sap_import: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
}

export default function Auditoria() {
  const [items, setItems] = useState<AuditLog[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [loading, setLoading] = useState(true)

  const [actionFilter, setActionFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [users, setUsers] = useState<UserRecord[]>([])
  const { toast } = useToast()

  // Carrega lista de usuários para o filtro (uma vez)
  useEffect(() => {
    let active = true
    fetchUsers({ page: 1, perPage: 200 })
      .then((res) => {
        if (active) setUsers(res.items || [])
      })
      .catch((err) => {
        console.warn('Falha ao carregar lista de usuários para filtro de auditoria:', err)
      })
    return () => {
      active = false
    }
  }, [])

  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetchAuditLogs({
        page,
        perPage: PER_PAGE,
        action: actionFilter,
        userId: userFilter,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setItems(res.items || [])
      setTotalPages(res.totalPages || 1)
      setTotalItems(res.totalItems || 0)
    } catch (err) {
      console.error('Erro ao buscar auditoria:', err)
      const errorMsg =
        err instanceof Error && err.message
          ? err.message
          : 'Não foi possível carregar os registros de auditoria.'

      const isAuthError =
        errorMsg.toLowerCase().includes('sessão expirada') ||
        errorMsg.toLowerCase().includes('token de autenticação expirado') ||
        errorMsg.toLowerCase().includes('sessão não autenticada') ||
        errorMsg.toLowerCase().includes('redirecionando para login')

      if (!isAuthError) {
        setLoadError(errorMsg)
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar auditoria',
          description: errorMsg,
        })
      }
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter, userFilter, startDate, endDate, toast])

  useEffect(() => {
    load()
  }, [load])

  const applyFilters = () => {
    setPage(1)
    load()
  }

  const clearFilters = () => {
    setActionFilter('all')
    setUserFilter('all')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  const fmtDateTime = useMemo(
    () => (iso: string) => {
      if (!iso) return '-'
      try {
        return new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date(iso))
      } catch {
        return iso
      }
    },
    [],
  )

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header */}
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-50 text-[#0B6E99]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900">
                Auditoria de Acessos
              </CardTitle>
              <p className="text-xs text-slate-500 font-medium">
                {totalItems} evento(s) registrado(s)
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filtros */}
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Ação</Label>
              <Select
                value={actionFilter}
                onValueChange={(v) => {
                  setActionFilter(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="rounded-lg border-gray-200 focus-visible:ring-[#0B6E99] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                  <SelectItem value="admin_access">Acesso Admin</SelectItem>
                  <SelectItem value="import_access">Acesso Importar</SelectItem>
                  <SelectItem value="pedidos_abertos_view">Acesso Pedidos em Aberto</SelectItem>
                  <SelectItem value="pedidos_abertos_import">Importação Pedidos SAP</SelectItem>
                  <SelectItem value="estoque_sap_import">Importação Estoque SAP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Usuário</Label>
              <Select
                value={userFilter}
                onValueChange={(v) => {
                  setUserFilter(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="rounded-lg border-gray-200 focus-visible:ring-[#0B6E99] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Data início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPage(1)
                }}
                className="rounded-lg border-gray-200 focus-visible:ring-[#0B6E99] text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Data fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPage(1)
                }}
                className="rounded-lg border-gray-200 focus-visible:ring-[#0B6E99] text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={clearFilters}>
              Limpar
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px] bg-[#0B6E99] hover:bg-[#084F6E] text-white font-bold"
              onClick={applyFilters}
            >
              <Filter className="w-3 h-3 mr-1" />
              Aplicar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex flex-col items-center gap-3 text-slate-400">
              <Loader2 className="w-8 h-8 text-[#0B6E99] animate-spin" />
              <p className="text-xs font-medium">Carregando auditoria...</p>
            </div>
          ) : loadError ? (
            <div className="p-10 flex flex-col items-center gap-3 text-slate-500">
              <p className="text-sm font-semibold text-rose-600">{loadError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                className="text-xs font-semibold"
              >
                Tentar novamente
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 flex flex-col items-center gap-2 text-slate-400">
              <Search className="w-8 h-8" />
              <p className="text-xs font-medium">Nenhum evento encontrado com os filtros atuais.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-3 px-4 border-b border-slate-200">Data/Hora</th>
                      <th className="py-3 px-4 border-b border-slate-200">Usuário</th>
                      <th className="py-3 px-4 border-b border-slate-200">E-mail</th>
                      <th className="py-3 px-4 border-b border-slate-200">Ação</th>
                      <th className="py-3 px-4 border-b border-slate-200">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {fmtDateTime(log.created)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {log.user_name || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{log.user_email || '-'}</td>
                        <td className="py-3 px-4">
                          <Badge
                            className={`text-[10px] ${
                              ACTION_BADGE[log.action as AuditAction] ||
                              'bg-slate-100 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {ACTION_LABELS[log.action as AuditAction] || log.action}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{log.details || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {items.map((log) => (
                  <div key={log.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        className={`text-[10px] ${
                          ACTION_BADGE[log.action as AuditAction] ||
                          'bg-slate-100 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {ACTION_LABELS[log.action as AuditAction] || log.action}
                      </Badge>
                      <span className="text-[10px] text-slate-400">{fmtDateTime(log.created)}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{log.user_name || '-'}</p>
                    <p className="text-[11px] text-slate-500">{log.user_email || '-'}</p>
                    {log.details && <p className="text-[11px] text-slate-600">{log.details}</p>}
                  </div>
                ))}
              </div>

              {/* Paginação */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  Página {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Próxima
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
