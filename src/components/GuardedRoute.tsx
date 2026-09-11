import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import AdminGuard from '@/components/AdminGuard'
import { logAudit } from '@/services/audit'

/**
 * Wraps a protected page with the AdminGuard (senha de administrador) and
 * registers an audit entry (admin_access / import_access) when the page is
 * actually accessed after unlock.
 *
 * `page` is one of: 'admin' | 'importar' | 'usuarios' | 'auditoria'.
 * It is used both to label the audit `details` and to pick the action:
 *  - /importar  → action 'import_access'
 *  - others     → action 'admin_access'
 */
export default function GuardedRoute({
  page,
  children,
}: {
  page: 'admin' | 'importar' | 'usuarios' | 'auditoria'
  children: React.ReactNode
}) {
  const location = useLocation()
  const loggedRef = useRef<string | null>(null)

  useEffect(() => {
    // Log apenas uma vez por montagem da rota específica.
    if (loggedRef.current === page) return
    loggedRef.current = page

    const action = page === 'importar' ? 'import_access' : 'admin_access'
    const details =
      page === 'admin'
        ? 'Acessou /admin'
        : page === 'importar'
          ? 'Acessou /importar'
          : page === 'usuarios'
            ? 'Acessou /usuarios'
            : 'Acessou /auditoria'

    // Garante execução assíncrona isolada sem chance de interromper a renderização
    try {
      void logAudit(action, details).catch(() => {})
    } catch {
      // noop
    }
  }, [page, location.pathname])

  return <AdminGuard>{children}</AdminGuard>
}
