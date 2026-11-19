migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('netsales')

    // Serial do EQUIPAMENTO (distinto do campo `serial`, que guarda o número da
    // NF e é chave de deduplicação). Uma linha da nota = uma máquina, então este
    // campo identifica a unidade física vendida.
    // Preenchido pelo importador NetSales_v4 quando a origem (export SAP) passar
    // a trazer a coluna; até lá fica vazio e a consulta do formulário de garantia
    // responde "não encontrado" em vez de errar.
    if (!col.fields.getByName('serial_equipamento')) {
      col.fields.add(new TextField({ name: 'serial_equipamento', required: false }))
    }

    // Cliente/proprietário da máquina e data de venda já existem na linha
    // (nome_cliente, codigo_cliente, docdate); o índice abaixo serve a consulta
    // pontual por serial feita pelo formulário de garantia.
    col.addIndex('idx_netsales_serial_equipamento', false, 'serial_equipamento', '')

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('netsales')
    col.removeIndex('idx_netsales_serial_equipamento')
    if (col.fields.getByName('serial_equipamento')) {
      col.fields.removeByName('serial_equipamento')
    }
    app.save(col)
  },
)
