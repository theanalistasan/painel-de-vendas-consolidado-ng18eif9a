migrate(
  (app) => {
    // 0. Garante tabelas de resumo
    app
      .db()
      .newQuery(`
      CREATE TABLE IF NOT EXISTS resumo_vendas_mensal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano_mes TEXT NOT NULL,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        tem_netsales INTEGER DEFAULT 0,
        grupo_item TEXT,
        estado TEXT,
        nome_vendedor TEXT,
        vendedor_cliente TEXT,
        codigo_cliente TEXT,
        nome_cliente TEXT,
        tipo_documento TEXT,
        utilizacao TEXT,
        total_linha REAL DEFAULT 0,
        valor_liquido REAL DEFAULT 0,
        quantidade REAL DEFAULT 0,
        total_devolucao REAL DEFAULT 0,
        qtd_documentos INTEGER DEFAULT 0,
        qtd_itens INTEGER DEFAULT 0,
        created TEXT,
        updated TEXT
      );
    `)
      .execute()

    app
      .db()
      .newQuery(`
      CREATE TABLE IF NOT EXISTS resumo_clientes_ativos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano_mes TEXT NOT NULL,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        tem_netsales INTEGER DEFAULT 0,
        grupo_categoria TEXT NOT NULL,
        codigo_cliente TEXT NOT NULL,
        created TEXT,
        updated TEXT
      );
    `)
      .execute()

    app
      .db()
      .newQuery(`
      CREATE TABLE IF NOT EXISTS resumo_vendas_uf_regiao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano INTEGER NOT NULL,
        mes INTEGER NOT NULL,
        ano_mes TEXT NOT NULL,
        uf TEXT NOT NULL,
        regiao TEXT NOT NULL,
        tem_netsales INTEGER DEFAULT 0,
        total_linha REAL DEFAULT 0,
        qtd_documentos INTEGER DEFAULT 0,
        qtd_itens INTEGER DEFAULT 0,
        created TEXT,
        updated TEXT
      );
    `)
      .execute()
  },
  () => {},
)
