const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function restoreDatabase() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('📖 Reading SQL backup file...');
        const sqlFile = path.join(__dirname, 'backup_tia_db.sql');
        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('🔌 Connecting to Railway database...');
        const client = await pool.connect();

        console.log('🗑️  Dropping existing data...');
        console.log('📥 Restoring database...');

        // Execute the SQL
        await client.query(sql);

        console.log('✅ Database restored successfully!');

        // Verify data
        const usersCount = await client.query('SELECT COUNT(*) FROM users');
        const shiftsCount = await client.query('SELECT COUNT(*) FROM shifts');
        const attendanceCount = await client.query(
            'SELECT COUNT(*) FROM attendance'
        );

        console.log('\n📊 Verification:');
        console.log(`   Users: ${usersCount.rows[0].count}`);
        console.log(`   Shifts: ${shiftsCount.rows[0].count}`);
        console.log(`   Attendance: ${attendanceCount.rows[0].count}`);

        await client.release();
        await pool.end();
    } catch (error) {
        console.error('❌ Restore error:', error.message);
        process.exit(1);
    }
}

restoreDatabase();
