/**
 * Migration: Add app_access column to users table
 * Purpose: Segregate users between TIA Security App and TIA Community App
 * Date: January 16, 2026
 */

const pool = require('../../src/config/database');

async function up() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting migration: Add app_access column...');

        await client.query('BEGIN');

        // 1. Add app_access column
        console.log('📊 Adding app_access column to users table...');
        await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS app_access VARCHAR(20) DEFAULT 'community'
    `);

        // 2. Add check constraint
        console.log('🔒 Adding check constraint...');
        await client.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_app_access_check
    `);

        await client.query(`
      ALTER TABLE users
      ADD CONSTRAINT users_app_access_check 
      CHECK (app_access IN ('security', 'community'))
    `);

        // 3. Update existing security users
        console.log(
            '👮 Updating existing security guards to app_access = security...'
        );
        const updateResult = await client.query(`
      UPDATE users 
      SET app_access = 'security'
      WHERE role = 'security'
        AND app_access = 'community'
      RETURNING id, name, phone
    `);

        console.log(
            `✅ Updated ${updateResult.rowCount} security guard accounts`
        );

        // 4. Update supervisors and admins to community
        console.log(
            '👔 Ensuring supervisors/admins have app_access = community...'
        );
        await client.query(`
      UPDATE users 
      SET app_access = 'community'
      WHERE role IN ('supervisor', 'admin', 'ketua_rt', 'warga', 'resident')
    `);

        // 5. Create index for faster queries
        console.log('⚡ Creating index on app_access column...');
        await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_app_access 
      ON users(app_access)
    `);

        // 6. Add comment
        await client.query(`
      COMMENT ON COLUMN users.app_access IS 
      'Determines which mobile app can login: security (TIA Security App) or community (TIA Community App)'
    `);

        await client.query('COMMIT');

        console.log('✅ Migration completed successfully!');

        // Show summary
        const summary = await client.query(`
      SELECT 
        app_access,
        COUNT(*) as user_count,
        array_agg(DISTINCT role) as roles
      FROM users
      GROUP BY app_access
      ORDER BY app_access
    `);

        console.log('\n📊 User Distribution Summary:');
        console.table(summary.rows);
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
        console.log('🔄 Rolling back migration...');

        await client.query('BEGIN');

        // Drop constraint
        await client.query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_app_access_check
    `);

        // Drop index
        await client.query(`
      DROP INDEX IF EXISTS idx_users_app_access
    `);

        // Drop column
        await client.query(`
      ALTER TABLE users 
      DROP COLUMN IF EXISTS app_access
    `);

        await client.query('COMMIT');

        console.log('✅ Rollback completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Rollback failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// CLI execution
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'up') {
        up()
            .then(() => {
                console.log('\n✅ Migration applied successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('\n❌ Migration failed:', error.message);
                process.exit(1);
            });
    } else if (command === 'down') {
        down()
            .then(() => {
                console.log('\n✅ Migration rolled back successfully');
                process.exit(0);
            })
            .catch((error) => {
                console.error('\n❌ Rollback failed:', error.message);
                process.exit(1);
            });
    } else {
        console.log('Usage:');
        console.log('  node add_app_access_column.js up    - Apply migration');
        console.log(
            '  node add_app_access_column.js down  - Rollback migration'
        );
        process.exit(1);
    }
}

module.exports = { up, down };
