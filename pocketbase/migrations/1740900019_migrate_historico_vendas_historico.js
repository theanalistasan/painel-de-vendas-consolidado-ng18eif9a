// 1740900019: Cria a coleção histórica `vendas_historico` (espelho exato de `vendas`)
// e move para ela todos os registros consolidados ANTERIORES à janela ativa
// (janela dinâmica: 1º de janeiro do ano anterior ao ano corrente — hoje jan/2025).
//
// - Esquema idêntico: mesmos campos, mesmos tipos, mesmos índices (prefixo idx_vh_).
// - Movimentação em LOTES (INSERT ... SELECT + DELETE por id), ~10 mil por passada,
//   para não estourar o limite de tempo da migration (310k+ registros).
// - Idempotente: a seleção é sempre por condição (data_lancamento < início da janela);
//   rodar de novo não move nem duplica nada (INSERT OR IGNORE por id).
// - Cópia RAW por SQL: preserva id, created, updated e todos os valores de todos os campos
//   (sem passar por Record/DynamicModel — evita o bug conhecido de int64 em decimais).
//
// NÃO altera o esquema de `vendas`, resumos pré-calculados, hook de consolidação,
// hooks de estatísticas/dashboard nem nada no frontend (etapa 1 do plano de segregação).

const BATCH_SIZE = 10000
const MAX_ROUNDS = 80 // folga: 80 x 10.000 = 800k registros no pior caso

// Campos da coleção `vendas` (ordem/tipos conforme o esquema real do backend)
const CAMPOS = [
  { nome: 'tipo_documento', tipo: 'text' },
  { nome: 'nf_entrega_futura', tipo: 'text' },
  { nome: 'numero_sap', tipo: 'text' },
  { nome: 'numero_nfe', tipo: 'text' },
  { nome: 'data_lancamento', tipo: 'date' },
  { nome: 'ultima_data_vencimento', tipo: 'date' },
  { nome: 'docto_origem_destino', tipo: 'text' },
  { nome: 'data_origem_destino', tipo: 'date' },
  { nome: 'condicao_pagamento', tipo: 'text' },
  { nome: 'codigo_cliente', tipo: 'text' },
  { nome: 'nome_cliente', tipo: 'text' },
  { nome: 'numero_linha', tipo: 'number' },
  { nome: 'codigo_item', tipo: 'text' },
  { nome: 'descricao_item', tipo: 'text' },
  { nome: 'quantidade', tipo: 'number' },
  { nome: 'qty_kg_lt', tipo: 'number' },
  { nome: 'preco_item', tipo: 'number' },
  { nome: 'desconto_linha', tipo: 'number' },
  { nome: 'icms', tipo: 'number' },
  { nome: 'pis', tipo: 'number' },
  { nome: 'cofins', tipo: 'number' },
  { nome: 'ipi', tipo: 'number' },
  { nome: 'icms_partilha', tipo: 'number' },
  { nome: 'total_linha', tipo: 'number' },
  { nome: 'utilizacao', tipo: 'text' },
  { nome: 'nome_vendedor', tipo: 'text' },
  { nome: 'custo_item', tipo: 'number' },
  { nome: 'nome_filial', tipo: 'text' },
  { nome: 'conta', tipo: 'text' },
  { nome: 'estado', tipo: 'text' },
  { nome: 'cidade', tipo: 'text' },
  { nome: 'grupo_cliente', tipo: 'text' },
  { nome: 'mercado', tipo: 'text' },
  { nome: 'usuario_emissor_pedido', tipo: 'text' },
  { nome: 'itms_grp_nam', tipo: 'text' },
  { nome: 'numero_documento_netsales', tipo: 'text' },
  { nome: 'preco_unitario', tipo: 'number' },
  { nome: 'total_nf_sem_frete', tipo: 'number' },
  { nome: 'total_nf_novo', tipo: 'number' },
  { nome: 'valor_liquido', tipo: 'number' },
  { nome: 'custo_total', tipo: 'number' },
  { nome: 'classificacao', tipo: 'text' },
  { nome: 'vendedor_revenda', tipo: 'text' },
  { nome: 'grupo_item', tipo: 'text' },
  { nome: 'vendedor_cliente', tipo: 'text' },
  { nome: 'origem', tipo: 'text' },
  { nome: 'data_carga', tipo: 'date' },
  { nome: 'tem_racnew', tipo: 'bool' },
  { nome: 'tem_netsales', tipo: 'bool' },
  { nome: 'status_cadastro', tipo: 'text' },
  { nome: 'tipo_pn', tipo: 'text' },
  { nome: 'tipo_cliente', tipo: 'text' },
]

