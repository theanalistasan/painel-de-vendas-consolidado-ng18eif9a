import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh, ensureAuthToken } from '@/lib/pocketbase/auth-session'
import type { CanalCliente } from '@/types/sales'

export interface CanaisClientesListResult {
  items: CanalCliente[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export interface FetchCanaisClientesParams {
  page?: number
  perPage?: number
  search?: string
  canal?: string
  deploy?: string
  inside?: string
  ehCanal?: string // 'all' | 'true' | 'false'
  sort?: string
}

export interface CanaisIndicadores {
  totalRegistros: number
  totalCanais: number
  totalClientesUnicos: number
  totalContatos: number
  porNomeCanal: Array<{
    nome: string
    deploy: string
    totalRegistros: number
    totalClientes: number
  }>
  porDeploy: Array<{
    deploy: string
    totalRegistros: number
    totalClientes: number
    percentual: number
  }>
  porInside: Array<{
    inside: string
    totalRegistros: number
    totalClientes: number
    percentual: number
  }>
}

export interface CanalClientePayload {
  eh_canal: boolean
  deploy: string
  nome_canal: string
  nome_cliente: string
  status?: string
  serie?: string
  codigo_cliente: string
  contato?: string
  cargo?: string
  email?: string
  telefone?: string
  segmento?: string
  inside?: string
}

/**
 * Busca registros da coleção canais_clientes com filtros e paginação
 */
export async function fetchCanaisClientes(
  params: FetchCanaisClientesParams = {},
): Promise<CanaisClientesListResult> {
  const page = params.page || 1
  const perPage = params.perPage || 20

  const filterParts: string[] = []

  if (params.search && params.search.trim()) {
    const term = params.search.trim().replace(/['"\\]/g, '')
    if (term) {
      filterParts.push(
        `(nome_canal ~ '${term}' || nome_cliente ~ '${term}' || codigo_cliente ~ '${term}' || contato ~ '${term}' || email ~ '${term}')`,
      )
    }
  }

  if (params.canal && params.canal !== '__all') {
    const canalClean = params.canal.replace(/['"\\]/g, '')
    filterParts.push(`nome_canal = '${canalClean}'`)
  }

  if (params.deploy && params.deploy !== '__all') {
    const depClean = params.deploy.replace(/['"\\]/g, '')
    if (depClean === 'Nenhum') {
      filterParts.push("(deploy = '' || deploy = null || deploy = 'Nenhum')")
    } else {
      filterParts.push(`deploy ~ '${depClean}'`)
    }
  }

  if (params.inside && params.inside !== '__all') {
    const insideClean = params.inside.replace(/['"\\]/g, '')
    filterParts.push(`inside = '${insideClean}'`)
  }

  if (params.ehCanal === 'true') {
    filterParts.push('eh_canal = true')
  } else if (params.ehCanal === 'false') {
    filterParts.push('eh_canal = false')
  }

  const filter = filterParts.length > 0 ? filterParts.join(' && ') : undefined
  const sort = params.sort || 'nome_canal,nome_cliente'

  await ensureAuthToken()

  const runQuery = async () => {
    return Promise.race([
      pb.collection<CanalCliente>('canais_clientes').getList(page, perPage, {
        filter,
        sort,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Tempo limite excedido ao buscar registros de canais.')),
          15000,
        ),
      ),
    ])
  }

  let result
  try {
    result = await runQuery()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (!refreshed || !pb.authStore.isValid) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }
      result = await runQuery()
    } else {
      throw err
    }
  }

  return {
    items: result.items || [],
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  }
}

/**
 * Calcula indicadores consolidados de canais_clientes:
 * - Indicadores por Nome do Canal
 * - Indicadores por Canal de Faturamento (Deploy)
 * - Indicadores por Inside
 */
export async function fetchCanaisIndicadores(): Promise<CanaisIndicadores> {
  await ensureAuthToken()

  // Buscar todos os registros com os campos necessários para resumir
  const runQuery = async () => {
    return Promise.race([
      pb.collection<CanalCliente>('canais_clientes').getFullList({
        fields: 'id,eh_canal,deploy,nome_canal,nome_cliente,codigo_cliente,contato,inside',
        sort: 'nome_canal,nome_cliente',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Tempo limite excedido ao calcular indicadores de canais.')),
          20000,
        ),
      ),
    ])
  }

  let allRecords: CanalCliente[] = []
  try {
    allRecords = await runQuery()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        allRecords = await runQuery()
      } else {
        throw new Error('Sessão expirada. Faça login novamente.')
      }
    } else {
      throw err
    }
  }

  const canaisMap = new Map<
    string,
    {
      nome: string
      deploy: string
      totalRegistros: number
      clientesSet: Set<string>
    }
  >()

  const deployMap = new Map<
    string,
    {
      deploy: string
      totalRegistros: number
      clientesSet: Set<string>
    }
  >()

  const insideMap = new Map<
    string,
    {
      inside: string
      totalRegistros: number
      clientesSet: Set<string>
    }
  >()

  const allClientesSet = new Set<string>()
  let totalContatos = 0

  for (const r of allRecords) {
    const nomeCanal = (r.nome_canal || 'Sem Canal').trim()
    const rawDeploy = (r.deploy || '').trim().toUpperCase()
    let deployNormalized = 'Nenhum'
    if (rawDeploy.includes('AGIS')) {
      deployNormalized = 'AGIS'
    } else if (rawDeploy.includes('ROLAND')) {
      deployNormalized = 'Roland'
    } else if (rawDeploy) {
      deployNormalized = r.deploy.trim()
    }

    const inside = (r.inside || '').trim().toUpperCase() || 'SEM INSIDE'
    const codOuNomeCli = (r.codigo_cliente || r.nome_cliente || '').trim()

    if (codOuNomeCli) {
      allClientesSet.add(codOuNomeCli)
    }
    if (r.contato && r.contato.trim()) {
      totalContatos++
    }

    // Agrupamento por Nome do Canal
    if (!canaisMap.has(nomeCanal)) {
      canaisMap.set(nomeCanal, {
        nome: nomeCanal,
        deploy: deployNormalized,
        totalRegistros: 0,
        clientesSet: new Set<string>(),
      })
    }
    const canalEntry = canaisMap.get(nomeCanal)!
    canalEntry.totalRegistros++
    if (codOuNomeCli) canalEntry.clientesSet.add(codOuNomeCli)
    if (canalEntry.deploy === 'Nenhum' && deployNormalized !== 'Nenhum') {
      canalEntry.deploy = deployNormalized
    }

    // Agrupamento por Deploy
    if (!deployMap.has(deployNormalized)) {
      deployMap.set(deployNormalized, {
        deploy: deployNormalized,
        totalRegistros: 0,
        clientesSet: new Set<string>(),
      })
    }
    const deployEntry = deployMap.get(deployNormalized)!
    deployEntry.totalRegistros++
    if (codOuNomeCli) deployEntry.clientesSet.add(codOuNomeCli)

    // Agrupamento por Inside
    if (!insideMap.has(inside)) {
      insideMap.set(inside, {
        inside,
        totalRegistros: 0,
        clientesSet: new Set<string>(),
      })
    }
    const insideEntry = insideMap.get(inside)!
    insideEntry.totalRegistros++
    if (codOuNomeCli) insideEntry.clientesSet.add(codOuNomeCli)
  }

  const totalRegistros = allRecords.length

  const porNomeCanal = Array.from(canaisMap.values())
    .map((c) => ({
      nome: c.nome,
      deploy: c.deploy,
      totalRegistros: c.totalRegistros,
      totalClientes: c.clientesSet.size,
    }))
    .sort((a, b) => b.totalClientes - a.totalClientes || a.nome.localeCompare(b.nome))

  const porDeploy = ['AGIS', 'Roland', 'Nenhum']
    .map((dep) => {
      const entry = deployMap.get(dep) || {
        deploy: dep,
        totalRegistros: 0,
        clientesSet: new Set<string>(),
      }
      return {
        deploy: dep,
        totalRegistros: entry.totalRegistros,
        totalClientes: entry.clientesSet.size,
        percentual:
          totalRegistros > 0 ? Math.round((entry.totalRegistros / totalRegistros) * 100) : 0,
      }
    })
    .sort((a, b) => b.totalRegistros - a.totalRegistros)

  // Outros deploys que não estejam em AGIS, Roland, Nenhum
  for (const [dep, entry] of deployMap.entries()) {
    if (!['AGIS', 'Roland', 'Nenhum'].includes(dep)) {
      porDeploy.push({
        deploy: dep,
        totalRegistros: entry.totalRegistros,
        totalClientes: entry.clientesSet.size,
        percentual:
          totalRegistros > 0 ? Math.round((entry.totalRegistros / totalRegistros) * 100) : 0,
      })
    }
  }

  const porInside = Array.from(insideMap.values())
    .map((ins) => ({
      inside: ins.inside,
      totalRegistros: ins.totalRegistros,
      totalClientes: ins.clientesSet.size,
      percentual: totalRegistros > 0 ? Math.round((ins.totalRegistros / totalRegistros) * 100) : 0,
    }))
    .sort((a, b) => b.totalRegistros - a.totalRegistros)

  return {
    totalRegistros,
    totalCanais: canaisMap.size,
    totalClientesUnicos: allClientesSet.size,
    totalContatos,
    porNomeCanal,
    porDeploy,
    porInside,
  }
}

/**
 * Cria um novo registro na coleção canais_clientes
 */
export async function createCanalCliente(payload: CanalClientePayload): Promise<CanalCliente> {
  await ensureAuthToken()

  // Normaliza o deploy conforme padrão Roland DG
  let deployNorm = payload.deploy.trim()
  if (deployNorm.toUpperCase().includes('AGIS')) {
    deployNorm = 'AGIS'
  } else if (deployNorm.toUpperCase().includes('ROLAND')) {
    deployNorm = 'ROLAND'
  }

  const recordData = {
    eh_canal: payload.eh_canal,
    deploy: deployNorm,
    nome_canal: (payload.nome_canal || '').trim(),
    nome_cliente: (payload.nome_cliente || '').trim(),
    status: (payload.status || 'Ativo').trim(),
    serie: (payload.serie || 'Manual').trim(),
    codigo_cliente: (payload.codigo_cliente || '').trim().toUpperCase(),
    contato: (payload.contato || '').trim(),
    cargo: (payload.cargo || '').trim(),
    email: (payload.email || '').trim().toLowerCase(),
    telefone: (payload.telefone || '').trim(),
    segmento: (payload.segmento || '').trim(),
    inside: (payload.inside || '').trim().toUpperCase(),
    origem: 'Cadastro Manual',
    data_carga: new Date().toISOString(),
  }

  const run = () => pb.collection<CanalCliente>('canais_clientes').create(recordData)

  try {
    return await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        return await run()
      }
      throw new Error('Sessão expirada. Faça login novamente.')
    }
    throw err
  }
}

/**
 * Atualiza um registro existente na coleção canais_clientes
 */
export async function updateCanalCliente(
  id: string,
  payload: Partial<CanalClientePayload>,
): Promise<CanalCliente> {
  await ensureAuthToken()

  const recordData: Record<string, unknown> = {}
  if (payload.eh_canal !== undefined) recordData.eh_canal = payload.eh_canal
  if (payload.deploy !== undefined) {
    let deployNorm = payload.deploy.trim()
    if (deployNorm.toUpperCase().includes('AGIS')) {
      deployNorm = 'AGIS'
    } else if (deployNorm.toUpperCase().includes('ROLAND')) {
      deployNorm = 'ROLAND'
    }
    recordData.deploy = deployNorm
  }
  if (payload.nome_canal !== undefined) recordData.nome_canal = payload.nome_canal.trim()
  if (payload.nome_cliente !== undefined) recordData.nome_cliente = payload.nome_cliente.trim()
  if (payload.status !== undefined) recordData.status = payload.status.trim()
  if (payload.serie !== undefined) recordData.serie = payload.serie.trim()
  if (payload.codigo_cliente !== undefined) {
    recordData.codigo_cliente = payload.codigo_cliente.trim().toUpperCase()
  }
  if (payload.contato !== undefined) recordData.contato = payload.contato.trim()
  if (payload.cargo !== undefined) recordData.cargo = payload.cargo.trim()
  if (payload.email !== undefined) recordData.email = payload.email.trim().toLowerCase()
  if (payload.telefone !== undefined) recordData.telefone = payload.telefone.trim()
  if (payload.segmento !== undefined) recordData.segmento = payload.segmento.trim()
  if (payload.inside !== undefined) recordData.inside = payload.inside.trim().toUpperCase()

  const run = () => pb.collection<CanalCliente>('canais_clientes').update(id, recordData)

  try {
    return await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        return await run()
      }
      throw new Error('Sessão expirada. Faça login novamente.')
    }
    throw err
  }
}

/**
 * Exclui um registro da coleção canais_clientes
 */
export async function deleteCanalCliente(id: string): Promise<void> {
  await ensureAuthToken()

  const run = () => pb.collection('canais_clientes').delete(id)

  try {
    await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        await run()
        return
      }
      throw new Error('Sessão expirada. Faça login novamente.')
    }
    throw err
  }
}
