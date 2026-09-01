import pb from '@/lib/pocketbase/client'
import type { RecordAuthResponse, RecordModel } from 'pocketbase'

let refreshPromise: Promise<RecordAuthResponse<RecordModel> | null> | null = null

/**
 * Executes a synchronized, deduplicated authRefresh call.
 * If another refresh is already in-flight, it returns the same promise instead of triggering a concurrent request.
 * If the error is network/offline/aborted or non-401/403, it does NOT wipe the authStore.
 * If the server explicitly rejects authentication with 401/403, it clears the authStore.
 */
export async function safeAuthRefresh(): Promise<RecordAuthResponse<RecordModel> | null> {
  if (!pb.authStore.isValid) {
    return null
  }

  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const res = await pb.collection('users').authRefresh()
      return res
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      const isExplicitAuthFailure = status === 401 || status === 403

      if (isExplicitAuthFailure) {
        console.warn('Sessão expirada ou revogada (401/403). Limpando credenciais locais.', err)
        pb.authStore.clear()
      } else {
        console.warn(
          'Falha temporária ao renovar token (rede/instabilidade). Mantendo sessão local:',
          err,
        )
      }
      throw err
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}
