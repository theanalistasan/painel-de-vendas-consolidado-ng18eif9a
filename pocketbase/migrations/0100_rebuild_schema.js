migrate(
  (app) => {
    // ========== COLLECTION: users (configure custom fields & rules) ==========
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          presentable: true,
          values: ['admin', 'user'],
          maxSelect: 1,
        }),
      )
    }

    if (!users.fields.getByName('active')) {
      users.fields.add(
        new BoolField({
          name: 'active',
          required: false,
        }),
      )
    }

    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    users.createRule = "@request.auth.id != ''"
    users.updateRule = "@request.auth.id != ''"
    users.deleteRule = "@request.auth.id != ''"
    app.save(users)

    // ========== COLLECTION: vendas ==========
    const vendas = new Collection({
      name: 'vendas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero_sap', type: 'text', required: false },
        { name: 'nfe', type: 'text', required: false },
        { name: 'data_lancamento', type: 'text', required: false },
        { name: 'codigo_cliente', type: 'text', required: false },
        { name: 'nome_cliente', type: 'text', required: false },
        { name: 'codigo_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'utilizacao', type: 'text', required: false },
        { name: 'nome_vendedor', type: 'text', required: false },
        { name: 'estado', type: 'text', required: false },
        { name: 'cidade', type: 'text', required: false },
        { name: 'tipo_documento', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'valor_total', type: 'number', required: false },
        { name: 'nome_consultor', type: 'text', required: false },
        { name: 'vendedor_cliente', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        // NetSales exclusive fields
        { name: 'grupo_cliente', type: 'text', required: false },
        { name: 'mercado', type: 'text', required: false },
        { name: 'usuario_emitente_pedido', type: 'text', required: false },
        { name: 'itms_grp_nam', type: 'text', required: false },
        { name: 'numero_documento_netsales', type: 'text', required: false },
        { name: 'preco_unitario', type: 'number', required: false },
        { name: 'total_nf_sem_frete', type: 'number', required: false },
        { name: 'total_nf_novo', type: 'number', required: false },
        { name: 'valor_liquido', type: 'number', required: false },
        { name: 'custo_total', type: 'number', required: false },
        { name: 'classificacao', type: 'text', required: false },
        { name: 'vendedor_revenda', type: 'text', required: false },
        // Base flags
        { name: 'tem_racnew', type: 'bool', required: false },
        { name: 'tem_netsales', type: 'bool', required: false },
        // Compatibility fields for hooks & queries
        { name: 'numero_nfe', type: 'text', required: false },
        { name: 'nf_entrega_futura', type: 'text', required: false },
        { name: 'ultima_data_vencimento', type: 'text', required: false },
        { name: 'docto_origem_destino', type: 'text', required: false },
        { name: 'data_origem_destino', type: 'text', required: false },
        { name: 'condicao_pagamento', type: 'text', required: false },
        { name: 'numero_linha', type: 'number', required: false },
        { name: 'descricao_item', type: 'text', required: false },
        { name: 'qty_kg_lt', type: 'number', required: false },
        { name: 'preco_item', type: 'number', required: false },
        { name: 'desconto_linha', type: 'number', required: false },
        { name: 'icms', type: 'number', required: false },
        { name: 'pis', type: 'number', required: false },
        { name: 'cofins', type: 'number', required: false },
        { name: 'ipi', type: 'number', required: false },
        { name: 'icms_partilha', type: 'number', required: false },
        { name: 'total_linha', type: 'number', required: false },
        { name: 'custo_item', type: 'number', required: false },
        { name: 'nome_filial', type: 'text', required: false },
        { name: 'conta', type: 'text', required: false },
        { name: 'usuario_emissor_pedido', type: 'text', required: false },
        // Autodate timestamps
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_vendas_nfe ON vendas(nfe)',
        'CREATE INDEX idx_vendas_data_lancamento ON vendas(data_lancamento)',
        'CREATE INDEX idx_vendas_nome_vendedor ON vendas(nome_vendedor)',
        'CREATE INDEX idx_vendas_estado ON vendas(estado)',
        'CREATE INDEX idx_vendas_grupo_item ON vendas(grupo_item)',
        'CREATE INDEX idx_vendas_vendedor_cliente ON vendas(vendedor_cliente)',
        'CREATE INDEX idx_vendas_tipo_documento ON vendas(tipo_documento)',
        'CREATE INDEX idx_vendas_utilizacao ON vendas(utilizacao)',
      ],
    })
    app.save(vendas)

    // ========== COLLECTION: racnew_bruta ==========
    const racnewBruta = new Collection({
      name: 'racnew_bruta',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero_sap', type: 'text', required: false },
        { name: 'nfe', type: 'text', required: false },
        { name: 'data_lancamento', type: 'text', required: false },
        { name: 'codigo_cliente', type: 'text', required: false },
        { name: 'nome_cliente', type: 'text', required: false },
        { name: 'codigo_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'utilizacao', type: 'text', required: false },
        { name: 'nome_vendedor', type: 'text', required: false },
        { name: 'estado', type: 'text', required: false },
        { name: 'cidade', type: 'text', required: false },
        { name: 'tipo_documento', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'valor_total', type: 'number', required: false },
        { name: 'nome_consultor', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        { name: 'vendedor_cliente', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(racnewBruta)

    // ========== COLLECTION: racnew (used by import & consolidate hooks) ==========
    const racnew = new Collection({
      name: 'racnew',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'tipo_documento', type: 'text', required: false },
        { name: 'nf_entrega_futura', type: 'text', required: false },
        { name: 'numero_sap', type: 'text', required: false },
        { name: 'numero_nfe', type: 'text', required: false },
        { name: 'nfe', type: 'text', required: false },
        { name: 'data_lancamento', type: 'text', required: false },
        { name: 'ultima_data_vencimento', type: 'text', required: false },
        { name: 'docto_origem_destino', type: 'text', required: false },
        { name: 'data_origem_destino', type: 'text', required: false },
        { name: 'condicao_pagamento', type: 'text', required: false },
        { name: 'codigo_cliente', type: 'text', required: false },
        { name: 'nome_cliente', type: 'text', required: false },
        { name: 'numero_linha', type: 'number', required: false },
        { name: 'codigo_item', type: 'text', required: false },
        { name: 'descricao_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'qty_kg_lt', type: 'number', required: false },
        { name: 'preco_item', type: 'number', required: false },
        { name: 'desconto_linha', type: 'number', required: false },
        { name: 'icms', type: 'number', required: false },
        { name: 'pis', type: 'number', required: false },
        { name: 'cofins', type: 'number', required: false },
        { name: 'ipi', type: 'number', required: false },
        { name: 'icms_partilha', type: 'number', required: false },
        { name: 'total_linha', type: 'number', required: false },
        { name: 'valor_total', type: 'number', required: false },
        { name: 'utilizacao', type: 'text', required: false },
        { name: 'nome_vendedor', type: 'text', required: false },
        { name: 'custo_item', type: 'number', required: false },
        { name: 'nome_filial', type: 'text', required: false },
        { name: 'conta', type: 'text', required: false },
        { name: 'estado', type: 'text', required: false },
        { name: 'cidade', type: 'text', required: false },
        { name: 'nome_consultor', type: 'text', required: false },
        { name: 'vendedor_cliente', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_racnew_unique ON racnew (numero_sap, numero_nfe, data_lancamento, codigo_cliente, codigo_item)',
        'CREATE INDEX idx_racnew_data_lancamento ON racnew (data_lancamento)',
        'CREATE INDEX idx_racnew_codigo_cliente ON racnew (codigo_cliente)',
        'CREATE INDEX idx_racnew_codigo_item ON racnew (codigo_item)',
        'CREATE INDEX idx_racnew_nome_vendedor ON racnew (nome_vendedor)',
      ],
    })
    app.save(racnew)

    // ========== COLLECTION: netsales_bruta ==========
    const netsalesBruta = new Collection({
      name: 'netsales_bruta',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'numero_sap', type: 'text', required: false },
        { name: 'nfe', type: 'text', required: false },
        { name: 'data_lancamento', type: 'text', required: false },
        { name: 'codigo_cliente', type: 'text', required: false },
        { name: 'nome_cliente', type: 'text', required: false },
        { name: 'codigo_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'utilizacao', type: 'text', required: false },
        { name: 'nome_vendedor', type: 'text', required: false },
        { name: 'estado', type: 'text', required: false },
        { name: 'cidade', type: 'text', required: false },
        { name: 'tipo_documento', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'valor_total', type: 'number', required: false },
        { name: 'nome_consultor', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        { name: 'vendedor_cliente', type: 'text', required: false },
        // NetSales exclusives
        { name: 'grupo_cliente', type: 'text', required: false },
        { name: 'mercado', type: 'text', required: false },
        { name: 'usuario_emitente_pedido', type: 'text', required: false },
        { name: 'itms_grp_nam', type: 'text', required: false },
        { name: 'numero_documento_netsales', type: 'text', required: false },
        { name: 'preco_unitario', type: 'number', required: false },
        { name: 'total_nf_sem_frete', type: 'number', required: false },
        { name: 'total_nf_novo', type: 'number', required: false },
        { name: 'valor_liquido', type: 'number', required: false },
        { name: 'custo_total', type: 'number', required: false },
        { name: 'classificacao', type: 'text', required: false },
        { name: 'vendedor_revenda', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(netsalesBruta)

    // ========== COLLECTION: netsales (used by import & consolidate hooks) ==========
    const netsales = new Collection({
      name: 'netsales',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'tipo', type: 'text', required: false },
        { name: 'tipo_documento', type: 'text', required: false },
        { name: 'codigo_cliente', type: 'text', required: false },
        { name: 'nome_cliente', type: 'text', required: false },
        { name: 'grupo_cliente', type: 'text', required: false },
        { name: 'mercado', type: 'text', required: false },
        { name: 'usuario_emissor', type: 'text', required: false },
        { name: 'usuario_emitente_pedido', type: 'text', required: false },
        { name: 'docdate', type: 'text', required: false },
        { name: 'data_lancamento', type: 'text', required: false },
        { name: 'chave_documento', type: 'text', required: false },
        { name: 'numero_sap', type: 'text', required: false },
        { name: 'descrip', type: 'text', required: false },
        { name: 'descricao_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'itms_grp_nam', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'codigo_item', type: 'text', required: false },
        { name: 'numero_documento', type: 'text', required: false },
        { name: 'numero_documento_netsales', type: 'text', required: false },
        { name: 'quantidade', type: 'number', required: false },
        { name: 'preco_unitario', type: 'number', required: false },
        { name: 'valor_mercadoria', type: 'number', required: false },
        { name: 'total_nf_sem_frete', type: 'number', required: false },
        { name: 'total_nf_novo', type: 'number', required: false },
        { name: 'valor_liquido', type: 'number', required: false },
        { name: 'valor_total', type: 'number', required: false },
        { name: 'serial', type: 'text', required: false },
        { name: 'nfe', type: 'text', required: false },
        { name: 'custo_total', type: 'number', required: false },
        { name: 'usage', type: 'text', required: false },
        { name: 'utilizacao', type: 'text', required: false },
        { name: 'classificacao', type: 'text', required: false },
        { name: 'revenda', type: 'text', required: false },
        { name: 'vendedor_revenda', type: 'text', required: false },
        { name: 'nome_vendedor', type: 'text', required: false },
        { name: 'municipio', type: 'text', required: false },
        { name: 'cidade', type: 'text', required: false },
        { name: 'estado', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_netsales_unique ON netsales (chave_documento, serial, docdate, codigo_cliente, codigo_item)',
        'CREATE INDEX idx_netsales_docdate ON netsales (docdate)',
        'CREATE INDEX idx_netsales_codigo_cliente ON netsales (codigo_cliente)',
        'CREATE INDEX idx_netsales_codigo_item ON netsales (codigo_item)',
      ],
    })
    app.save(netsales)

    // ========== COLLECTION: produtos_bruta ==========
    const produtosBruta = new Collection({
      name: 'produtos_bruta',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'codigo_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(produtosBruta)

    // ========== COLLECTION: produtos (used by import & consolidate hooks) ==========
    const produtos = new Collection({
      name: 'produtos',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'codigo_item', type: 'text', required: true },
        { name: 'descricao_item', type: 'text', required: false },
        { name: 'nome_item', type: 'text', required: false },
        { name: 'grupo_item', type: 'text', required: false },
        { name: 'ativo', type: 'text', required: false },
        { name: 'origem', type: 'text', required: false },
        { name: 'data_carga', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_produtos_codigo_item ON produtos (codigo_item)'],
    })
    app.save(produtos)

    // ========== COLLECTION: audit_logs ==========
    const auditLogs = new Collection({
      name: 'audit_logs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'user_id', type: 'text', required: false },
        { name: 'user_email', type: 'text', required: false },
        { name: 'user_name', type: 'text', required: false },
        { name: 'action', type: 'text', required: false },
        { name: 'entity_type', type: 'text', required: false },
        { name: 'entity_id', type: 'text', required: false },
        { name: 'details', type: 'text', required: false },
        { name: 'ip_address', type: 'text', required: false },
        { name: 'timestamp', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp)'],
    })
    app.save(auditLogs)
  },
  (app) => {},
)
