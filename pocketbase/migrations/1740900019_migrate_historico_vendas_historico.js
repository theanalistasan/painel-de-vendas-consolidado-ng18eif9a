// 1740900019 — PARTE ESTRUTURAL (rápida): cria a coleção histórica
// `vendas_historico` como espelho exato de `vendas` (mesmos campos, mesmos tipos,
// mesmos índices com prefixo idx_vh_) + índice em data_lancamento.
//
// NÃO move nenhum registro aqui: a movimentação de dados (< 2025) acontece
// em lotes curtos, sob controle do usuário, via endpoints do hook
// `pocketbase/hooks/migrar_historico.js` (POST /backend/v1/vendas/migrar-historico/*),
// reutilizando o mesmo padrão start/status/step da consolidação.
//
// Reescrito em duas partes porque a versão anterior fazia a movimentação de
// ~309.951 registros DENTRO da migration e estourava a janela de confirmação
// do apply ("Skip Cloud migrations not confirmed").
//
// Cópia RAW por SQL preserva id, created, updated e todos os valores
// (sem passar por Record/DynamicModel — evita o bug conhecido de int64 em decimais).

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

const sqlType = function (tipo) {
  if (tipo === 'number') return 'REAL'
  if (tipo === 'bool') return 'INTEGER'
  return 'TEXT' // text, date, autodate
}

migrate(
  (app) => {
    const inicio = Date.now()

    // Idempotente: se a coleção já existir, não falha e não recria.
    try {
      app.findCollectionByNameOrId('vendas_historico')
      console.log('[vendas_historico] coleção já existe — mantendo esquema atual.')
    } catch (_) {
      const fieldDefs = CAMPOS.map(function (c) {
        return { name: c.nome, type: c.tipo }
      })
      fieldDefs.push({ name: 'created', type: 'autodate', onCreate: true, onUpdate: false })
      fieldDefs.push({ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true })

      // Mesma lista de índices de `vendas`, renomeados com prefixo idx_vh_
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

    // Garante a tabela física (no-op se a coleção já a criou)
    const ddl = ['CREATE TABLE IF NOT EXISTS vendas_historico (id TEXT PRIMARY KEY']
    CAMPOS.forEach(function (c) {
      ddl.push(', ' + c.nome + ' ' + sqlType(c.tipo))
    })
    ddl.push(', created TEXT, updated TEXT)')
    app.db().newQuery(ddl.join('')).execute()

    // Índice dedicado em data_lancamento (exigência da etapa 1)
    try {
      app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_vh_data_lancamento ON vendas_historico (data_lancamento)',
        )
        .execute()
    } catch (_) {}

    console.log(
      '[vendas_historico] migration estrutural concluída em ' + (Date.now() - inicio) + 'ms.',
    )
  },
  (app) => {
    // Reversão: remove a coleção APENAS se estiver vazia (dados preservados caso contrário).
    try {
      const rows = arrayOf(new DynamicModel({ c: '' }))
      app.db().newQuery('SELECT COUNT(*) AS c FROM vendas_historico').all(rows)
      const restantes = rows.length > 0 ? parseInt(rows[0].c, 10) || 0 : 0
      if (restantes > 0) {
        console.error(
          '[vendas_historico] down NÃO removeu a coleção: ainda há ' +
            restantes +
            ' registros (dados preservados).',
        )
        return
      }
      const col = app.findCollectionByNameOrId('vendas_historico')
      app.delete(col)
    } catch (_) {}
  },
)
