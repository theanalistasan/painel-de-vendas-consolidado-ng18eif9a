import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'

export type AuditAction = 'login' | 'logout' | 'admin_access' | 'import_access'

export interface AuditLog {
  id: string
  user_id?: string
  user_email?: string
  user_name?: string
  action: string
  details?: string
  ip?: string
  created: string
}

export interface AuditLogListResult {
  items: AuditLog[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export interface FetchAuditLogsParams {
  page?: number
  perPage?: number
  action?: string
  userId?: string
  startDate?: string
  endDate?: string
}

/**
 * Registra um evento de auditoria na coleção `audit_logs`.
 * Falhas são silenciadas para nunca bloquear o fluxo principal do app.
 */
export async function logAudit(action: AuditAction, details?: string): Promise<void> {
  try {
    if (!pb.authStore.isValid) return
    const user = pb.authStore.record

    // Tenta gravar exclusivamente via endpoint backend dedicado (/backend/v1/audit/log).
    // O fallback direto para pb.collection('audit_logs').create foi desativado pois retornava 400.
    await pb.send('/backend/v1/audit/log', {
      method: 'POST',
      body: {
        action,
        details: details || '',
        user_id: user?.id || '',
        user_email: user?.email || '',
        user_name: user?.name || '',
      },
    })
  } catch (err) {
    // Auditoria é best-effort: nunca lançar exceção nem bloquear o fluxo principal.
    console.warn('Falha ao registrar auditoria:', err)
  }
}

/**
 * Busca logs de auditoria paginados, com filtros opcionais.
 */
export async function fetchAuditLogs(params: FetchAuditLogsParams): Promise<AuditLogListResult> {
  const page = params.page || 1
  const perPage = params.perPage || 20

  const filters: string[] = []
  if (params.action && params.action !== 'all') {
    filters.push(`action = '${params.action}'`)
  }
  if (params.userId && params.userId !== 'all') {
    filters.push(`user_id = '${params.userId}'`)
  }
  if (params.startDate) {
    filters.push(`created >= '${params.startDate}T00:00:00.000Z'`)
  }
  if (params.endDate) {
    filters.push(`created <= '${params.endDate}T23:59:59.999Z'`)
  }

  const runQuery = () =>
    pb.collection('audit_logs').getList<AuditLog>(page, perPage, {
      sort: '-created',
      filter: filters.length > 0 ? filters.join(' && ') : undefined,
    })

  let result
  try {
    result = await runQuery()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if ((status === 401 || status === 403) && pb.authStore.isValid) {
      try {
        await safeAuthRefresh()
        result = await runQuery()
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }

  return {
    items: result.items,
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  }
}
