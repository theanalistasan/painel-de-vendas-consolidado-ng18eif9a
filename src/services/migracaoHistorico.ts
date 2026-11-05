import pb from '@/lib/pocketbase/client'

export type MigracaoHistoricoState = 'idle' | 'in_progress' | 'completed' | 'error'

export interface MigracaoHistoricoStatus {
  status: MigracaoHistoricoState
  etapa: string
  registros_movidos: number
  registros_pendentes: number
  total_historico: number
  mensagem: string
  erro: string
  started_at: string
  updated_at: string
  finished_at: string
}

const BASE_PATH = '/backend/v1/vendas/migrar-historico'

/** Consulta o progresso persistido da migração do histórico (< 2025). */
export async function getMigracaoHistoricoStatus(): Promise<MigracaoHistoricoStatus> {
  const res = await pb.send<{ success: boolean; status: MigracaoHistoricoStatus }>(
    `${BASE_PATH}/status`,
    { method: 'GET' },
  )
  if (!res?.status) {
    throw new Error('Resposta inválida do backend ao consultar status da migração do histórico')
  }
  return res.status
}

/** Executa UM lote da movimentação de registros < 2025-01-01 para vendas_historico. */
export async function stepMigracaoHistorico(): Promise<{
  success: boolean
  done?: boolean
  already_finished?: boolean
  lote_processado?: number
  registros_movidos?: number
  registros_pendentes?: number
  total_historico?: number
  duracao_ms?: number
  status: MigracaoHistoricoStatus
}> {
  return pb.send<{
    success: boolean
    done?: boolean
    already_finished?: boolean
    lote_processado?: number
    registros_movidos?: number
    registros_pendentes?: number
    total_historico?: number
    duracao_ms?: number
    status: MigracaoHistoricoStatus
  }>(`${BASE_PATH}/step`, { method: 'POST', body: {} })
}

/** Inicia (ou retoma) a migração do histórico e roda os lotes até concluir. */
export async function migrarHistoricoApi(options?: {
  onProgress?: (status: MigracaoHistoricoStatus) => void
  signal?: AbortSignal
}): Promise<{
  status: MigracaoHistoricoStatus
  duracao_ms?: number
  registros_movidos: number
}> {
  const startedAt = Date.now()

  let initRes: {
    success: boolean
    started: boolean
    done?: boolean
    already_running?: boolean
    total_pendentes?: number
    total_lotes?: number
    status: MigracaoHistoricoStatus
    message?: string
  }
  try {
    initRes = await pb.send<typeof initRes>(BASE_PATH, { method: 'POST', body: {} })
  } catch (err: unknown) {
    const errObj = err as {
      data?: { error?: string; message?: string; stage?: string }
      response?: { error?: string; message?: string; stage?: string }
      message?: string
    }
    const backendData = errObj?.data || errObj?.response
    throw new Error(
      backendData?.error ||
        backendData?.message ||
        errObj?.message ||
        'Falha ao iniciar a migração do histórico',
    )
  }

  if (options?.onProgress && initRes.status) options.onProgress(initRes.status)
  if (initRes.done) {
    return { status: initRes.status, registros_movidos: initRes.status.registros_movidos || 0 }
  }

  // Um lote por chamada — mesmo padrão da consolidação (sem estourar o timeout HTTP)
  const maxIterations = 500
  let iterations = 0
  let currentStatus = initRes.status

  while (iterations < maxIterations) {
    iterations++
    if (options?.signal?.aborted) throw new Error('Migração do histórico cancelada pelo usuário.')
    if (currentStatus.status === 'completed') break
    if (currentStatus.status === 'error') {
      throw new Error(currentStatus.erro || 'Falha na migração do histórico')
    }

    const stepRes = await stepMigracaoHistorico()
    currentStatus = stepRes.status
    if (options?.onProgress && currentStatus) options.onProgress(currentStatus)

    if (stepRes.done || stepRes.already_finished || currentStatus.status === 'completed') break
  }

  if (currentStatus.status !== 'completed') {
    throw new Error(currentStatus.erro || 'A migração do histórico não concluiu dentro do esperado')
  }

  return {
    status: currentStatus,
    duracao_ms: currentStatus.finished_at
      ? Math.max(0, new Date(currentStatus.finished_at).getTime() - startedAt)
      : Date.now() - startedAt,
    registros_movidos: currentStatus.registros_movidos || 0,
  }
}
