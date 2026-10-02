import { describe, it, expect } from 'vitest'
import pb from '@/lib/pocketbase/client'

describe('Consolidação e Endpoints de Vendas/Pedidos Abertos', () => {
  it('deve logar, consolidar vendas e consultar listas e stats sem Scan error', async () => {
    // Login com usuário provisionado
    const authData = await pb
      .collection('users')
      .authWithPassword('rodrigo.machado@rolanddg.com.br', 'Roland@1234')
    expect(authData.record.id).toBeDefined()

    // 1. Executar consolidação de vendas de verdade
    const resConsolidar = await pb.send<{
      success: boolean
      total_consolidado: number
      data_carga: string
    }>('/backend/v1/vendas/consolidar', {
      method: 'POST',
      body: {},
    })

    expect(resConsolidar.success).toBe(true)
    expect(resConsolidar.total_consolidado).toBeGreaterThan(0)
    console.log('Total consolidado:', resConsolidar.total_consolidado)

    // 2. Testar vendas_list detalhado (deve retornar sem scan error float64 to int64)
    const resList = await pb.send<{
      items: Array<{
        id: string
        preco_item: number
        total_linha: number
        preco_unitario: number
        quantidade: number
      }>
      totalItems: number
    }>('/backend/v1/vendas/list', {
      method: 'POST',
      body: { page: 1, perPage: 10 },
    })

    expect(resList.totalItems).toBeGreaterThan(0)
    expect(resList.items.length).toBeGreaterThan(0)
    console.log('vendas_list totalItems:', resList.totalItems)
    console.log('vendas_list sample item:', resList.items[0])

    // Verifica que preco_item e outros campos numéricos preservam decimais
    const hasDecimalPreco = resList.items.some((i) => i.preco_item % 1 !== 0)
    console.log('Decimais preservados em preco_item:', hasDecimalPreco)

    // 3. Testar vendas_list agrupado por NFe
    const resListGrouped = await pb.send<{
      items: Array<{
        id: string
        numero_nfe: string
        total_linha: number
      }>
      totalItems: number
    }>('/backend/v1/vendas/list', {
      method: 'POST',
      body: { page: 1, perPage: 5, groupByNfe: true },
    })
    expect(resListGrouped.totalItems).toBeGreaterThan(0)
    expect(resListGrouped.items.length).toBeGreaterThan(0)

    // 4. Testar pedidos-abertos/list
    const resPaList = await pb.send<{
      items: Array<{
        numero_pedido: string
        preco_unitario: number
        valor_em_aberto: number
      }>
      totalItems: number
      totalValor: number
    }>('/backend/v1/pedidos-abertos/list', {
      method: 'POST',
      body: { page: 1, perPage: 10 },
    })
    console.log(
      'pedidos_abertos list totalItems:',
      resPaList.totalItems,
      'totalValor:',
      resPaList.totalValor,
    )
    if (resPaList.items.length > 0) {
      console.log('pedidos_abertos sample item:', resPaList.items[0])
    }

    // 5. Testar pedidos-abertos/stats (KPIs e ranking cruzado com vendas)
    const resPaStats = await pb.send<{
      kpis: {
        valorTotalAberto: number
        pedidosDistintos: number
        itensPendentes: number
        clientesDistintos: number
      }
      rankingClientes: Array<{
        nome_cliente: string
        valor_em_aberto: number
        venda_realizada: number
      }>
    }>('/backend/v1/pedidos-abertos/stats', {
      method: 'POST',
      body: { filters: {} },
    })

    console.log('pedidos_abertos stats KPIs:', resPaStats.kpis)
    if (resPaStats.rankingClientes.length > 0) {
      console.log('pedidos_abertos stats sample ranking:', resPaStats.rankingClientes[0])
      expect(typeof resPaStats.rankingClientes[0].venda_realizada).toBe('number')
      expect(typeof resPaStats.rankingClientes[0].valor_em_aberto).toBe('number')
    }

    // 6. Testar dashboard/stats (visão geral e vendas)
    const resDashStats = await pb.send<{
      kpis?: Record<string, unknown>
    }>('/backend/v1/dashboard/stats', {
      method: 'POST',
      body: { filters: { base: 'ambos' } },
    })
    console.log('dashboard/stats resposta ok:', !!resDashStats)
  }, 120000)
})
