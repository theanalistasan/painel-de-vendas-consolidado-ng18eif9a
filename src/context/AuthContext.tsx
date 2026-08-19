import React, { createContext, useContext, useEffect, useState } from 'react'
import type { AuthRecord } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import { logAudit } from '@/services/audit'
import { setAdminUnlocked } from '@/components/AdminGuard'
import { clearFiltersFromSession } from '@/lib/filter-persistence'

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

  useEffect(() => {
    const unsub = pb.authStore.onChange((newToken, newRecord) => {
      setToken(newToken)
      setUser(newRecord)
    })

    if (pb.authStore.isValid) {
      pb.collection('users')
        .authRefresh()
        .then((res) => {
          setUser(res.record)
          setToken(res.token)
        })
        .catch(() => {
          pb.authStore.clear()
          setUser(null)
          setToken(null)
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

  const login = async (email: string, pass: string) => {
    const res = await pb.collection('users').authWithPassword(email, pass)
    setUser(res.record)
    setToken(res.token)
    // Auditoria: registra o login bem-sucedido (best-effort).
    void logAudit('login', 'Login realizado')
  }

  const logout = () => {
    // Auditoria: registra o logout antes de limpar a sessão (best-effort).
    void logAudit('logout', 'Logout realizado')
    // Remove o flag admin ao sair — exige a senha novamente na próxima sessão.
    setAdminUnlocked(false)
    // Limpa os filtros persistidos em sessionStorage ao sair.
    clearFiltersFromSession()
    pb.authStore.clear()
    setUser(null)
    setToken(null)
  }

  const refreshAuth = async () => {
    if (pb.authStore.isValid) {
      const res = await pb.collection('users').authRefresh()
      setUser(res.record)
      setToken(res.token)
    }
  }

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
