import React, { useState } from 'react'
import {
  ShieldAlert,
  Lock,
  Database,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { resetBasesApi, getCountsSummary } from '@/services/sales'
import type { ResetBasesResult } from '@/services/sales'
import { formatNumber } from '@/lib/formatters'
import { cn } from '@/lib/utils'

const BASES = [
  { key: 'produtos', label: 'Produtos', desc: 'Catálogo de itens', color: 'bg-cyan-500' },
  { key: 'racnew', label: 'RacNew', desc: 'Base mestra fiscal/financeira', color: 'bg-indigo-500' },
  { key: 'netsales', label: 'NetSales', desc: 'Campos comerciais', color: 'bg-teal-500' },
  { key: 'vendas', label: 'Vendas', desc: 'Base consolidada', color: 'bg-rose-500' },
] as const

export default function Admin() {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState<Record<string, number>>({
    produtos: 0,
    racnew: 0,
    netsales: 0,
    vendas: 0,
  })
  const [lastResult, setLastResult] = useState<ResetBasesResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selected, setSelected] = useState<Record<string, boolean>>({
    produtos: true,
    racnew: true,
    netsales: true,
    vendas: true,
  })
  const { toast } = useToast()

  const selectedKeys = BASES.filter((b) => selected[b.key]).map((b) => b.key)
  const allSelected = selectedKeys.length === BASES.length
  const selectedTotal = selectedKeys.reduce((sum, k) => sum + (counts[k] || 0), 0)

  const toggleBase = (key: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [key]: checked }))
  }

  const refreshCounts = async () => {
    try {
      const data = await getCountsSummary()
      setCounts({
        produtos: data.produtos,
        racnew: data.racnew,
        netsales: data.netsales,
        vendas: data.vendas,
      })
    } catch (err) {
      console.error('Erro ao buscar contagens:', err)
    }
  }

  React.useEffect(() => {
    refreshCounts()
  }, [])

  const handleOpenConfirm = () => {
    if (!password.trim()) {
      toast({
        variant: 'destructive',
        title: 'Senha obrigatória',
        description: 'Informe a senha de administrador para continuar.',
      })
      return
    }
    setConfirmOpen(true)
  }

  const handleConfirmReset = async () => {
    setConfirmOpen(false)
    setLoading(true)
    try {
      const res = await resetBasesApi(password, allSelected ? undefined : selectedKeys)
      setLastResult(res)
      await refreshCounts()

      if (res.alreadyEmpty) {
        toast({
          title: 'Nada a remover',
          description: res.message,
        })
      } else {
        toast({
          title: 'Bases zeradas com sucesso',
          description: `${formatNumber(res.total_removido)} registros removidos no total.`,
        })
      }
      setPassword('')
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      const msg =
        status === 403
          ? 'Senha de administrador incorreta. Ação não executada.'
          : err instanceof Error
            ? err.message
            : 'Falha ao zerar as bases.'
      toast({
        variant: 'destructive',
        title: 'Erro ao zerar bases',
        description: msg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      {/* Header / Warning */}
      <Card className="rounded-xl border border-rose-300/70 bg-gradient-to-r from-rose-950 to-slate-900 text-white shadow-md overflow-hidden">
        <CardContent className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-rose-500/20 text-rose-300 shrink-0">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-200 text-[11px] font-semibold border border-rose-400/30">
                <Lock className="w-3 h-3" />
                Área Restrita
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Zerar Bases de Dados
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                Esta operação remove <strong>todos os registros</strong> das coleções{' '}
                <strong>Produtos</strong>, <strong>RacNew</strong>, <strong>NetSales</strong> e{' '}
                <strong>Vendas</strong> consolidadas, permitindo subir dados limpos do zero. A ação
                é <strong>irreversível</strong> e exige confirmação em duas etapas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current counts */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Estado atual das bases
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Quantidade de registros em cada coleção
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {BASES.map((b) => {
              const isSelected = selected[b.key]
              return (
                <label
                  key={b.key}
                  htmlFor={`sel-${b.key}`}
                  className={cn(
                    'bg-slate-50 p-3 rounded-lg border cursor-pointer transition-colors',
                    isSelected ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200/70 opacity-60',
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Checkbox
                      id={`sel-${b.key}`}
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleBase(b.key, checked === true)}
                      className="w-3.5 h-3.5 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                    />
                    <span className={cn('w-2 h-2 rounded-full', b.color)} />
                    <span className="text-[11px] text-slate-500 font-medium truncate">
                      {b.label}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">
                    {formatNumber(counts[b.key])}
                  </span>
                  <span className="text-[10px] text-slate-400 block">{b.desc}</span>
                </label>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            Selecione quais bases zerar. Por padrão, todas são selecionadas.
            {!allSelected && (
              <>
                {' '}
                <span className="text-rose-600 font-medium">
                  ({selectedKeys.length} de {BASES.length} selecionadas)
                </span>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Password form */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Etapa 1 — Autenticação
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Informe a senha de administrador para liberar a limpeza
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-password" className="text-xs font-semibold text-slate-700">
              Senha de administrador
            </Label>
            <div className="relative">
              <Input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha de administrador"
                className="pr-10"
                autoComplete="off"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleOpenConfirm()
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9 text-slate-400 hover:text-slate-700"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <Button
            onClick={handleOpenConfirm}
            disabled={loading || !password.trim()}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm py-2.5 shadow-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Limpando bases...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Avançar para confirmação
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result feedback */}
      {lastResult && (
        <Alert
          className={cn(
            'rounded-xl',
            lastResult.alreadyEmpty
              ? 'bg-cyan-50 border-cyan-200'
              : 'bg-emerald-50 border-emerald-200',
          )}
        >
          {lastResult.alreadyEmpty ? (
            <AlertTriangle className="h-4 w-4 text-cyan-600" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          )}
          <AlertTitle
            className={cn(
              'text-xs font-semibold',
              lastResult.alreadyEmpty ? 'text-cyan-800' : 'text-emerald-800',
            )}
          >
            {lastResult.alreadyEmpty ? 'Bases já limpas' : 'Limpeza concluída'}
          </AlertTitle>
          <AlertDescription className="text-xs text-slate-700">
            {lastResult.message}
            {!lastResult.alreadyEmpty && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {BASES.filter((b) => lastResult.counts[b.key] != null).map((b) => (
                  <div
                    key={b.key}
                    className="bg-white p-2 rounded-lg border border-slate-100 text-center"
                  >
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      {b.label}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {formatNumber(lastResult.counts[b.key])}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Confirmation dialog (Etapa 2) */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Etapa 2 — Confirmação
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">Tem certeza?</strong> Esta ação não pode ser
              desfeita. Todos os registros das coleções abaixo serão{' '}
              <strong>permanentemente removidos</strong>:
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2 py-1">
            {BASES.filter((b) => selected[b.key]).map((b) => (
              <div
                key={b.key}
                className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', b.color)} />
                  <span className="text-xs font-medium text-slate-700 truncate">{b.label}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {formatNumber(counts[b.key])}
                </Badge>
              </div>
            ))}
          </div>

          <Alert className="bg-rose-50 border-rose-200 py-2">
            <AlertDescription className="text-[11px] text-rose-700">
              Total a remover: <strong>{formatNumber(selectedTotal)}</strong> registros em{' '}
              <strong>{selectedKeys.length}</strong> {selectedKeys.length === 1 ? 'base' : 'bases'}.
            </AlertDescription>
          </Alert>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmReset}
              disabled={loading || selectedKeys.length === 0}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {allSelected ? 'Sim, zerar tudo' : 'Sim, zerar selecionadas'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
