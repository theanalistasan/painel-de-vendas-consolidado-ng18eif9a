# Painel de Vendas Consolidado — Backup Documental

## Versão

**v0.0.36**

## Status da Versão

- **Recuperação do Backend**: Concluída com sucesso. Migrações, hooks (`pb_hooks`), configurações de autenticação e conta de superusuário/admin foram totalmente restaurados e operacionais.
- **Funcionalidades Operacionais**:
  1. **Dashboard**: Métricas consolidadas (Faturamento Total, Valor Líquido, Itens Vendidos, Documentos NFE, Devoluções) e gráficos operacionais com suporte a alto volume de registros.
  2. **Vendas**: Tabela consolidada com paginação, 24 colunas de detalhamento, ordenação, colunas customizáveis e exportação CSV.
  3. **Importação de Bases**: Suporte ao carregamento e processamento das bases de dados (Produtos, RacNew, NetSales) com controle de progresso.
  4. **Auditoria**: Registro detalhado e rastreabilidade de ações do sistema (login, logout, acesso admin e importações).
  5. **Gestão de Usuários**: CRUD completo de usuários, perfis de acesso, alteração de status e controle de permissões.

## Bugs / Limitações Conhecidas

- **Filtro de Vendedor / Cliente**: O botão **"Selecionar todos"** no dropdown do filtro de Vendedor/Cliente marca todos os itens da lista completa, em vez de marcar apenas os itens filtrados resultantes da busca digitada pelo usuário.

## Histórico de Backups

- **v0.0.36**: Backup estável pós-recuperação do backend (migrações, hooks, auth e superusuário restaurados).
- **v0.0.29**: Backup documental anterior com rotas e filtros consolidados.
- **v0.0.27**: Backup estável de referência anterior.
