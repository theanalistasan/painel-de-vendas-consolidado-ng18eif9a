import pb from '@/lib/pocketbase/client'

export type ZerarBaseState = 'idle' | 'in_progress' | 'completed' | 'error'

export interface ZerarBaseStatus {
  status: ZerarBaseState
  etapa: string
  colecao_atual: string
  total_planejado: number
  total_apagado: number
  apagado_por_colecao: Record<string, number>
  contagem_inicial: Record<string, number>
  mensagem: string
  erro: string
  started_at: string
  updated_at: string
  finished_at: string
}

export interface ZerarBaseStatusResponse {
  success: boolean
  status: ZerarBaseStatus
  /** Contagem ATUAL por coleção alvo do zeramento (para listar antes de confirmar) */
  contagens_atuais: Record<string, number>
}

const BASE_PATH = '/backend/v1/base/zerar'

/** Consulta o progresso persistido do zeramento + contagens atuais por coleção. */
export async function getZerarBaseStatus(): Promise<ZerarBaseStatusResponse> {
  const res = await pb.send<ZerarBaseStatusResponse>(`${BASE_PATH}/status`, { method: 'GET' })
  if (!res?.status) {
    throw new Error('Resposta inválida do backend ao consultar status do zeramento')
  }
  return {
    success: res.success,
    status: res.status,
    contagens_atuais: res.contagens_atuais || {},
  }
}

/** Apaga UM lote de UMA coleção por chamada (mesmo padrão da migração do histórico). */
export async function stepZerarBase(): Promise<{
  success: boolean
  done?: boolean
  already_finished?: boolean
  colecao?: string
  apagado_lote?: number
  total_apagado?: number
  restantes_colecao?: number
  duracao_ms?: number
  apagado_por_colecao?: Record<string, number>
  status: ZerarBaseStatus
}> {
  return pb.send<{
    success: boolean
    done?: boolean
    already_finished?: boolean
    colecao?: string
    apagado_lote?: number
    total_apagado?: number
    restantes_colecao?: number
    duracao_ms?: number
    apagado_por_colecao?: Record<string, number>
    status: ZerarBaseStatus
  }>(`${BASE_PATH}/step`, { method: 'POST', body: {} })
}

/** Inicia (ou retoma) o zeramento e roda os lotes até concluir. */
export async function zerarBaseApi(options?: {
  onProgress?: (status: ZerarBaseStatus) => void
  signal?: AbortSignal
}): Promise<{
  status: ZerarBaseStatus
  total_apagado: number
  apagado_por_colecao: Record<string, number>
  duracao_ms?: number
  nada_a_apagar?: boolean
}> {
  let initRes: {
    success: boolean
    started: boolean
    done?: boolean
    nada_a_apagar?: boolean
    already_running?: boolean
    total_planejado?: number
    status: ZerarBaseStatus
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
        'Falha ao iniciar o zeramento da base',
    )
  }

  if (options?.onProgress && initRes.status) options.onProgress(initRes.status)

  if (initRes.done) {
    return {
      status: initRes.status,
      total_apagado: initRes.status.total_apagado || 0,
      apagado_por_colecao: initRes.status.apagado_por_colecao || {},
      nada_a_apagar: initRes.nada_a_apagar || initRes.status.etapa === 'nada_a_apagar',
    }
  }

  // Um lote por chamada — mesmo padrão da consolidação/migração (sem estourar o timeout HTTP)
  const maxIterations = 500
  let iterations = 0
  let currentStatus = initRes.status

  while (iterations < maxIterations) {
    iterations++
    if (options?.signal?.aborted) throw new Error('Zeramento cancelado pelo usuário.')
    if (currentStatus.status === 'completed') break
    if (currentStatus.status === 'error') {
      throw new Error(currentStatus.erro || 'Falha no zeramento da base')
    }

    const stepRes = await stepZerarBase()
    currentStatus = stepRes.status
    if (options?.onProgress && currentStatus) options.onProgress(currentStatus)

    if (stepRes.done || stepRes.already_finished || currentStatus.status === 'completed') break
  }

  if (currentStatus.status !== 'completed') {
    throw new Error(currentStatus.erro || 'O zeramento da base não concluiu dentro do esperado')
  }

  return {
    status: currentStatus,
    total_apagado: currentStatus.total_apagado || 0,
    apagado_por_colecao: currentStatus.apagado_por_colecao || {},
    duracao_ms: currentStatus.started_at
      ? Math.max(
          0,
          new Date(currentStatus.finished_at || currentStatus.updated_at).getTime() -
            new Date(currentStatus.started_at).getTime(),
        )
      : 0,
  }
}
