import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  Network,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RefreshCw,
  Building2,
  Users,
  Briefcase,
  Layers,
  CheckCircle2,
  XCircle,
  Phone,
  Mail,
  User,
  Filter,
} from 'lucide-react'
import {
  fetchCanaisClientes,
  fetchCanaisIndicadores,
  createCanalCliente,
  updateCanalCliente,
  deleteCanalCliente,
  type CanaisIndicadores,
  type CanalClientePayload,
} from '@/services/canais'
import type { CanalCliente } from '@/types/sales'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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

const PER_PAGE = 20

const DEPLOY_OPTIONS = ['AGIS', 'Roland', 'Nenhum'] as const

interface FormState {
  eh_canal: boolean
  deploy: string
  nome_canal: string
  nome_cliente: string
  status: string
  serie: string
  codigo_cliente: string
  contato: string
  cargo: string
  email: string
  telefone: string
  segmento: string
  inside: string
}

const emptyForm: FormState = {
  eh_canal: true,
  deploy: 'AGIS',
  nome_canal: '',
  nome_cliente: '',
  status: 'Ativo',
  serie: 'Manual',
  codigo_cliente: '',
  contato: '',
  cargo: '',
  email: '',
  telefone: '',
  segmento: 'DIGITAL PRINTING (DP)',
  inside: '',
}