const NOMES_COLUNAS = ['id'].concat(
  CAMPOS.map(function (c) {
    return c.nome
  }),
)
const NOMES_CAMPOS_DATA = NOMES_COLUNAS.join(', ')

const sqlType = function (tipo) {
  if (tipo === 'number') return 'REAL'
  if (tipo === 'bool') return 'INTEGER'
  return 'TEXT' // text, date, autodate
}

const inicioJanelaAtiva = function () {
  // Janela dinâmica: 1º de janeiro do ano anterior ao ano corrente (UTC do servidor).
  const ano = new Date().getUTCFullYear()
  return {
    iso: ano - 1 + '-01-01 00:00:00.000Z',
    descricao: '01/01/' + (ano - 1),
  }
}

const contar = function (app, sql, params) {
  // arrayOf + DynamicModel: obrigatório para .all() (ponteiro no Go)
  const rows = arrayOf(new DynamicModel({ c: '' }))
  const q = app.db().newQuery(sql)
  if (params) q.bind(params)
  q.all(rows)
  let n = 0
  if (rows.length > 0) n = parseInt(rows[0].c, 10)
  return isNaN(n) ? 0 : n
}

const criarColecaoHistorico = function (app) {
  // Idempotente: se a coleção já existir, não falha e não recria.
  try {
    const existente = app.findCollectionByNameOrId('vendas_historico')
    console.log('[vendas_historico] coleção já existe — mantendo esquema atual.')
    return
  } catch (_) {
    // não existe — cria abaixo
  }

  const fieldDefs = CAMPOS.map(function (c) {
    const def = { name: c.nome, type: c.tipo }
    if (c.tipo === 'autodate') {
      def.onCreate = c.nome === 'created'
      def.onUpdate = c.nome === 'updated'
    }
    return def
  })
  fieldDefs.push({ name: 'created', type: 'autodate', onCreate: true, onUpdate: false })
  fieldDefs.push({ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true })

  // Mesma lista de índices de `vendas`, renomeados com prefixo idx_vh_
  // (nomes/tabela entre crases, como o próprio PocketBase serializa)
  const INDICES = [
    ['idx_vh_vendedor_cliente', 'vendedor_cliente'],
    ['idx_vh_nome_vendedor', 'nome_vendedor'],
    ['idx_vh_estado', 'estado'],
    ['idx_vh_cidade', 'cidade'],
    ['idx_vh_utilizacao', 'utilizacao'],
    ['idx_vh_numero_nfe', 'numero_nfe'],
    ['idx_vh_data_lancamento', 'data_lancamento'],
    ['idx_vh_grupo_item', 'grupo_item'],
    ['idx_vh_tipo_documento', 'tipo_documento'],
    ['idx_vh_dt_grupo_tipo', 'data_lancamento, grupo_item, tipo_documento'],
    ['idx_vh_nome_cliente', 'nome_cliente'],
    ['idx_vh_tem_netsales', 'tem_netsales'],
    ['idx_vh_created', 'created'],
    ['idx_vh_data_desc', 'data_lancamento DESC'],
    ['idx_vh_grupo_data', 'grupo_item, data_lancamento'],
    ['idx_vh_nome_cliente_total', 'nome_cliente, total_linha'],
    ['idx_vh_data_lancamento_nfe', 'data_lancamento DESC, numero_nfe'],
    ['idx_vh_nfe_data', 'numero_nfe, data_lancamento DESC'],
    ['idx_vh_netsales_data', 'tem_netsales, data_lancamento DESC'],
    ['idx_vh_data_carga', 'data_carga'],
  ]
  const indexesVh = INDICES.map(function (ix) {
    return 'CREATE INDEX `' + ix[0] + '` ON `vendas_historico` (' + ix[1] + ')'
  })

  const collection = new Collection({
    name: 'vendas_historico',
    type: 'base',
    // Mesmas regras da coleção vendas (leitura para autenticados; escrita só superuser)
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: fieldDefs,
    indexes: indexesVh,
  })
  app.save(collection)
  console.log('[vendas_historico] coleção criada com o mesmo esquema de vendas.')
}

