/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // 1. Marcar o produto 'SERVICOS' como ativo = 'Não' na tabela produtos
    try {
      app
        .db()
        .newQuery("UPDATE produtos SET ativo = 'Não' WHERE codigo_item = 'SERVICOS'")
        .execute()
    } catch (err) {
      console.warn('Aviso ao desativar SERVICOS na tabela produtos:', err)
    }

    // 2. Definir o agente nativo Skip Cloud para o Painel de Vendas Consolidado
    $ai.agents.define(app, {
      slug: 'assistente-vendas',
      name: 'Assistente Roland DG',
      description:
        'Assistente inteligente que responde dúvidas sobre dados de vendas, pedidos em aberto, estoque, canais e metas do Painel de Vendas Consolidado da Roland DG Brasil.',
      systemPrompt: `Você é o Assistente Virtual Inteligente do Painel de Vendas Consolidado da Roland DG Brasil.
Seu objetivo é responder a perguntas de usuários autorizados com base EXCLUSIVAMENTE nos dados reais das coleções do sistema:
- vendas (vendas consolidadas históricas, valores, clientes, itens, estados, notas fiscais)
- pedidos_abertos (pedidos atualmente pendentes, clientes, canais, quantidades, valores em aberto, estoque/trânsito)
- estoque_sap (posição de estoque atual, em trânsito, custos, itens)
- canais_clientes (cadastro de revendas e canais, deploy AGIS/Roland, inside sales)
- canais_metas (metas mensais por canal e período)
- produtos (catálogo de produtos)

DIRETRIZES FUNDAMENTAIS:
1. Responda SEMPRE em Português do Brasil com tom corporativo, prestativo, claro e objetivo.
2. IMPORTANTE: O produto com código 'SERVICOS' ("Servicos Roland") está desabilitado na aplicação e deve ser desconsiderado das visões de faturamento de produtos e pedidos.
3. Este painel e suas ferramentas são de consulta e somente leitura em relação à origem. Deixe claro, caso perguntado sobre criar ou alterar pedidos/estoque, que você não altera dados e os registros são sincronizados/somente leitura.
4. Formate valores monetários em Reais (ex.: R$ 1.250.000,00) e quantidades com pontuação brasileira.
5. Use as ferramentas de consulta sobre as coleções para verificar dados concretos antes de responder afirmações sobre números e totais.
6. Se não encontrar registros suficientes para uma resposta definitiva, informe com transparência o que foi encontrado.`,
      tier: 'fast',
      tools: [
        { collection: 'vendas', perms: { list: true, read: true } },
        { collection: 'pedidos_abertos', perms: { list: true, read: true } },
        { collection: 'estoque_sap', perms: { list: true, read: true } },
        { collection: 'canais_clientes', perms: { list: true, read: true } },
        { collection: 'canais_metas', perms: { list: true, read: true } },
        { collection: 'produtos', perms: { list: true, read: true } },
      ],
    })
  },
  (app) => {
    try {
      $ai.agents.delete(app, 'assistente-vendas')
    } catch (_) {}
    try {
      app
        .db()
        .newQuery("UPDATE produtos SET ativo = 'Sim' WHERE codigo_item = 'SERVICOS'")
        .execute()
    } catch (_) {}
  },
)
