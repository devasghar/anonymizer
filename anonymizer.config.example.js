export default {
    database: {
        type: 'mysql',
        mode: 'dump',
        url: process.env.DATABASE_URL,
    },
    output: {
        file: './anonymized.sql.gz',
    },
    tables: {
        users: {
            email: { action: 'update', type: 'email' },
            name: { action: 'update', type: 'fullName' },
            phone: { action: 'update', type: 'phone' },
            national_id: {
                action: 'encrypt',
                algorithm: 'aes-256-gcm',
                keyEnv: 'ANONYMIZER_SECRET',
            },
        },
        audit_logs: 'truncate',
    },
};
