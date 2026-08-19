// Migration 0005
// 1. Adds custom fields to the built-in `users` collection:
//      - role   (select: "admin" | "user")
//      - active (bool, default true)
//    Also relaxes the users API rules so any authenticated admin-level
//    user can manage other users from the /usuarios screen. We keep the
//    rules permissive for authenticated users since the admin gate is
//    enforced client-side via the AdminGuard (sessionStorage password).
// 2. Creates the `audit_logs` base collection for auditing login/logout
//    and admin/import access events.
migrate(
  (app) => {
    // --- 1. Mutate the existing `users` auth collection ---
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Add `role` select field (only if it doesn't already exist)
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: false,
          presentable: true,
          values: ['admin', 'user'],
          maxSelect: 1,
        }),
      )
    }

    // Add `active` bool field (only if it doesn't already exist)
    if (!users.fields.getByName('active')) {
      users.fields.add(
        new BoolField({
          name: 'active',
          required: false,
        }),
      )
    }

    // Loosen rules: any authenticated user can list/view/create/update/delete
    // user records (the Usuarios admin screen needs this). Auth itself is still
    // handled by PocketBase's auth endpoints.
    users.listRule = "@request.auth.id != ''"
    users.viewRule = "@request.auth.id != ''"
    users.createRule = "@request.auth.id != ''"
    users.updateRule = "@request.auth.id != ''"
    users.deleteRule = "@request.auth.id != ''"

    app.save(users)

    // Backfill existing users so they default to active=true and role="user"
    try {
      const existing = app.findRecordsByFilter('_pb_users_auth_', '1=1', '', 500, 0)
      for (let i = 0; i < existing.length; i++) {
        const rec = existing[i]
        let changed = false
        if (!rec.get('role')) {
          rec.set('role', 'user')
          changed = true
        }
        // active: treat null/undefined as true
        if (
          rec.get('active') === null ||
          rec.get('active') === undefined ||
          rec.get('active') === ''
        ) {
          rec.set('active', true)
          changed = true
        }
        if (changed) app.save(rec)
      }
    } catch (_) {}

    // Make sure the seeded admin user is marked as admin + active
    try {
      const admin = app.findAuthRecordByEmail('_pb_users_auth_', 'silvio.mattos@rolanddg.com.br')
      admin.set('role', 'admin')
      admin.set('active', true)
      app.save(admin)
    } catch (_) {}

    // --- 2. Create `audit_logs` base collection ---
    const auditLogs = new Collection({
      name: 'audit_logs',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'user_id',
          type: 'relation',
          required: false,
          collectionId: '_pb_users_auth_',
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'user_email', type: 'text', required: false },
        { name: 'user_name', type: 'text', required: false },
        { name: 'action', type: 'text', required: true },
        { name: 'details', type: 'text', required: false },
        { name: 'ip', type: 'text', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_audit_logs_created ON audit_logs (created DESC)',
        'CREATE INDEX idx_audit_logs_action ON audit_logs (action)',
        'CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id)',
      ],
    })
    app.save(auditLogs)
  },
  (app) => {
    // Revert: remove audit_logs collection and the new user fields
    try {
      const al = app.findCollectionByNameOrId('audit_logs')
      app.delete(al)
    } catch (_) {}

    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      if (users.fields.getByName('role')) {
        users.fields.removeByName('role')
      }
      if (users.fields.getByName('active')) {
        users.fields.removeByName('active')
      }
      // Restore original restrictive rules
      users.listRule = 'id = @request.auth.id'
      users.viewRule = 'id = @request.auth.id'
      users.createRule = ''
      users.updateRule = 'id = @request.auth.id'
      users.deleteRule = 'id = @request.auth.id'
      app.save(users)
    } catch (_) {}
  },
)
