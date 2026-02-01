/**
 * Migration: Add block_name to patrol_photos
 * Purpose: Link evidence photo to specific block checkpoint
 * Date: February 2, 2026
 */

const pool = require('../../src/config/database');

async function up() {
    const client = await pool.connect();

    try {
        console.log(
            '🚀 Starting migration: Add block_name to patrol_photos...',
        );

        await client.query('BEGIN');

        // Add block_name column
        console.log('📊 Adding block_name column to patrol_photos...');
        await client.query(`
            ALTER TABLE patrol_photos
            ADD COLUMN IF NOT EXISTS block_name VARCHAR(100)
        `);

        // Add index for block_name
        console.log('⚡ Creating index on block_name...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_photos_block_name 
                ON patrol_photos(block_name)
        `);

        // Add column comment
        await client.query(`
            COMMENT ON COLUMN patrol_photos.block_name IS 
            'Nama blok checkpoint untuk evidence ini'
        `);

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');

        return true;
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
        console.log(
            '🔄 Rolling back migration: Remove block_name from patrol_photos...',
        );

        await client.query('BEGIN');

        // Drop index
        await client.query(`
            DROP INDEX IF EXISTS idx_patrol_photos_block_name
        `);

        // Remove column
        await client.query(`
            ALTER TABLE patrol_photos
            DROP COLUMN IF EXISTS block_name
        `);

        await client.query('COMMIT');
        console.log('✅ Rollback completed successfully!');

        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Rollback failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if called directly
if (require.main === module) {
    up()
        .then(() => {
            console.log('Migration finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration error:', error);
            process.exit(1);
        });
}

module.exports = { up, down };
