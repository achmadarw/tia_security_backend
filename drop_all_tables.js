const { Pool } = require('pg');
require('dotenv').config();

async function dropAllTables() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    try {
        const client = await pool.connect();

        console.log('🗑️  Dropping all tables...');

        // Drop all tables in cascade mode
        await client.query(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `);

        console.log('✅ All tables dropped successfully!');

        await client.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

dropAllTables();
