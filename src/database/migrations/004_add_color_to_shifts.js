const pool = require('../../config/database');

async function up() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('📋 Adding color column to shifts table...');

        // Add color column to shifts table
        await client.query(`
            ALTER TABLE shifts 
            ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#2196F3'
        `);

        // Update existing shifts with different colors
        await client.query(`
            UPDATE shifts 
            SET color = CASE 
                WHEN name ILIKE '%pagi%' THEN '#2196F3'
                WHEN name ILIKE '%siang%' THEN '#FF9800'
                WHEN name ILIKE '%malam%' OR name ILIKE '%sore%' THEN '#9C27B0'
                ELSE '#2196F3'
            END
            WHERE color IS NULL OR color = '#2196F3'
        `);

        await client.query('COMMIT');
        console.log('✅ Color column added successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function down() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('📋 Removing color column from shifts table...');

        // Remove color column
        await client.query(`
            ALTER TABLE shifts 
            DROP COLUMN IF EXISTS color
        `);

        await client.query('COMMIT');
        console.log('✅ Color column removed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Rollback failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { up, down };
