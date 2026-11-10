// Importador NetSales_v4 — BASE ÚNICA DE VENDAS (decisão Silvio)
// Substitui definitivamente os importadores RacNew e NetSales antigos.
// Endpoint: POST /backend/v1/import/netsales_v4
// - Cabeçalhos comparados de forma tolerante (trim + case/acento-insensitive).
// - Números BR (1.642,96) e datas DD/MM/AAAA (13/04/2021) convertidos.
// - Roteamento pela janela dinâmica de 3 anos: dentro -> netsales (staging da
//   consolidação); antes da janela -> vendas_historico. Modo 'historico' manda
//   TUDO direto ao histórico.
// - Deduplicação: chave_documento + serial + docdate + codigo_cliente + codigo_item.
// - origem = 'NetSales_v4'.
routerAdd(
  'POST',
  '/backend/v1/import/netsales_v4',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    // Helper da janela dinâmica inline (regra: dois anos anteriores + ano atual = 3 anos)
    const getJanelaDinamica = () => {
      const anoFim = new Date().getFullYear()
      const anoInicio = anoFim - 2
      return {
        anoInicio,
        anoFim,
        inicioISO: `${anoInicio}-01-01`,
        fimISO: `${anoFim}-12-31`,
      }
    }

    const isForaDaJanela = (dataLancamento) => {
      if (!dataLancamento || typeof dataLancamento !== 'string') return false
      const d = dataLancamento.trim().slice(0, 10)
      if (d.length < 10) return false
      const { inicioISO } = getJanelaDinamica()
      return d < inicioISO
    }

    // Normaliza cabeçalhos: trim, minúsculas, sem acentos, não-alfanumérico -> "_"
    const normKey = (s) => {
      return (s === undefined || s === null ? '' : s.toString())
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    }

    // Constrói um mapa de chaves normalizadas -> valor (primeira ocorrência vence)
    const buildRowMap = (row) => {
      const m = {}
      for (const k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue
        const nk = normKey(k)
        if (!nk) continue
        if (!(nk in m) && row[k] !== undefined && row[k] !== null && row[k] !== '') {
          m[nk] = row[k]
        }
      }
      return m
    }

    // Busca tolerante: tenta todos os apelidos normalizados em ordem
    const pick = (m, names) => {
      for (let i = 0; i < names.length; i++) {
        const nk = normKey(names[i])
        if (nk in m) return m[nk]
      }
      return ''
    }

    const modo = (body.modo || 'atual').toString().trim()
    const modoHistorico = modo === 'historico'
    const janela = getJanelaDinamica()

    if (rows.length === 0) {
      return e.json(400, {
        message: 'Nenhum registro enviado',
        importados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: ['Nenhum dado encontrado no payload'],
      })
    }

    const netsalesCol = $app.findCollectionByNameOrId('netsales')
    const historicoCol = $app.findCollectionByNameOrId('vendas_historico')
    const nowIso = new Date().toISOString()

    // Enriquecimento Tipos de Cliente (cruzamento com Código do PN)
    const tiposClienteMap = {}
    try {
      const tcRows = arrayOf(
        new DynamicModel({
          codigo_pn: '',
          status_cadastro: '',
          tipo_pn: '',
          tipo_cliente: '',
        }),
      )
      $app
        .db()
        .newQuery(
          'SELECT codigo_pn, status_cadastro, tipo_pn, tipo_cliente FROM tipos_cliente WHERE codigo_pn IS NOT NULL AND codigo_pn != ""',
        )
        .all(tcRows)
      for (let k = 0; k < tcRows.length; k++) {
        const cPn = (tcRows[k].codigo_pn || '').trim().toUpperCase()
        if (cPn) {
          tiposClienteMap[cPn] = {
            status_cadastro: (tcRows[k].status_cadastro || '').trim(),
            tipo_pn: (tcRows[k].tipo_pn || '').trim(),
            tipo_cliente: (tcRows[k].tipo_cliente || '').trim(),
          }
        }
      }
    } catch (tcErr) {
      console.warn('netsales_v4: aviso ao carregar tipos_cliente:', tcErr)
    }

    let importados = 0
    let atualizados = 0
    let ignorados = 0
    let roteadosHistorico = 0
    let historicoImportados = 0
    let historicoAtualizados = 0
    const erros = []
    const avisos = []

    // PARSE BR de números: remove pontos de milhar, vírgula decimal -> ponto
    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return 0
      if (typeof val === 'number') return val
      let s = val.toString().trim().replace('R$', '').replace(/\s/g, '')
      if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.')
      } else if (s.includes(',')) {
        s = s.replace(',', '.')
      }
      const n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    // Datas DD/MM/AAAA (e tolerante a ISO) -> 'AAAA-MM-DD 00:00:00.000Z'
    const parseDateStr = (val) => {
      if (!val) return ''
      const s = val.toString().trim()

      if (s.includes('/')) {
        const parts = s.split('/')
        if (parts.length === 3) {
          let p1 = parseInt(parts[0], 10)
          let p2 = parseInt(parts[1], 10)
          let y = parseInt(parts[2], 10)
          if (y < 100) y += 2000

          let d = p1
          let m = p2

          // Se p1 > 12 e p2 <= 12, p1 só pode ser dia (ex: 13/04/2021)
          // Se p2 > 12 e p1 <= 12, p2 só pode ser dia (formato invertido)
          if (p2 > 12 && p1 <= 12) {
            m = p1
            d = p2
          }

          const mm = String(m).padStart(2, '0')
          const dd = String(d).padStart(2, '0')
          return `${y}-${mm}-${dd} 00:00:00.000Z`
        }
      }

      if (s.includes('-')) {
        const parts = s.split('-')
        if (parts.length >= 3 && parts[0].length === 4) {
          const y = parts[0]
          const mm = parts[1].padStart(2, '0')
          const dd = parts[2].slice(0, 2).padStart(2, '0')
          return `${y}-${mm}-${dd} 00:00:00.000Z`
        }
        if (s.length === 10) return `${s} 00:00:00.000Z`
        return s
      }
      return s
    }

    // Escapa aspas simples para uso em filtros PocketBase
    const escFilter = (v) => (v || '').toString().split('\\').join('\\\\').split("'").join("\\'")

    for (let i = 0; i < rows.length; i++) {
      const lineNum = i + 1
      const m = buildRowMap(rows[i])

      const chaveDocumento = pick(m, ['chave_documento', 'numero_sap', 'chave_documento_fiscal'])
        .toString()
        .trim()
      const serial = pick(m, ['serial', 'n_nfe', 'no_nfe', 'numero_nfe', 'nfe']).toString().trim()
      const docDate = parseDateStr(
        pick(m, ['docdate', 'data_de_lancamento', 'data_lancamento', 'data']).toString().trim(),
      )
      const codigoCliente = pick(m, [
        'cod_cliente',
        'codigo_cliente',
        'cod_do_cliente',
        'codigo_do_cliente',
        'cliente_codigo',
      ])
        .toString()
        .trim()
      const codigoItem = pick(m, [
        'codigo_do_item',
        'codigo_item',
        'cod_do_item',
        'cod_item',
        'item_codigo',
      ])
        .toString()
        .trim()

      // Chave Documento e Serial continuam obrigatórios: sem qualquer um dos
      // dois, o registro é silenciosamente pulado. Cliente e item são opcionais.
      if (!chaveDocumento || !serial) {
        ignorados++
        continue
      }

      // Roteamento pela janela dinâmica (nunca data fixa no código)
      const foraDaJanela = !modoHistorico && isForaDaJanela(docDate)
      const targetName = modoHistorico || foraDaJanela ? 'vendas_historico' : 'netsales'
      const targetCol = targetName === 'vendas_historico' ? historicoCol : netsalesCol
      if (targetName === 'vendas_historico') roteadosHistorico++

      try {
        let isUpdate = false
        let record

        // DEDUPLICAÇÃO: chave_documento + serial + docdate + codigo_cliente + codigo_item
        // (na coleção netsales os campos são chave_documento/docdate; no
        // vendas_historico são numero_documento_netsales/data_lancamento)
        let filter
        if (targetName === 'vendas_historico') {
          filter =
            "numero_documento_netsales = '" +
            escFilter(chaveDocumento) +
            "'" +
            " && numero_nfe = '" +
            escFilter(serial) +
            "'" +
            " && data_lancamento = '" +
            escFilter(docDate) +
            "'" +
            " && codigo_item = '" +
            escFilter(codigoItem) +
            "'" +
            " && codigo_cliente = '" +
            escFilter(codigoCliente) +
            "'"
        } else {
          filter =
            "chave_documento = '" +
            escFilter(chaveDocumento) +
            "'" +
            " && serial = '" +
            escFilter(serial) +
            "'" +
            " && docdate = '" +
            escFilter(docDate) +
            "'" +
            " && codigo_item = '" +
            escFilter(codigoItem) +
            "'" +
            " && codigo_cliente = '" +
            escFilter(codigoCliente) +
            "'"
        }

        const found = $app.findRecordsByFilter(targetName, filter, '', 1, 0)

        if (found.length > 0) {
          record = found[0]
          isUpdate = true
        } else {
          record = new Record(targetCol)
        }

        // Campos comuns às duas coleções (nomes distintos quando necessário)
        const texto = (v) => (v === undefined || v === null ? '' : v.toString().trim())
        const nomeCliente = texto(pick(m, ['nome_do_cliente', 'nome_cliente', 'cliente']))
        const grupoCliente = texto(
          pick(m, ['grupo_do_cliente', 'grupo_cliente', 'grupo_de_cliente']),
        )
        const mercado = texto(pick(m, ['mercado']))
        const usuarioEmissor = texto(
          pick(m, ['usuario_emitente_do_pedido', 'usuario_emissor', 'usuario_emissor_pedido']),
        )
        const descrip = texto(pick(m, ['descrip', 'descricao', 'descricao_do_item']))
        const itmsGrpNam = texto(pick(m, ['itmsgrpnam', 'itms_grp_nam', 'itms_grp_nam2']))
        const numeroDocumento = texto(
          pick(m, ['n_do_documento', 'numero_do_documento', 'numero_documento', 'docnum']),
        )
        const quantidade = parseNum(pick(m, ['quantidade', 'qtd', 'qtde']))
        const precoUnitario = parseNum(pick(m, ['preco_unitario', 'preco_unit']))
        const valorMercadoria = parseNum(
          pick(m, ['valor_mercadoria', 'total_da_linha', 'total_linha', 'valor_da_mercadoria']),
        )
        const totalNfSemFrete = parseNum(pick(m, ['total_nf_sem_frete', 'total_nf_sem_frete2']))
        const totalNfNovo = parseNum(pick(m, ['total_nf_novo', 'total_nf_novo2']))
        const valorLiquido = parseNum(pick(m, ['valor_liquido', 'valor_liquidо', 'valor_liq']))
        const custoTotal = parseNum(pick(m, ['custo_total']))
        const usage = texto(pick(m, ['usage', 'utilizacao']))
        const classificacao = texto(pick(m, ['classificacao']))
        const revenda = texto(pick(m, ['revenda']))
        const vendedorRevenda = texto(pick(m, ['vendedor_revenda', 'vendedor_da_revenda']))
        const municipio = texto(pick(m, ['municipio', 'cidade']))
        const estado = texto(pick(m, ['estado', 'uf']))
        const tipo = texto(pick(m, ['tipo'])) || 'NF'

        if (targetName === 'vendas_historico') {
          record.set('tipo_documento', tipo)
          record.set('codigo_cliente', codigoCliente)
          record.set('nome_cliente', nomeCliente)
          record.set('grupo_cliente', grupoCliente)
          record.set('mercado', mercado)
          record.set('usuario_emissor_pedido', usuarioEmissor)
          record.set('data_lancamento', docDate || '')
          record.set('numero_documento_netsales', chaveDocumento)
          record.set('numero_nfe', serial)
          record.set('numero_sap', chaveDocumento)
          record.set('descricao_item', descrip)
          record.set('itms_grp_nam', itmsGrpNam)
          record.set('codigo_item', codigoItem)
          record.set('quantidade', quantidade)
          record.set('preco_unitario', precoUnitario)
          record.set('total_linha', valorMercadoria)
          record.set('total_nf_sem_frete', totalNfSemFrete)
          record.set('total_nf_novo', totalNfNovo)
          record.set('valor_liquido', valorLiquido)
          record.set('custo_total', custoTotal)
          record.set('utilizacao', usage)
          record.set('classificacao', classificacao)
          record.set('vendedor_revenda', vendedorRevenda)
          record.set('cidade', municipio)
          record.set('estado', estado)
          record.set('origem', 'NetSales_v4')
          record.set('data_carga', nowIso)
          record.set('tem_racnew', false)
          record.set('tem_netsales', true)
        } else {
          // Base ativa: coleção netsales (staging da consolidação)
          record.set('tipo', tipo)
          record.set('codigo_cliente', codigoCliente)
          record.set('nome_cliente', nomeCliente)
          record.set('grupo_cliente', grupoCliente)
          record.set('mercado', mercado)
          record.set('usuario_emissor', usuarioEmissor)
          record.set('docdate', docDate || '')
          record.set('chave_documento', chaveDocumento)
          record.set('descrip', descrip)
          record.set('itms_grp_nam', itmsGrpNam)
          record.set('codigo_item', codigoItem)
          record.set('numero_documento', numeroDocumento)
          record.set('quantidade', quantidade)
          record.set('preco_unitario', precoUnitario)
          record.set('valor_mercadoria', valorMercadoria)
          record.set('total_nf_sem_frete', totalNfSemFrete)
          record.set('total_nf_novo', totalNfNovo)
          record.set('valor_liquido', valorLiquido)
          record.set('serial', serial)
          record.set('custo_total', custoTotal)
          record.set('usage', usage)
          record.set('classificacao', classificacao)
          record.set('revenda', revenda)
          record.set('vendedor_revenda', vendedorRevenda)
          record.set('municipio', municipio)
          record.set('estado', estado)
          record.set('origem', 'NetSales_v4')
          record.set('data_carga', nowIso)
        }

        // Enriquecimento de Tipo de Cliente por codigoCliente
        const normCodCli = (codigoCliente || '').trim().toUpperCase()
        const tcInfo = normCodCli ? tiposClienteMap[normCodCli] : null
        record.set('status_cadastro', tcInfo ? tcInfo.status_cadastro : '')
        record.set('tipo_pn', tcInfo ? tcInfo.tipo_pn : '')
        record.set('tipo_cliente', tcInfo ? tcInfo.tipo_cliente : '')

        $app.save(record)
        if (isUpdate) {
          if (targetName === 'vendas_historico') {
            historicoAtualizados++
          } else {
            atualizados++
          }
        } else {
          if (targetName === 'vendas_historico') {
            historicoImportados++
          } else {
            importados++
          }
        }
      } catch (err) {
        ignorados++
        erros.push(
          `Linha ${lineNum} (${chaveDocumento}/${serial}): erro ao salvar: ${err.message || String(err)}`,
        )
      }
    }

    if (roteadosHistorico > 0) {
      avisos.push(
        `${roteadosHistorico} registro(s) anterior(es) a ${janela.anoInicio} enviado(s) ao histórico (vendas_historico).`,
      )
    }

    // Carga concluída: invalida o cache de opções dinâmicas dos filtros (30 min)
    // e o cache do dashboard (5 min).
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__skipFilterOptionsCache) {
        globalThis.__skipFilterOptionsCache = new Map()
        console.log('import_netsales_v4: __skipFilterOptionsCache invalidado (carga concluída)')
      }
    } catch (cacheErr) {
      console.warn('import_netsales_v4: falha ao invalidar cache de opções:', cacheErr)
    }
    try {
      if (typeof globalThis !== 'undefined' && globalThis.__skipDashboardCache) {
        globalThis.__skipDashboardCache.clear()
        console.log('import_netsales_v4: __skipDashboardCache invalidado (carga concluída)')
      }
    } catch (dashCacheErr) {
      console.warn('import_netsales_v4: falha ao invalidar cache do dashboard:', dashCacheErr)
    }

    return e.json(200, {
      success: true,
      fonte: 'NetSales_v4',
      modo: modoHistorico ? 'historico' : 'atual',
      importados,
      atualizados,
      ignorados,
      roteados_historico: roteadosHistorico,
      historico_importados: historicoImportados,
      historico_atualizados: historicoAtualizados,
      janela: janela,
      erros,
      avisos,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
