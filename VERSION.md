# Painel de Vendas Consolidado — Backup Documental

## Versão

**v0.0.29**

## Funcionalidades implementadas

1. **Dashboard** com SQL puro sobre ~126k registros, 5 KPIs (Faturamento, Valor Líquido, Itens, Documentos, Devoluções) e 6 gráficos.
2. **Filtros** de ano/mês/dia/vendedor/estado/grupo_item/classificação, com colapso de pílulas (mostra 3 + "+X filtros") e botão "Limpar Todos".
3. **Vendas paginadas** com 24 colunas, ordenação por clique nos cabeçalhos (asc/desc/sem ordenação), exportação CSV em padrão brasileiro.
4. **Importação de bases** (Produtos, RacNew, NetSales) em lotes de 5.000 com barra de progresso.
5. **Consolidação via SQL único** (`INSERT ... SELECT ... LEFT JOIN`) sem timeout, com `COALESCE` para campos da NetSales.
6. **Regra de negócio**: RacNew como base mestra (dados prevalecem); NetSales complementa com 12 campos exclusivos; Produtos fornece Grupo do Item.
7. **Correção definitiva de datas XLSX**: valor serial bruto → ISO → DD/MM/AAAA, NFE 790 validada como 12/06/2026.
8. **Proteção admin** nas rotas `/importar`, `/admin`, `/usuarios`, `/auditoria` (modal com senha `Reset@Painel2025`, válido por sessão).
9. **Gestão de Usuários** (`/usuarios`): CRUD completo (nome, email, senha, perfil admin/usuário, status ativo/inativo), envio de convite com link copiável, busca e paginação.
10. **Auditoria** (`/auditoria`): registra `login`, `logout`, `admin_access` (qual página), `import_access`; badges coloridos, filtros por ação/usuário/período, paginação.
11. **Hooks deployados**: `stats_counts`, `vendas_list`, `dashboard_stats`, e hooks de consolidação.

## Backup anterior

**v0.0.27** (commit `784a1f9`)

## QA

lint, typecheck e build devem passar limpos (apenas `VERSION.md` sendo alterado).
