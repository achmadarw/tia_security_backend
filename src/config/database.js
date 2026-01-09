const { Pool } = require('pg');
require('dotenv').config();

// Railway provides DATABASE_URL, local dev uses individual params
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: {
                  rejectUnauthorized: false,
              },
          }
        : {
              host: process.env.DB_HOST || 'localhost',
              port: process.env.DB_PORT || 5432,
              database: process.env.DB_NAME || 'tia_db',
              user: process.env.DB_USER || 'postgres',
              password: process.env.DB_PASSWORD,
          }
);

pool.on('connect', () => {
    console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

module.exports = pool;