const moverLote = function (app, limite) {
  // 1) Copia o lote mais antigo preservando TODOS os campos (inclui id, created, updated)
  app
    .db()
    .newQuery(
      'INSERT OR IGNORE INTO vendas_historico (' +
        NOMES_CAMPOS_DATA +
        ') ' +
        'SELECT ' +
        NOMES_CAMPOS_DATA +
        ' FROM vendas ' +
        "WHERE data_lancamento IS NOT NULL AND TRIM(data_lancamento) != '' AND data_lancamento < {:limite} " +
        'ORDER BY data_lancamento LIMIT {:limite_lote}',
    )
    .bind({ limite: limite, limite_lote: BATCH_SIZE })
    .execute()

  // 2) Remove do mesmo conjunto exato de ids que acabou de ser copiado
  app
    .db()
    .newQuery(
      'DELETE FROM vendas WHERE id IN (' +
        'SELECT id FROM vendas ' +
        "WHERE data_lancamento IS NOT NULL AND TRIM(data_lancamento) != '' AND data_lancamento < {:limite} " +
        'ORDER BY data_lancamento LIMIT {:limite_lote})',
    )
    .bind({ limite: limite, limite_lote: BATCH_SIZE })
    .execute()
}

migrate(
  (app) => {
    const inicio = Date.now()
    const janela = inicioJanelaAtiva()
    const limite = janela.iso
    console.log(
      '[vendas_historico] início da janela ativa: ' +
        limite +
        ' (antes de ' +
        janela.descricao +
        ' vai para o histórico)',
    )

    criarColecaoHistorico(app)

    // Garante a tabela física (no-op se a coleção já a criou)
    const ddl = ['CREATE TABLE IF NOT EXISTS vendas_historico (id TEXT PRIMARY KEY']
    CAMPOS.forEach(function (c) {
      ddl.push(', ' + c.nome + ' ' + sqlType(c.tipo))
    })
    ddl.push(', created TEXT, updated TEXT)')
    app.db().newQuery(ddl.join('')).execute()

    const totalVendasAntes = contar(app, 'SELECT COUNT(*) AS c FROM vendas')
    const totalHistoricoAntes = contar(app, 'SELECT COUNT(*) AS c FROM vendas_historico')
    const qualificados = contar(
      app,
      "SELECT COUNT(*) AS c FROM vendas WHERE data_lancamento IS NOT NULL AND TRIM(data_lancamento) != '' AND data_lancamento < {:limite}",
      { limite: limite },
    )
    console.log(
      '[vendas_historico] antes: vendas=' +
        totalVendasAntes +
        ', vendas_historico=' +
        totalHistoricoAntes +
        ', qualificados para mover=' +
        qualificados,
    )

    if (qualificados === 0) {
      console.log('[vendas_historico] nada a mover — migration idempotente concluída.')
      return
    }

    let totalMovido = 0
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const antes = contar(
        app,
        "SELECT COUNT(*) AS c FROM vendas WHERE data_lancamento IS NOT NULL AND TRIM(data_lancamento) != '' AND data_lancamento < {:limite}",
        { limite: limite },
      )
      if (antes === 0) break

      moverLote(app, limite)

      const depois = contar(
        app,
        "SELECT COUNT(*) AS c FROM vendas WHERE data_lancamento IS NOT NULL AND TRIM(data_lancamento) != '' AND data_lancamento < {:limite}",
        { limite: limite },
      )
      const movidosNesteLote = antes - depois
      totalMovido += movidosNesteLote
      console.log(
        '[vendas_historico] lote ' +
          round +
          ': ' +
          movidosNesteLote +
          ' registros movidos (restam ' +
          depois +
          ')',
      )

      if (movidosNesteLote <= 0) {
        throw new Error(
          '[vendas_historico] lote ' +
            round +
            ' não progrediu (' +
            movidosNesteLote +
            ' movidos); abortando para nova tentativa.',
        )
      }
      if (depois === 0) break
    }

    const restantes = contar(
      app,
      "SELECT COUNT(*) AS c FROM vendas WHERE data_lancamento IS NOT NULL AND TRIM(data_lancamento) != '' AND data_lancamento < {:limite}",
      { limite: limite },
    )
    const totalVendasDepois = contar(app, 'SELECT COUNT(*) AS c FROM vendas')
    const totalHistoricoDepois = contar(app, 'SELECT COUNT(*) AS c FROM vendas_historico')
    console.log(
      '[vendas_historico] TOTAL MOVIDO: ' +
        totalMovido +
        ' registros (antes de ' +
        janela.descricao +
        ')',
    )
    console.log(
      '[vendas_historico] depois: vendas=' +
        totalVendasDepois +
        ', vendas_historico=' +
        totalHistoricoDepois +
        ', restantes fora da janela em vendas=' +
        restantes,
    )
    console.log('[vendas_historico] duração: ' + (Date.now() - inicio) + 'ms')
    if (restantes > 0) {
      throw new Error(
        '[vendas_historico] ainda restam ' +
          restantes +
          ' registros fora da janela em vendas; rodar novamente a migration.',
      )
    }
  },
  (app) => {
    // Reversão: devolve os registros para `vendas` em lotes e só então remove a coleção
    const janela = inicioJanelaAtiva()
    const limite = janela.iso
    try {
      app
        .db()
        .newQuery('CREATE TABLE IF NOT EXISTS vendas_historico (id TEXT PRIMARY KEY)')
        .execute()
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const antes = contar(
          app,
          'SELECT COUNT(*) AS c FROM vendas_historico WHERE data_lancamento < {:limite}',
          { limite: limite },
        )
        if (antes === 0) break
        app
          .db()
          .newQuery(
            'INSERT OR IGNORE INTO vendas (' +
              NOMES_CAMPOS_DATA +
              ') ' +
              'SELECT ' +
              NOMES_CAMPOS_DATA +
              ' FROM vendas_historico WHERE data_lancamento < {:limite} ' +
              'ORDER BY data_lancamento LIMIT {:limite_lote}',
          )
          .bind({ limite: limite, limite_lote: BATCH_SIZE })
          .execute()
        app
          .db()
          .newQuery(
            'DELETE FROM vendas_historico WHERE id IN (' +
              'SELECT id FROM vendas_historico WHERE data_lancamento < {:limite} ORDER BY data_lancamento LIMIT {:limite_lote})',
          )
          .bind({ limite: limite, limite_lote: BATCH_SIZE })
          .execute()
      }
    } catch (err) {
      console.error('[vendas_historico] falha ao devolver registros no down: ' + err)
    }
    try {
      const col = app.findCollectionByNameOrId('vendas_historico')
      const restantes = contar(app, 'SELECT COUNT(*) AS c FROM vendas_historico')
      if (restantes > 0) {
        console.error(
          '[vendas_historico] down NÃO removeu a coleção: ainda há ' +
            restantes +
            ' registros (dados preservados).',
        )
      } else {
        app.delete(col)
      }
    } catch (_) {}
  },
)
