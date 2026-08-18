// Torna nullable (required = false) TODOS os campos da NetSales que vivem na
// collection `vendas`, além dos campos numéricos da RacNew que podem vir vazios
// do CSV de importação e que também são copiados para `vendas` na consolidação.
//
// Contexto: a migração 0003 tentou flexibilizar os campos percorrendo
// `collection.fields.forEach(...)` e atribuindo `field.required = false`
// diretamente. No JSVM do PocketBase essa iteração opera sobre CÓPIAS dos
// fields, então a mutação nunca era persistida e as colunas SQLite mantinham
// o NOT NULL original — daí o erro `NOT NULL constraint failed: vendas.classificacao`
// durante a consolidação (INSERT ... SELECT com LEFT JOIN que gera NULL quando
// não há match na NetSales).
//
// Aqui usamos `col.fields.getByName(name)` (referência real ao field da lista)
// antes de `app.save(col)`, o que efetivamente reemite o ALTER TABLE e remove
// o NOT NULL da coluna física no SQLite.
migrate(
  (app) => {
    // Campos exclusivos da NetSales que vivem em `vendas`.
    const netsalesFields = [
      'classificacao',
      'valor_liquido',
      'custo_total',
      'grupo_cliente',
      'mercado',
      'usuario_emissor_pedido',
      'itms_grp_nam',
      'numero_documento_netsales',
      'preco_unitario',
      'total_nf_sem_frete',
      'total_nf_novo',
      'vendedor_revenda',
    ]

    // Campos numéricos da RacNew (copiados para `vendas`) que podem vir vazios
    // do CSV e virar NULL no INSERT da consolidação.
    const racnewNumericFields = [
      'preco_item',
      'desconto_linha',
      'icms',
      'pis',
      'cofins',
      'ipi',
      'icms_partilha',
      'custo_item',
      'qty_kg_lt',
    ]

    const targetFields = netsalesFields.concat(racnewNumericFields)

    // 1. `vendas` — torna todos os campos alvo nullable.
    const vendas = app.findCollectionByNameOrId('vendas')
    let vendasChanged = false
    targetFields.forEach((name) => {
      const f = vendas.fields.getByName(name)
      if (f && f.required) {
        f.required = false
        vendasChanged = true
      }
    })
    if (vendasChanged) {
      app.save(vendas)
    }

    // 2. `racnew` — garante que os campos numéricos que podem vir vazios
    //    também sejam nullable na origem.
    const racnew = app.findCollectionByNameOrId('racnew')
    let racnewChanged = false
    racnewNumericFields.forEach((name) => {
      const f = racnew.fields.getByName(name)
      if (f && f.required) {
        f.required = false
        racnewChanged = true
      }
    })
    if (racnewChanged) {
      app.save(racnew)
    }

    // 3. `netsales` — por segurança, garante que os campos de origem também
    //    sejam nullable (permite importar linhas parciais da NetSales).
    const netsales = app.findCollectionByNameOrId('netsales')
    let netsalesChanged = false
    netsalesFields.forEach((name) => {
      const f = netsales.fields.getByName(name)
      if (f && f.required) {
        f.required = false
        netsalesChanged = true
      }
    })
    if (netsalesChanged) {
      app.save(netsales)
    }
  },
  (app) => {
    // Down migration — sem reversão (manter nullable é o estado desejado).
  },
)