export default function Canais() {
  const { toast } = useToast()

  // Estados dos Indicadores
  const [indicadores, setIndicadores] = useState<CanaisIndicadores | null>(null)
  const [loadingIndicadores, setLoadingIndicadores] = useState(true)

  // Estados do CRUD / Tabela
  const [items, setItems] = useState<CanalCliente[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [loadingList, setLoadingList] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Filtros rápidos
  const [search, setSearch] = useState('')
  const [canalFilter, setCanalFilter] = useState('__all')
  const [deployFilter, setDeployFilter] = useState('__all')
  const [insideFilter, setInsideFilter] = useState('__all')
  const [ehCanalFilter, setEhCanalFilter] = useState('all')

  // Modais de Criação/Edição e Exclusão
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CanalCliente | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<CanalCliente | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Lista única de nomes de canais e insides para os selects rápidos
  const uniqueCanaisList = useMemo(() => {
    if (!indicadores?.porNomeCanal) return []
    return indicadores.porNomeCanal.map((c) => c.nome).sort((a, b) => a.localeCompare(b))
  }, [indicadores])

  const uniqueInsideList = useMemo(() => {
    if (!indicadores?.porInside) return []
    return indicadores.porInside
      .map((i) => i.inside)
      .filter((i) => i && i !== 'SEM INSIDE')
      .sort()
  }, [indicadores])

  // Carrega Indicadores
  const loadIndicadores = useCallback(async () => {
    try {
      setLoadingIndicadores(true)
      const data = await fetchCanaisIndicadores()
      setIndicadores(data)
    } catch (err) {
      console.error('Erro ao carregar indicadores de canais:', err)
      toast({
        variant: 'destructive',
        title: 'Erro nos Indicadores',
        description: 'Não foi possível carregar os indicadores consolidados dos canais.',
      })
    } finally {
      setLoadingIndicadores(false)
    }
  }, [toast])

  // Carrega Lista de Canais
  const loadList = useCallback(async () => {
    try {
      setLoadingList(true)
      setLoadError(null)
      const res = await fetchCanaisClientes({
        page,
        perPage: PER_PAGE,
        search: search.trim() || undefined,
        canal: canalFilter,
        deploy: deployFilter,
        inside: insideFilter,
        ehCanal: ehCanalFilter,
      })
      setItems(res.items || [])
      setTotalPages(res.totalPages || 1)
      setTotalItems(res.totalItems || 0)
    } catch (err) {
      console.error('Erro ao buscar canais_clientes:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao carregar lista de canais.'
      setLoadError(msg)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar registros',
        description: msg,
      })
    } finally {
      setLoadingList(false)
    }
  }, [page, search, canalFilter, deployFilter, insideFilter, ehCanalFilter, toast])

  useEffect(() => {
    loadIndicadores()
  }, [loadIndicadores])

  useEffect(() => {
    loadList()
  }, [loadList])

  // Reset page when filters change
  const handleFilterChange = (setter: (val: string) => void, val: string) => {
    setter(val)
    setPage(1)
  }

  const handleClearFilters = () => {
    setSearch('')
    setCanalFilter('__all')
    setDeployFilter('__all')
    setInsideFilter('__all')
    setEhCanalFilter('all')
    setPage(1)
  }

  // Abertura do modal de criação
  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setSaveError(null)
    setModalOpen(true)
  }

  // Abertura do modal de edição
  const openEdit = (item: CanalCliente) => {
    setEditing(item)
    // Normaliza o deploy para o select
    let d = item.deploy || 'Nenhum'
    if (d.toUpperCase().includes('AGIS')) d = 'AGIS'
    else if (d.toUpperCase().includes('ROLAND')) d = 'Roland'

    setForm({
      eh_canal: item.eh_canal ?? true,
      deploy: d,
      nome_canal: item.nome_canal || '',
      nome_cliente: item.nome_cliente || '',
      status: item.status || 'Ativo',
      serie: item.serie || 'Manual',
      codigo_cliente: item.codigo_cliente || '',
      contato: item.contato || '',
      cargo: item.cargo || '',
      email: item.email || '',
      telefone: item.telefone || '',
      segmento: item.segmento || 'DIGITAL PRINTING (DP)',
      inside: item.inside || '',
    })
    setSaveError(null)
    setModalOpen(true)
  }

  // Validação do formulário
  const validateForm = (): string | null => {
    if (!form.codigo_cliente.trim()) {
      return 'O Código do Cliente (COD) é obrigatório para junção com vendas.'
    }
    if (!form.nome_canal.trim()) {
      return 'O Nome do Canal é obrigatório.'
    }
    if (!form.nome_cliente.trim()) {
      return 'O Nome do Cliente/Razão Social é obrigatório.'
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'E-mail em formato inválido.'
    }
    return null
  }

  // Salvar (Criar ou Atualizar)
  const handleSave = async () => {
    const error = validateForm()
    if (error) {
      setSaveError(error)
      toast({ variant: 'destructive', title: 'Validação', description: error })
      return
    }

    setSaving(true)
    setSaveError(null)

    const payload: CanalClientePayload = {
      eh_canal: form.eh_canal,
      deploy: form.deploy,
      nome_canal: form.nome_canal.trim(),
      nome_cliente: form.nome_cliente.trim(),
      status: form.status.trim() || 'Ativo',
      serie: form.serie.trim() || 'Manual',
      codigo_cliente: form.codigo_cliente.trim().toUpperCase(),
      contato: form.contato.trim(),
      cargo: form.cargo.trim(),
      email: form.email.trim().toLowerCase(),
      telefone: form.telefone.trim(),
      segmento: form.segmento.trim(),
      inside: form.inside.trim().toUpperCase(),
    }

    try {
      if (editing) {
        await updateCanalCliente(editing.id, payload)
        toast({
          title: 'Canal atualizado com sucesso!',
          description: `${payload.nome_canal} — ${payload.nome_cliente}`,
        })
      } else {
        await createCanalCliente(payload)
        toast({
          title: 'Canal cadastrado com sucesso!',
          description: `${payload.nome_canal} — ${payload.nome_cliente}`,
        })
      }
      setModalOpen(false)
      loadList()
      loadIndicadores()
    } catch (err) {
      console.error('Erro ao salvar canal:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar registro.'
      setSaveError(msg)
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: msg })
    } finally {
      setSaving(false)
    }
  }

  // Excluir
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCanalCliente(deleteTarget.id)
      toast({
        title: 'Registro excluído com sucesso!',
        description: `${deleteTarget.nome_canal || 'Canal'} — ${deleteTarget.nome_cliente || deleteTarget.codigo_cliente}`,
      })
      setDeleteTarget(null)
      loadList()
      loadIndicadores()
    } catch (err) {
      console.error('Erro ao excluir:', err)
      const msg = err instanceof Error ? err.message : 'Falha ao excluir registro.'
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: msg })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho do Módulo */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-50 text-[#0B6E99] border border-cyan-100">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg font-extrabold text-slate-900">
                  Manutenção de Canais
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-medium">
                  Gestão da Base Única de Canais, indicadores de cobertura e vinculações com
                  clientes
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  loadIndicadores()
                  loadList()
                }}
                disabled={loadingList || loadingIndicadores}
                className="h-9 text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
                title="Atualizar dados"
              >
                <RefreshCw
                  className={cn(
                    'w-3.5 h-3.5 mr-1.5 text-[#0B6E99]',
                    (loadingList || loadingIndicadores) && 'animate-spin',
                  )}
                />
                Atualizar
              </Button>
              <Button
                onClick={openCreate}
                className="h-9 bg-[#0B6E99] hover:bg-[#084F6E] text-white text-xs font-bold shadow-xs"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Novo Registro
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* BLOCO 1: INDICADORES CONSOLIDADOS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#0B6E99]" />
            Indicadores da Base Única de Canais
          </h2>
          {indicadores && (
            <span className="text-xs text-slate-500 font-semibold">
              {indicadores.totalRegistros} contatos vinculados • {indicadores.totalClientesUnicos}{' '}
              clientes únicos
            </span>
          )}
        </div>

        {/* 4 Cards de Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                  Canais Distintos
                </p>
                <p className="text-2xl font-black text-[#0B6E99] mt-1">
                  {loadingIndicadores ? (
                    <span className="inline-block w-8 h-6 bg-slate-200 rounded animate-pulse" />
                  ) : (
                    indicadores?.totalCanais || 0
                  )}
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Rede de revendas oficiais
                </p>
              </div>
              <div className="p-3 rounded-xl bg-cyan-50 text-[#0B6E99]">
                <Network className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                  Clientes Vinculados
                </p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {loadingIndicadores ? (
                    <span className="inline-block w-8 h-6 bg-slate-200 rounded animate-pulse" />
                  ) : (
                    indicadores?.totalClientesUnicos || 0
                  )}
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Códigos de clientes mapeados
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 text-slate-700">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                  Contatos Cadastrados
                </p>
                <p className="text-2xl font-black text-teal-700 mt-1">
                  {loadingIndicadores ? (
                    <span className="inline-block w-8 h-6 bg-slate-200 rounded animate-pulse" />
                  ) : (
                    indicadores?.totalContatos || 0
                  )}
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Pessoas de contato com e-mail/tel
                </p>
              </div>
              <div className="p-3 rounded-xl bg-teal-50 text-teal-600">
                <Users className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                  Total de Linhas
                </p>
                <p className="text-2xl font-black text-slate-800 mt-1">
                  {loadingIndicadores ? (
                    <span className="inline-block w-8 h-6 bg-slate-200 rounded animate-pulse" />
                  ) : (
                    indicadores?.totalRegistros || 0
                  )}
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Registros na coleção canais_clientes
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-100 text-slate-600">
                <Layers className="w-5 h-5" />
              </div>
            </div>
          </Card>
        </div>

        {/* 3 Blocos de Indicadores Detalhados (Nome do Canal, Deploy, Inside) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Indicador 1: Por Nome do Canal */}
          <Card className="rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                  <Network className="w-3.5 h-3.5 text-[#0B6E99]" />
                  Por Nome do Canal
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-white border-slate-200">
                  {indicadores?.porNomeCanal.length || 0} canais
                </Badge>
              </div>
              <CardDescription className="text-[11px] text-slate-500">
                Distribuição de clientes e contatos por canal
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 max-h-72 overflow-y-auto">
              {loadingIndicadores ? (
                <div className="p-6 text-center text-xs text-slate-400">Carregando canais...</div>
              ) : !indicadores || indicadores.porNomeCanal.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum canal encontrado
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {indicadores.porNomeCanal.map((c) => (
                    <div
                      key={c.nome}
                      className="p-3 hover:bg-slate-50/70 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 truncate">{c.nome}</span>
                          {c.deploy && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1 py-0 font-semibold',
                                c.deploy === 'AGIS'
                                  ? 'border-cyan-300 bg-cyan-50 text-[#0B6E99]'
                                  : c.deploy === 'Roland'
                                    ? 'border-teal-300 bg-teal-50 text-teal-700'
                                    : 'border-slate-200 text-slate-500',
                              )}
                            >
                              {c.deploy}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {c.totalRegistros} contatos cadastrados
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-[#0B6E99] text-sm">
                          {c.totalClientes}
                        </span>
                        <span className="text-[10px] text-slate-400 block">clientes</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Indicador 2: Por Canal de Faturamento (Deploy) */}
          <Card className="rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                  <Briefcase className="w-3.5 h-3.5 text-[#1895A8]" />
                  Canal de Faturamento (Deploy)
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-white border-slate-200">
                  AGIS / Roland / Nenhum
                </Badge>
              </div>
              <CardDescription className="text-[11px] text-slate-500">
                Modelo de faturamento: Revenda (AGIS) vs. Direta (Roland)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 flex-1 space-y-4">
              {loadingIndicadores ? (
                <div className="p-6 text-center text-xs text-slate-400">Carregando deploys...</div>
              ) : !indicadores || indicadores.porDeploy.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum deploy encontrado
                </div>
              ) : (
                indicadores.porDeploy.map((d) => {
                  const isAgis = d.deploy === 'AGIS'
                  const isRoland = d.deploy === 'Roland'
                  const barColor = isAgis
                    ? 'bg-[#0B6E99]'
                    : isRoland
                      ? 'bg-[#1895A8]'
                      : 'bg-slate-400'
                  const textColor = isAgis
                    ? 'text-[#0B6E99]'
                    : isRoland
                      ? 'text-[#1895A8]'
                      : 'text-slate-600'

                  return (
                    <div key={d.deploy} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className={cn('font-bold', textColor)}>
                            {d.deploy === 'AGIS'
                              ? 'AGIS (Revenda)'
                              : d.deploy === 'Roland'
                                ? 'Roland (Direta)'
                                : 'Nenhum / Sem Deploy'}
                          </span>
                        </div>
                        <span className="font-extrabold text-slate-800">
                          {d.totalClientes} clientes ({d.percentual}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            barColor,
                          )}
                          style={{ width: `${Math.max(d.percentual, 2)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 text-right">
                        {d.totalRegistros} contatos vinculados
                      </p>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          {/* Indicador 3: Por Inside */}
          <Card className="rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                  <Users className="w-3.5 h-3.5 text-teal-600" />
                  Por Inside Sales
                </CardTitle>
                <Badge variant="outline" className="text-[10px] bg-white border-slate-200">
                  {indicadores?.porInside.length || 0} responsáveis
                </Badge>
              </div>
              <CardDescription className="text-[11px] text-slate-500">
                Distribuição de carteira de canais por Inside
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 max-h-72 overflow-y-auto">
              {loadingIndicadores ? (
                <div className="p-6 text-center text-xs text-slate-400">Carregando inside...</div>
              ) : !indicadores || indicadores.porInside.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Nenhum inside cadastrado
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {indicadores.porInside.map((ins) => (
                    <div
                      key={ins.inside}
                      className="p-3 hover:bg-slate-50/70 flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-teal-600 shrink-0" />
                          <span className="font-bold text-slate-800 truncate">{ins.inside}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {ins.totalRegistros} contatos vinculados
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-extrabold text-teal-700 text-sm">
                          {ins.totalClientes}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          clientes ({ins.percentual}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* BLOCO 2: CRUD / LISTA DE REGISTROS */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#0B6E99]" />
                Registros de Canais e Clientes
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-medium">
                {totalItems} registro(s) encontrado(s) • Paginação e filtros rápidos por Canal,
                Deploy e Inside
              </CardDescription>
            </div>

            <Button
              onClick={openCreate}
              size="sm"
              className="bg-[#0B6E99] hover:bg-[#084F6E] text-white text-xs font-bold shrink-0 shadow-xs h-8"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Novo Canal / Cliente
            </Button>
          </div>

          {/* Barra de Busca e Filtros Rápidos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-3">
            {/* Busca textual */}
            <div className="sm:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Buscar por Canal, Cliente, COD, Contato ou E-mail..."
                className="pl-9 h-9 text-xs rounded-lg border-slate-200 focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Filtro Nome do Canal */}
            <div>
              <Select
                value={canalFilter}
                onValueChange={(v) => handleFilterChange(setCanalFilter, v)}
              >
                <SelectTrigger className="h-9 text-xs border-slate-200">
                  <SelectValue placeholder="Canal: Todos" />
                </SelectTrigger>
                <SelectContent className="max-h-60 text-xs">
                  <SelectItem value="__all">Todos os canais</SelectItem>
                  {uniqueCanaisList.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Deploy */}
            <div>
              <Select
                value={deployFilter}
                onValueChange={(v) => handleFilterChange(setDeployFilter, v)}
              >
                <SelectTrigger className="h-9 text-xs border-slate-200">
                  <SelectValue placeholder="Deploy: Todos" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="__all">Todos os deploys</SelectItem>
                  <SelectItem value="AGIS">AGIS (Revenda)</SelectItem>
                  <SelectItem value="Roland">Roland (Direta)</SelectItem>
                  <SelectItem value="Nenhum">Nenhum</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Inside */}
            <div>
              <Select
                value={insideFilter}
                onValueChange={(v) => handleFilterChange(setInsideFilter, v)}
              >
                <SelectTrigger className="h-9 text-xs border-slate-200">
                  <SelectValue placeholder="Inside: Todos" />
                </SelectTrigger>
                <SelectContent className="max-h-60 text-xs">
                  <SelectItem value="__all">Todos os Inside</SelectItem>
                  {uniqueInsideList.map((ins) => (
                    <SelectItem key={ins} value={ins}>
                      {ins}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Segunda linha de filtros rápidos: eh_canal e botão Limpar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">É Canal:</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={ehCanalFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => handleFilterChange(setEhCanalFilter, 'all')}
                  className={cn(
                    'h-7 px-2.5 text-[11px] rounded-full',
                    ehCanalFilter === 'all' ? 'bg-[#0B6E99] text-white' : 'text-slate-600',
                  )}
                >
                  Todos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={ehCanalFilter === 'true' ? 'default' : 'outline'}
                  onClick={() => handleFilterChange(setEhCanalFilter, 'true')}
                  className={cn(
                    'h-7 px-2.5 text-[11px] rounded-full',
                    ehCanalFilter === 'true' ? 'bg-[#0B6E99] text-white' : 'text-slate-600',
                  )}
                >
                  Sim (Canais)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={ehCanalFilter === 'false' ? 'default' : 'outline'}
                  onClick={() => handleFilterChange(setEhCanalFilter, 'false')}
                  className={cn(
                    'h-7 px-2.5 text-[11px] rounded-full',
                    ehCanalFilter === 'false' ? 'bg-[#0B6E99] text-white' : 'text-slate-600',
                  )}
                >
                  Não
                </Button>
              </div>
            </div>

            {(search ||
              canalFilter !== '__all' ||
              deployFilter !== '__all' ||
              insideFilter !== '__all' ||
              ehCanalFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="h-7 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Limpar filtros rápidos
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Tabela de Registros */}
        <CardContent className="p-0">
          {loadingList ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-4 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold">Carregando registros de canais...</p>
            </div>
          ) : loadError ? (
            <div className="p-12 text-center text-slate-500">
              <p className="text-sm font-bold text-rose-600 mb-2">{loadError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadList}
                className="text-xs font-semibold"
              >
                Tentar novamente
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Filter className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">Nenhum registro encontrado</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tente ajustar a busca ou os filtros rápidos acima
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Canal</th>
                    <th className="py-2.5 px-3">Deploy</th>
                    <th className="py-2.5 px-3">COD</th>
                    <th className="py-2.5 px-3">Cliente / Razão Social</th>
                    <th className="py-2.5 px-3">Contato / Cargo</th>
                    <th className="py-2.5 px-3">E-mail / Telefone</th>
                    <th className="py-2.5 px-3">Inside</th>
                    <th className="py-2.5 px-3 text-center">É Canal</th>
                    <th className="py-2.5 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((row) => {
                    const deployRaw = (row.deploy || '').toUpperCase()
                    const isAgis = deployRaw.includes('AGIS')
                    const isRoland = deployRaw.includes('ROLAND')

                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Canal */}
                        <td className="py-2.5 px-3">
                          <span className="font-extrabold text-slate-900 block truncate max-w-[130px]">
                            {row.nome_canal || '-'}
                          </span>
                          {row.status && (
                            <span className="text-[10px] text-slate-400">{row.status}</span>
                          )}
                        </td>

                        {/* Deploy */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {isAgis ? (
                            <Badge className="bg-cyan-50 text-[#0B6E99] border-cyan-200 hover:bg-cyan-50 text-[10px] font-bold">
                              AGIS
                            </Badge>
                          ) : isRoland ? (
                            <Badge className="bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50 text-[10px] font-bold">
                              Roland
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-slate-500 border-slate-200 text-[10px]"
                            >
                              {row.deploy || 'Nenhum'}
                            </Badge>
                          )}
                        </td>

                        {/* COD */}
                        <td className="py-2.5 px-3 font-mono font-bold text-[#0B6E99]">
                          {row.codigo_cliente || '-'}
                        </td>

                        {/* Cliente / Razão Social */}
                        <td className="py-2.5 px-3 max-w-[220px]">
                          <span
                            className="font-semibold text-slate-800 block truncate"
                            title={row.nome_cliente}
                          >
                            {row.nome_cliente || '-'}
                          </span>
                          {row.segmento && (
                            <span className="text-[10px] text-slate-400 block truncate">
                              {row.segmento}
                            </span>
                          )}
                        </td>

                        {/* Contato / Cargo */}
                        <td className="py-2.5 px-3 max-w-[160px]">
                          <span
                            className="text-slate-700 font-medium block truncate"
                            title={row.contato}
                          >
                            {row.contato || '-'}
                          </span>
                          {row.cargo && (
                            <span className="text-[10px] text-slate-400 block truncate">
                              {row.cargo}
                            </span>
                          )}
                        </td>

                        {/* E-mail / Telefone */}
                        <td className="py-2.5 px-3 max-w-[180px]">
                          {row.email ? (
                            <a
                              href={`mailto:${row.email}`}
                              className="text-[#0B6E99] hover:underline flex items-center gap-1 truncate font-medium text-[11px]"
                              title={row.email}
                            >
                              <Mail className="w-3 h-3 shrink-0" />
                              <span className="truncate">{row.email}</span>
                            </a>
                          ) : null}
                          {row.telefone ? (
                            <span className="text-slate-500 flex items-center gap-1 text-[10px] mt-0.5">
                              <Phone className="w-2.5 h-2.5 shrink-0" />
                              {row.telefone}
                            </span>
                          ) : null}
                          {!row.email && !row.telefone && <span className="text-slate-300">-</span>}
                        </td>

                        {/* Inside */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {row.inside ? (
                            <Badge
                              variant="outline"
                              className="bg-teal-50/60 text-teal-800 border-teal-200 text-[10px] font-semibold"
                            >
                              {row.inside}
                            </Badge>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        {/* É Canal */}
                        <td className="py-2.5 px-3 text-center">
                          {row.eh_canal ? (
                            <span
                              className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px]"
                              title="Marcado como Canal oficial (CANAIS=SIM)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Sim
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-slate-400 text-[10px]"
                              title="Não marcado como canal oficial"
                            >
                              <XCircle className="w-3.5 h-3.5 text-slate-300" />
                              Não
                            </span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(row)}
                              className="w-7 h-7 text-slate-500 hover:text-[#0B6E99] hover:bg-cyan-50"
                              title="Alterar registro"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteTarget(row)}
                              className="w-7 h-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Excluir registro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/30">
              <span>
                Página <strong className="text-slate-800">{page}</strong> de{' '}
                <strong className="text-slate-800">{totalPages}</strong> ({totalItems} itens)
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loadingList}
                  className="h-8 px-2 text-xs"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loadingList}
                  className="h-8 px-2 text-xs"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL DE CADASTRO / ALTERAÇÃO */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Network className="w-4 h-4 text-[#0B6E99]" />
              {editing ? 'Alterar Registro de Canal' : 'Novo Cadastro de Canal'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editing
                ? 'Atualize as informações do canal, deploy, vínculos e contatos.'
                : 'Preencha os campos para cadastrar um novo canal ou cliente vinculado.'}
            </DialogDescription>
          </DialogHeader>

          {saveError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {saveError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 py-2">
            {/* Toggle É Canal */}
            <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-xl bg-cyan-50/50 border border-cyan-100">
              <div>
                <Label className="text-xs font-extrabold text-slate-800 block">
                  É Canal Oficial? (Canais = SIM)
                </Label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Identifica se este registro deve ser filtrado como rede de canais oficiais
                </p>
              </div>
              <Switch
                checked={form.eh_canal}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, eh_canal: checked }))}
              />
            </div>

            {/* Código do Cliente (COD) - OBRIGATÓRIO */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">
                Código do Cliente (COD) <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={form.codigo_cliente}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, codigo_cliente: e.target.value.toUpperCase() }))
                }
                placeholder="Ex.: C00072, C08457"
                className="h-9 text-xs font-mono font-bold uppercase focus-visible:ring-[#0B6E99]"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Chave de junção com vendas consolidadas
              </p>
            </div>

            {/* Deploy: AGIS, Roland, Nenhum */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">
                Canal de Faturamento (Deploy) <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={form.deploy}
                onValueChange={(val) => setForm((prev) => ({ ...prev, deploy: val }))}
              >
                <SelectTrigger className="h-9 text-xs focus:ring-[#0B6E99]">
                  <SelectValue placeholder="Selecione o deploy" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="AGIS">AGIS (Revenda)</SelectItem>
                  <SelectItem value="Roland">Roland (Direta)</SelectItem>
                  <SelectItem value="Nenhum">Nenhum (Sem deploy)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Nome do Canal */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">
                Nome do Canal <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={form.nome_canal}
                onChange={(e) => setForm((prev) => ({ ...prev, nome_canal: e.target.value }))}
                placeholder="Ex.: SPAK, DIAMANTE, OCEAN"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Nome do Cliente / Razão Social */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">
                Nome do Cliente / Razão Social <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={form.nome_cliente}
                onChange={(e) => setForm((prev) => ({ ...prev, nome_cliente: e.target.value }))}
                placeholder="Ex.: SPAK IND E COM..."
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Inside Sales */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">Inside Sales</Label>
              <Input
                value={form.inside}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, inside: e.target.value.toUpperCase() }))
                }
                placeholder="Ex.: FERNANDA, PALOMA"
                className="h-9 text-xs uppercase focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Status */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">Status</Label>
              <Input
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                placeholder="Ex.: Ativo, Inativo"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Contato */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">Contato</Label>
              <Input
                value={form.contato}
                onChange={(e) => setForm((prev) => ({ ...prev, contato: e.target.value }))}
                placeholder="Ex.: NILTON, RENAN"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Cargo */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">Cargo</Label>
              <Input
                value={form.cargo}
                onChange={(e) => setForm((prev) => ({ ...prev, cargo: e.target.value }))}
                placeholder="Ex.: GERENTE, VENDEDOR"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* E-mail */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="contato@empresa.com.br"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Telefone */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm((prev) => ({ ...prev, telefone: e.target.value }))}
                placeholder="(11) 99999-9999"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Segmento */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">Segmento</Label>
              <Input
                value={form.segmento}
                onChange={(e) => setForm((prev) => ({ ...prev, segmento: e.target.value }))}
                placeholder="DIGITAL PRINTING (DP), 3D, DENTAL"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>

            {/* Série / Categoria */}
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1 block">
                Série / Categoria
              </Label>
              <Input
                value={form.serie}
                onChange={(e) => setForm((prev) => ({ ...prev, serie: e.target.value }))}
                placeholder="Manual, Clientes, Revendas"
                className="h-9 text-xs focus-visible:ring-[#0B6E99]"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-[#0B6E99] hover:bg-[#084F6E] text-white text-xs font-bold"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Salvando...
                </>
              ) : editing ? (
                'Salvar Alterações'
              ) : (
                'Cadastrar Canal'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Excluir Registro de Canal?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              Tem certeza que deseja excluir o registro do canal{' '}
              <strong className="text-slate-800">{deleteTarget?.nome_canal}</strong> (Cliente:{' '}
              {deleteTarget?.nome_cliente || deleteTarget?.codigo_cliente})?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-bold"
            >
              {deleting ? 'Excluindo...' : 'Sim, Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
