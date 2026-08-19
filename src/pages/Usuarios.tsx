import React, { useEffect, useState, useCallback } from 'react'
import {
  Users as UsersIcon,
  UserPlus,
  Pencil,
  Trash2,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react'
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  buildInviteLink,
  type UserRecord,
  type UserRole,
} from '@/services/users'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const PER_PAGE = 10

interface FormState {
  name: string
  email: string
  password: string
  confirmPassword: string
  role: UserRole
  active: boolean
}

const emptyForm: FormState = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'user',
  active: true,
}

export default function Usuarios() {
  const [items, setItems] = useState<UserRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UserRecord | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [inviteTarget, setInviteTarget] = useState<UserRecord | null>(null)

  const { toast } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchUsers({ page, perPage: PER_PAGE, search: search.trim() || undefined })
      setItems(res.items)
      setTotalPages(res.totalPages || 1)
      setTotalItems(res.totalItems)
    } catch (err) {
      console.error('Erro ao buscar usuários:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar usuários',
        description: 'Não foi possível obter a lista de usuários.',
      })
    } finally {
      setLoading(false)
    }
  }, [page, search, toast])

  useEffect(() => {
    load()
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (u: UserRecord) => {
    setEditing(u)
    setForm({
      name: u.name || '',
      email: u.email || '',
      password: '',
      confirmPassword: '',
      role: (u.role as UserRole) || 'user',
      active: u.active !== false,
    })
    setModalOpen(true)
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return 'O nome é obrigatório.'
    if (!form.email.trim()) return 'O e-mail é obrigatório.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'E-mail inválido.'
    if (!editing) {
      if (!form.password) return 'A senha é obrigatória.'
      if (form.password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.'
      if (form.password !== form.confirmPassword) return 'As senhas não conferem.'
    } else if (form.password) {
      if (form.password.length < 8) return 'A senha deve ter no mínimo 8 caracteres.'
      if (form.password !== form.confirmPassword) return 'As senhas não conferem.'
    }
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) {
      toast({ variant: 'destructive', title: 'Validação', description: err })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await updateUser(editing.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          active: form.active,
          password: form.password || undefined,
        })
        toast({ title: 'Usuário atualizado', description: form.name })
      } else {
        await createUser({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          active: form.active,
        })
        toast({ title: 'Usuário criado', description: form.name })
      }
      setModalOpen(false)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar usuário.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteUser(deleteTarget.id)
      toast({ title: 'Usuário excluído', description: deleteTarget.name || deleteTarget.email })
      setDeleteTarget(null)
      await load()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao excluir usuário.'
      toast({ variant: 'destructive', title: 'Erro', description: msg })
    } finally {
      setDeleting(false)
    }
  }

  const copyInvite = async (u: UserRecord) => {
    const link = buildInviteLink(u.email)
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: 'Link copiado!', description: link })
    } catch {
      // fallback: exibe no modal
      setInviteTarget(u)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Header */}
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                <UsersIcon className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Gestão de Usuários
                </CardTitle>
                <p className="text-xs text-slate-500">{totalItems} usuário(s) cadastrado(s)</p>
              </div>
            </div>
            <Button
              onClick={openCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              <UserPlus className="w-4 h-4 mr-1.5" />
              Novo Usuário
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por nome ou e-mail..."
              className="pl-9 rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela (desktop) / cards (mobile) */}
      <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 flex flex-col items-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Carregando usuários...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 flex flex-col items-center gap-2 text-slate-400">
              <UsersIcon className="w-8 h-8" />
              <p className="text-xs font-medium">Nenhum usuário encontrado.</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold">
                    <tr>
                      <th className="py-3 px-4 border-b border-slate-200">Nome</th>
                      <th className="py-3 px-4 border-b border-slate-200">Login (e-mail)</th>
                      <th className="py-3 px-4 border-b border-slate-200">Perfil</th>
                      <th className="py-3 px-4 border-b border-slate-200">Status</th>
                      <th className="py-3 px-4 border-b border-slate-200">Criação</th>
                      <th className="py-3 px-4 border-b border-slate-200 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {(u.name || u.email || 'U')
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((s) => s[0].toUpperCase())
                                .join('')}
                            </div>
                            <span className="font-semibold text-slate-800">{u.name || '-'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{u.email}</td>
                        <td className="py-3 px-4">
                          {u.role === 'admin' ? (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px]">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Administrador
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 text-[10px]">
                              <UserCircle2 className="w-3 h-3 mr-1" />
                              Usuário
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {u.active !== false ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 text-[10px]">
                              Inativo
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {u.created
                            ? new Intl.DateTimeFormat('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              }).format(new Date(u.created))
                            : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                              onClick={() => copyInvite(u)}
                              title="Enviar convite"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                              onClick={() => openEdit(u)}
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                              onClick={() => setDeleteTarget(u)}
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {items.map((u) => (
                  <div key={u.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {(u.name || u.email || 'U')
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((s) => s[0].toUpperCase())
                            .join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {u.name || '-'}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">{u.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {u.role === 'admin' ? (
                        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px]">
                          Administrador
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 text-[10px]">
                          Usuário
                        </Badge>
                      )}
                      {u.active !== false ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => copyInvite(u)}
                      >
                        <Mail className="w-3 h-3 mr-1" />
                        Convite
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => openEdit(u)}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] text-rose-600 hover:bg-rose-50"
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Excluir
                      </Button>
                    </div>
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

      {/* Modal Criar/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editing ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editing
                ? 'Altere os dados do usuário. Deixe a senha em branco para manter a atual.'
                : 'Preencha os dados para criar um novo usuário.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Nome completo</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome do usuário"
                className="rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">E-mail (login)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@empresa.com.br"
                className="rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  {editing ? 'Nova senha (opcional)' : 'Senha'}
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className="rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Confirmar senha</Label>
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  placeholder="••••••••"
                  className="rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Perfil</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
                >
                  <SelectTrigger className="rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="user">Usuário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Status</Label>
                <Select
                  value={form.active ? 'true' : 'false'}
                  onValueChange={(v) => setForm((f) => ({ ...f, active: v === 'true' }))}
                >
                  <SelectTrigger className="rounded-lg border-slate-200 focus-visible:ring-indigo-500 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Convite */}
      <Dialog open={!!inviteTarget} onOpenChange={(o) => !o && setInviteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Link de convite
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Compartilhe este link com {inviteTarget?.name || inviteTarget?.email}. Ele apenas
              preenche o e-mail na tela de login — não é um token mágico.
            </DialogDescription>
          </DialogHeader>
          {inviteTarget && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-600 break-all font-mono flex-1">
                  {buildInviteLink(inviteTarget.email)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    if (inviteTarget) {
                      navigator.clipboard.writeText(buildInviteLink(inviteTarget.email)).then(() =>
                        toast({
                          title: 'Link copiado!',
                          description: 'Link na área de transferência.',
                        }),
                      )
                    }
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteTarget(null)} className="text-xs">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Excluir usuário
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Tem certeza que deseja excluir{' '}
              <strong className="text-slate-800">
                {deleteTarget?.name || deleteTarget?.email}
              </strong>
              ? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className={cn('bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold')}
            >
              {deleting ? 'Excluindo...' : 'Sim, excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
