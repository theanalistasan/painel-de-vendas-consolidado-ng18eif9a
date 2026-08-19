# Painel de Vendas Consolidado — Backup Documental

## Versão

**v0.0.39**

## Status da Versão

- **Recuperação do Backend**: Concluída com sucesso. Migrações, hooks (`pb_hooks`), configurações de autenticação e conta de superusuário/admin foram totalmente restaurados e operacionais.
- **Volume de Dados**: Dashboard operacional com aproximadamente **126.000 registros** consolidados, com desempenho adequado para consulta, filtragem e exportação.
- **Contador de Usuários**: Contador "**4372 ativos**" exibido na interface.

## Funcionalidades Ativas

### Dashboard

- **5 KPIs**: Faturamento, Valor Líquido, Itens, Documentos e Devoluções.
- **6 gráficos** operacionais com suporte a alto volume de registros.

### Vendas

- Tabela consolidada com paginação, colunas de detalhamento, **ordenação por clique nos cabeçalhos** e exportação **CSV padrão brasileiro** (separador `;`, codificação compatível com Excel pt-BR).

### Importação de Bases

- Suporte ao carregamento e processamento das bases de dados (Produtos, RacNew, NetSales) com controle de progresso.
- **RacNew como base mestra**, com NetSales complementar via `COALESCE` nos **12 campos exclusivos**.
- **Consolidação SQL sem erro de constraint**: todos os campos da NetSales foram flexibilizados para permitir a consolidação.
- **Datas no formato DD/MM/AAAA corrigidas**: parser XLSX sem `cellDates` no frontend e `parseDateStr` no backend.

### Auditoria

- Registro detalhado e rastreabilidade de ações do sistema (login, logout, acesso admin e importações).
- **Badges coloridos** por tipo de evento e **filtros** de auditoria.

### Gestão de Usuários

- **CRUD completo** de usuários, perfis de acesso, alteração de status e controle de permissões.
- **Envio de convite** a novos usuários.

### Gráficos de Evolução

- **Evolução de Vendas por Ano**: barras de faturamento + devoluções + linha de variação percentual.
- **Evolução de Vendas por Mês**: últimos 6 meses, com faturamento + devoluções.
- **Limite de 6 meses** aplicado aos gráficos mensais.

### Filtros e Interface

- **Colapso de filtros**: 5 pílulas visíveis e indicação "+ N filtros" para os demais.
- **Botão "Aplicar Filtros"** para confirmar a seleção.
- **Ordenação por clique nos cabeçalhos** nas telas de Vendas e Dashboard.
- **Deduplicação automática de nomes** com espaços extras e/ou caracteres invisíveis.
- **Limpeza permanente de dados vazios** (entrada "-Nenhum vendedor / comprador-" removida).
- **Lista DISTINCT** no filtro Vendedor > Cliente.

### Segurança e Administração

- **Proteção admin com modal de senha** nas rotas `/importar`, `/admin`, `/usuarios` e `/auditoria`.
- **"Selecionar todos" respeita a busca ativa** (corrigido na v0.0.38) — o botão marca apenas os itens filtrados resultantes da busca digitada pelo usuário.
- **Autenticação ativa** (auth habilitada no backend).

### Backend

- **5 migrações** aplicadas.
- **8 hooks** (`pb_hooks`) operacionais.

## Bugs / Limitações Conhecidas

- Nenhuma limitação conhecida registrada nesta versão.

## Histórico de Backups

- **v0.0.39**: Backup estável com documentação completa das funcionalidades ativas (dashboard ~126k registros, 5 KPIs, 6 gráficos, datas DD/MM/AAAA, RacNew mestra + NetSales complementar, ordenação por clique, proteção admin, CRUD de usuários com convite, auditoria com badges, evolução de vendas por ano/mês, filtros colapsáveis, deduplicação de nomes, exportação CSV pt-BR, 5 migrações, 8 hooks).
- **v0.0.36**: Backup estável pós-recuperação do backend (migrações, hooks, auth e superusuário restaurados).
- **v0.0.29**: Backup documental anterior com rotas e filtros consolidados.
- **v0.0.27**: Backup estável de referência anterior.
