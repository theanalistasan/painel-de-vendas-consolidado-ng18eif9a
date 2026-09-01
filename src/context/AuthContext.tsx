import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import { logAudit } from '@/services/audit'
import { setAdminUnlocked } from '@/components/AdminGuard'
import { clearFiltersFromSession } from '@/lib/filter-persistence'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'

interface AuthContextType {
  user: AuthRecord | null
  token: string | null
  isLoading: boolean
  login: (email: string, pass: string) => Promise<void>
  logout: () => void
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthRecord | null>(pb.authStore.record)
  const [token, setToken] = useState<string | null>(pb.authStore.token)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const initialRefreshDone = useRef(false)

  useEffect(() => {
    // Sincroniza estado React sempre que o authStore do PocketBase mudar (login, logout, refresh, clear)
    const unsub = pb.authStore.onChange((newToken, newRecord) => {
      setToken(newToken)
      setUser(newRecord)
    })

    // Na inicialização, se houver token persistido no localStorage:
    if (pb.authStore.isValid && !initialRefreshDone.current) {
      initialRefreshDone.current = true
      // Garantir que o estado inicial do React reflita o record persistido
      setUser(pb.authStore.record)
      setToken(pb.authStore.token)

      safeAuthRefresh()
        .catch((err: unknown) => {
          const status = (err as { status?: number })?.status
          // Se for 401/403, o safeAuthRefresh já deu clear() no authStore e acionou onChange
          if (status !== 401 && status !== 403) {
            console.warn(
              'Backend indisponível no momento do boot; mantendo token local válido.',
              err,
            )
          }
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }

    return () => {
      unsub()
    }
  }, [])

  const login = useCallback(async (email: string, pass: string) => {
    const res = await pb.collection('users').authWithPassword(email, pass)
    setUser(res.record)
    setToken(res.token)
    // Auditoria: registra o login bem-sucedido (best-effort).
    void logAudit('login', 'Login realizado')
  }, [])

  const logout = useCallback(() => {
    // Auditoria: registra o logout antes de limpar a sessão (best-effort).
    void logAudit('logout', 'Logout realizado')
    // Remove o flag admin ao sair — exige a senha novamente na próxima sessão.
    setAdminUnlocked(false)
    // Limpa os filtros persistidos em sessionStorage ao sair.
    clearFiltersFromSession()
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }, [])

  const refreshAuth = useCallback(async () => {
    if (pb.authStore.isValid) {
      try {
        await safeAuthRefresh()
      } catch (err) {
        console.warn('refreshAuth manual falhou:', err)
      }
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
