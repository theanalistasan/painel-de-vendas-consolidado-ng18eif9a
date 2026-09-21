migrate(
  (app) => {
    // Correção da coluna nome_canal na coleção canais_clientes.
    //
    // Diagnóstico verificado nos dados reais:
    // 1) Na planilha importada "Canais x Clientes", a primeira linha do grupo de cada canal
    //    possui codigo_cliente = '-' e nome_cliente = <NOME DO CANAL/REVENDA>
    //    Ex.: ORNELAS NETO & CIA LTDA, SPAK INDUSTRIA E COMERCIO, BLUE BIRD, AQUARELA SILK E SIGN, etc.
    // 2) Em outros casos, o próprio nome_cliente ou revenda oficial identifica o canal.
    // 3) Para os registros onde eh_canal=1 mas nome_canal estava vazio, preenchemos nome_canal
    //    com o nome de exibição do canal ou a razão social correspondente.
    //
    // Adicionalmente, mapeamos os clientes associados conhecidos pelo catálogo oficial de revendas Roland DG
    // e pelas razões sociais já presentes na tabela.

    try {
      // 1. Se existir registro de cabeçalho de canal (codigo_cliente='-') com nome_cliente preenchido
      // e eh_canal=1, atualiza o próprio nome_canal para ser o nome_cliente simplificado.
      app
        .db()
        .newQuery(`
      UPDATE canais_clientes
      SET nome_canal = TRIM(nome_cliente)
      WHERE (codigo_cliente = '-' OR codigo_cliente = '' OR codigo_cliente IS NULL)
        AND (nome_canal IS NULL OR nome_canal = '')
        AND nome_cliente IS NOT NULL
        AND nome_cliente != ''
        AND (eh_canal = 1 OR eh_canal = 'true')
    `)
        .execute()

      // 2. Mapeamento das Revendas Oficiais e seus padrões em canais_clientes
      // Mapeamos para que clientes de canais recebam o nome_canal padronizado:
      const revendasMap = [
        { canal: 'Adenil', patterns: ['ADENIL', 'ADENILL'] },
        { canal: 'Aquarela', patterns: ['AQUARELA'] },
        { canal: 'Blue Bird', patterns: ['BLUE BIRD'] },
        { canal: 'Brastech', patterns: ['BRASTECH', 'CARVALHO LIMA'] },
        { canal: 'CH Suprimentos', patterns: ['CH SUPRIMENTOS'] },
        { canal: 'Cyancolor', patterns: ['CYANCOLOR', 'CYANPRINT', 'CYAN PRINT'] },
        { canal: 'D Printer', patterns: ['D PRINTER', 'DPRINTER', 'D. PRINTER'] },
        { canal: 'Dental Globo', patterns: ['DENTAL GLOBO'] },
        {
          canal: 'Diamante Tintas',
          patterns: ['DIAMANTE COMERCIO DE TINTAS', 'DIAMANTE TINTAS', 'DIAMANTE COM DE TINTAS'],
        },
        { canal: 'DJ Comércio', patterns: ['DJ COMERCIO', 'DJ COMÉRCIO', 'DJ COM. DE ADESIVOS'] },
        { canal: 'Drucken', patterns: ['DRUCKEN'] },
        { canal: 'Eldorado', patterns: ['ELDORADO', 'ROBERTO LEITE DOS SANTOS'] },
        { canal: 'Empório do Adesivo', patterns: ['EMPORIO DO ADESIVO', 'EMPÓRIO DO ADESIVO'] },
        {
          canal: 'Formato GO',
          patterns: ['FORMATO GO', 'FORMATO GYN', 'FORMATO DIGITAL GO', 'FORMATO COM'],
        },
        {
          canal: 'Formato MG',
          patterns: [
            'FORMATO MG',
            'FORMATO BH',
            'FORMATO DIGITAL MG',
            'FORMATO COMERCIO',
            'HANOVER',
          ],
        },
        { canal: 'Ímpar', patterns: ['IMPAR', 'ÍMPAR'] },
        { canal: 'Konica Minolta', patterns: ['KONICA MINOLTA', 'KONICA'] },
        { canal: 'Kromadecka', patterns: ['KROMADECKA'] },
        { canal: 'M2', patterns: ['M2 DIGITAL', 'M2 SOLUCOES'] },
        {
          canal: 'N.R.M. Leite',
          patterns: ['N. R. M. LEITE', 'NRM LEITE', 'N R M LEITE', 'LEITE &', 'N. R. M. LEMES'],
        },
        { canal: 'Neodent', patterns: ['NEODENT', 'JJGC IND'] },
        { canal: 'Nova Silk', patterns: ['NOVA SILK', 'NOVASILK', 'PROMEX MAIS'] },
        { canal: 'Novo Tempo Digital', patterns: ['NOVO TEMPO', 'NOVO TEMPO DIGITAL'] },
        {
          canal: 'Ocean',
          patterns: ['OCEAN SOLUCOES', 'OCEAN SOLUÇÕES', 'OCEAN', 'ANTONIO GARCIA MIZARELO'],
        },
        { canal: 'Plast Sign', patterns: ['PLASTSIGN', 'PLAST SIGN'] },
        { canal: 'Substrato', patterns: ['SUBSTRATO'] },
        { canal: 'Spak', patterns: ['SPAK'] },
        { canal: 'Ornelas', patterns: ['ORNELAS'] },
        { canal: 'Total Tecnologia', patterns: ['TOTAL TECNOLOGIA', 'SMART TECNOLOGIA'] },
        { canal: 'Moreira Plásticos', patterns: ['MOREIRA COMERCIO ATACADISTA'] },
        { canal: 'VLO Comércio', patterns: ['VLO COMERCIO'] },
        { canal: 'Suprimais', patterns: ['SUPRIMAIS'] },
        { canal: 'Signserra', patterns: ['SIGNSERRA'] },
        { canal: 'CN Queiroz', patterns: ['CN QUEIROZ'] },
        { canal: 'Serifácil', patterns: ['SERIFACIL', 'SERIFÁCIL'] },
        { canal: 'Tecniplot', patterns: ['TECNIPLOT'] },
        { canal: 'PSD Max', patterns: ['PSD MAX'] },
        { canal: 'SBP Empreendimentos', patterns: ['SBP EMPREENDIMENTOS'] },
        { canal: 'Perini & Marianof', patterns: ['PERINI & MARIANOF'] },
        { canal: 'PS Digital', patterns: ['PS DIGITAL'] },
      ]

      for (let i = 0; i < revendasMap.length; i++) {
        const item = revendasMap[i]
        for (let j = 0; j < item.patterns.length; j++) {
          const pat = item.patterns[j]
          app
            .db()
            .newQuery(`
          UPDATE canais_clientes
          SET nome_canal = {:canal}
          WHERE (eh_canal = 1 OR eh_canal = 'true')
            AND (nome_canal IS NULL OR nome_canal = '')
            AND UPPER(nome_cliente) LIKE {:like}
        `)
            .bind({ canal: item.canal, like: '%' + pat + '%' })
            .execute()
        }
      }

      // 3. Para qualquer outro registro com eh_canal=1 que ainda não tenha nome_canal preenchido,
      // preenche nome_canal com o próprio nome_cliente para garantir que 100% dos registros de canal
      // fiquem disponíveis para filtro
      app
        .db()
        .newQuery(`
      UPDATE canais_clientes
      SET nome_canal = TRIM(nome_cliente)
      WHERE (eh_canal = 1 OR eh_canal = 'true')
        AND (nome_canal IS NULL OR nome_canal = '')
        AND nome_cliente IS NOT NULL
        AND nome_cliente != ''
    `)
        .execute()
    } catch (err) {
      console.error('Erro na migracao 0026_fix_nome_canal_canais_clientes:', err)
    }
  },
  (app) => {
    // Reversão não é necessária pois foi apenas preenchimento de dados nulos
  },
)
