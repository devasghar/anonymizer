export default {
  database: {
    type: 'mysql',
    mode: 'dump',
    url: process.env.DATABASE_URL,
  },

  output: {
    file: './anonymised.sql.gz',
  },

  tables: {
    users: {
      email: { action: 'update', type: 'email' },
      name: { action: 'update', type: 'fullName' },
      phone: { action: 'update', type: 'phone' }
    },

    audit_logs: 'truncate',
  },
}