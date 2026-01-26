export default {
    database: {
      type: 'mysql',
      mode: 'dump',
      url: 'mysql://root:jhon%40Doe123@localhost:3306/test1'
    },
  
    output: {
      file: './database/anonymised.sql.gz'
    },
  
    tables: {
      users: {
        email: { action: 'update', type: 'email' },
        name: { action: 'update', type: 'fullName' },
        phone: { action: 'update', type: 'phone' },
      },
      audit_logs: 'truncate'
    }
  }