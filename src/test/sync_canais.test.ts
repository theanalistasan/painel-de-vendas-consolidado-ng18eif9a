import { describe, it, expect } from 'vitest'
import pb from '@/lib/pocketbase/client'

describe('Sincronização de Canais e Limpeza de Órfãos da Base Única de Canais', () => {
  it('deve autenticar e disparar POST /backend/v1/canais/sync', async () => {
    // Login com usuário provisionado no backend
    const authData = await pb
      .collection('users')
      .authWithPassword('rodrigo.machado@rolanddg.com.br', 'Roland@1234')
    expect(authData.record.id).toBeDefined()

    // Disparar a sincronização
    const resSync = await pb.send<{
      success: boolean
      orfaosRemovidos?: number
      revendasLidas?: number
      contatosLidos?: number
      vinculosReconciliados?: number
      message?: string
    }>('/backend/v1/canais/sync', {
      method: 'POST',
      body: {},
    })

    console.log('Resultado da sincronização:', resSync)
    expect(resSync.success).toBe(true)
    expect(typeof resSync.vinculosReconciliados).toBe('number')
    // Verifica que Paloma não consta mais vinculada como inside em nenhum registro
    const palomaRecords = await pb.collection('canais_clientes').getList(1, 10, {
      filter: 'inside ~ "Paloma" || inside ~ "PALOMA"',
    })
    expect(palomaRecords.totalItems).toBe(0)
  }, 120000)
})
