migrate(
  (app) => {
    // Cria a coleção pedidos_abertos com os 19 campos do SAP + campos derivados e de auditoria
    const collection = new Collection({
      name: 'pedidos_abertos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero_pedido', type: 'text', required: true },
        { name: 'data_pedido', type: 'date' },
        { name: 'codigo_cliente', type: 'text' },
        { name: 'nome_cliente', type: 'text' },
        { name: 'usuario_emitente', type: 'text' },
        { name: 'linha', type: 'number' },
        { name: 'codigo_item', type: 'text' },
        { name: 'descricao_item', type: 'text' },
        { name: 'grupo_item', type: 'text' },
        { name: 'qtd_solicitada', type: 'number' },
        { name: 'status_linha', type: 'text' },
        { name: 'qtd_aberto', type: 'number' },
        { name: 'em_estoque', type: 'number' },
        { name: 'em_transito', type: 'number' },
        { name: 'deposito', type: 'text' },
        { name: 'preco_unitario', type: 'number' },
        { name: 'desconto_percentual', type: 'number' },
        { name: 'preco_apos_desconto', type: 'number' },
        { name: 'status', type: 'text' },
        { name: 'valor_em_aberto', type: 'number' },
        { name: 'nome_canal', type: 'text' },
        { name: 'deploy', type: 'text' },
        { name: 'inside', type: 'text' },
        { name: 'origem', type: 'text' },
        { name: 'data_carga', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_pa_pedido_linha ON pedidos_abertos (numero_pedido, linha)',
        'CREATE INDEX idx_pa_codigo_cliente ON pedidos_abertos (codigo_cliente)',
        'CREATE INDEX idx_pa_nome_cliente ON pedidos_abertos (nome_cliente)',
        'CREATE INDEX idx_pa_data_pedido ON pedidos_abertos (data_pedido)',
        'CREATE INDEX idx_pa_codigo_item ON pedidos_abertos (codigo_item)',
        'CREATE INDEX idx_pa_status_linha ON pedidos_abertos (status_linha)',
        'CREATE INDEX idx_pa_nome_canal ON pedidos_abertos (nome_canal)',
        'CREATE INDEX idx_pa_deploy ON pedidos_abertos (deploy)',
        'CREATE INDEX idx_pa_inside ON pedidos_abertos (inside)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('pedidos_abertos')
      app.delete(collection)
    } catch (_) {}
  },
)
