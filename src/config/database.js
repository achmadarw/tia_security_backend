const { Pool } = require('pg');
require('dotenv').config();

// Debug: Log all DB-related env vars
console.log('🔍 Environment Variables Check:');
console.log(
    '   DATABASE_URL:',
    process.env.DATABASE_URL ? 'EXISTS' : 'MISSING'
);
console.log('   DB_HOST:', process.env.DB_HOST || 'undefined');
console.log('   DB_NAME:', process.env.DB_NAME || 'undefined');
console.log('   DB_USER:', process.env.DB_USER || 'undefined');
console.log('   NODE_ENV:', process.env.NODE_ENV);

// Try DATABASE_URL first, then individual params
let poolConfig;

if (process.env.DATABASE_URL) {
    console.log('✅ Using DATABASE_URL connection');
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false,
        },
    };
} else {
    console.log('⚠️ DATABASE_URL not found, using individual params');
    console.log('   This will FAIL on Railway if PostgreSQL not linked!');
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'tia_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
    };
}

const pool = new Pool(poolConfig);

pool.on('connect', () => {
    console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(-1);
});

module.exports = pool;
