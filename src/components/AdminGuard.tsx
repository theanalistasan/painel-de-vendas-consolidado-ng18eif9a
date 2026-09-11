import React, { useState, useEffect } from 'react'
import { Lock, ShieldCheck, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

const ADMIN_PASSWORD = 'Reset@Painel2025'
const ADMIN_UNLOCKED_KEY = 'adminUnlocked'

/**
 * Verifica se o acesso admin já foi desbloqueado.
 * Suporta persistência em localStorage (sobrevive a refresh F5 e preview iframes)
 * com fallback e sincronização em sessionStorage.
 */
export function isAdminUnlocked(): boolean {
  try {
    if (localStorage.getItem(ADMIN_UNLOCKED_KEY) === '1') {
      return true
    }
    if (sessionStorage.getItem(ADMIN_UNLOCKED_KEY) === '1') {
      try {
        localStorage.setItem(ADMIN_UNLOCKED_KEY, '1')
      } catch {
        // ignore
      }
      return true
    }
    return false
  } catch {
    try {
      return sessionStorage.getItem(ADMIN_UNLOCKED_KEY) === '1'
    } catch {
      return false
    }
  }
}

/**
 * Marca o acesso admin como desbloqueado ou bloqueado.
 * Persiste tanto no localStorage quanto no sessionStorage para garantir que F5/refresh
 * nunca trave a tela do usuário.
 */
export function setAdminUnlocked(unlocked: boolean) {
  try {
    if (unlocked) {
      localStorage.setItem(ADMIN_UNLOCKED_KEY, '1')
      sessionStorage.setItem(ADMIN_UNLOCKED_KEY, '1')
    } else {
      localStorage.removeItem(ADMIN_UNLOCKED_KEY)
      sessionStorage.removeItem(ADMIN_UNLOCKED_KEY)
    }
  } catch {
    try {
      if (unlocked) {
        sessionStorage.setItem(ADMIN_UNLOCKED_KEY, '1')
      } else {
        sessionStorage.removeItem(ADMIN_UNLOCKED_KEY)
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Modal centralizado exigindo a senha de administrador para liberar o acesso
 * a rotas protegidas (/importar, /admin, /usuarios, /auditoria).
 *
 * Mostra o modal enquanto o admin não estiver desbloqueado na sessão.
 */
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { toast } = useToast()

  const [unlocked, setUnlocked] = useState(() => isAdminUnlocked())

  // Sincroniza se o status for alterado
  useEffect(() => {
    setUnlocked(isAdminUnlocked())
  }, [])

  if (unlocked) {
    return <>{children}</>
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Simula verificação assíncrona para feedback de loading.
      await new Promise((r) => setTimeout(r, 200))
      if (password.trim() === ADMIN_PASSWORD) {
        setAdminUnlocked(true)
        setUnlocked(true)
        toast({
          title: 'Acesso liberado',
          description: 'Modo administrador ativado.',
        })
        setPassword('')
      } else {
        toast({
          variant: 'destructive',
          title: 'Senha incorreta',
          description: 'A senha de administrador não confere.',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigate('/', { replace: true })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-white shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-900 to-slate-900 px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-300">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight">Acesso Restrito</h2>
                <p className="text-[11px] text-indigo-200/80">
                  Área exclusiva para administradores
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="admin-guard-password"
                className="text-xs font-semibold text-slate-700"
              >
                Senha de administrador
              </Label>
              <Input
                id="admin-guard-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite a senha de administrador"
                autoFocus
                autoComplete="off"
                className="rounded-lg border-slate-200 focus-visible:ring-indigo-500"
                disabled={loading}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 text-xs"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={loading || !password.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                    Confirmar
                  </>
                )}
              </Button>
            </div>

            <p className="text-[10px] text-slate-400 text-center pt-1">
              O acesso permanecerá liberado durante esta sessão do navegador.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
