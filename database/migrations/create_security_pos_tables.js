/**
 * Migration: Create Security Pos Tables
 * Purpose: Base/tempat kerja security berbeda dengan blocks (area patroli)
 * Date: January 16, 2026
 */

const pool = require('../../src/config/database');
const bcrypt = require('bcrypt');

async function up() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting migration: Create security pos tables...');

        await client.query('BEGIN');

        // 1. Create security_pos table
        console.log('📊 Creating security_pos table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS security_pos (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) NOT NULL UNIQUE,
                name VARCHAR(100) NOT NULL,
                password VARCHAR(255) NOT NULL,
                location_description TEXT,
                location_lat DECIMAL(10, 8),
                location_lng DECIMAL(11, 8),
                status VARCHAR(20) DEFAULT 'active',
                max_capacity INTEGER DEFAULT 5,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                
                CONSTRAINT security_pos_code_unique UNIQUE(code),
                CONSTRAINT security_pos_status_check 
                    CHECK (status IN ('active', 'inactive'))
            )
        `);

        // 2. Create indexes
        console.log('⚡ Creating indexes on security_pos...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_security_pos_code 
                ON security_pos(code)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_security_pos_status 
                ON security_pos(status)
        `);

        // 3. Add comments
        await client.query(`
            COMMENT ON TABLE security_pos IS 
            'Base/tempat kerja security (berbeda dengan blocks yang merupakan area patroli)'
        `);
        await client.query(`
            COMMENT ON COLUMN security_pos.code IS 
            'Kode pos (contoh: pos1, pos2, pos3)'
        `);
        await client.query(`
            COMMENT ON COLUMN security_pos.password IS 
            'Password untuk login ke pos (bcrypt hashed)'
        `);

        // 4. Create pos_sessions table
        console.log('📊 Creating pos_sessions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS pos_sessions (
                id SERIAL PRIMARY KEY,
                pos_id INTEGER NOT NULL REFERENCES security_pos(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                shift_id INTEGER REFERENCES shifts(id),
                roster_assignment_id INTEGER REFERENCES roster_assignments(id),
                session_start TIMESTAMP DEFAULT NOW(),
                session_end TIMESTAMP,
                status VARCHAR(20) DEFAULT 'active',
                device_id VARCHAR(255),
                check_in_method VARCHAR(20) DEFAULT 'manual',
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                
                CONSTRAINT pos_sessions_status_check 
                    CHECK (status IN ('active', 'ended', 'abandoned')),
                CONSTRAINT pos_sessions_check_in_method_check
                    CHECK (check_in_method IN ('manual', 'face', 'qr', 'auto'))
            )
        `);

        // 5. Create unique constraint for active sessions
        console.log('🔒 Creating unique constraint for active sessions...');
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sessions_active_unique 
                ON pos_sessions(pos_id, user_id) 
                WHERE status = 'active'
        `);

        // 6. Create other indexes
        console.log('⚡ Creating indexes on pos_sessions...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_pos 
                ON pos_sessions(pos_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_user 
                ON pos_sessions(user_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_status 
                ON pos_sessions(pos_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_pos_sessions_shift 
                ON pos_sessions(shift_id)
        `);

        // 7. Add comments
        await client.query(`
            COMMENT ON TABLE pos_sessions IS 
            'Track active security sessions di setiap pos'
        `);

        // 8. Alter attendance table to add pos references
        console.log(
            '📊 Adding pos_id and pos_session_id to attendance table...'
        );
        await client.query(`
            ALTER TABLE attendance
            ADD COLUMN IF NOT EXISTS pos_id INTEGER REFERENCES security_pos(id),
            ADD COLUMN IF NOT EXISTS pos_session_id INTEGER REFERENCES pos_sessions(id)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_pos 
                ON attendance(pos_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_pos_session 
                ON attendance(pos_session_id)
        `);

        // 9. Insert sample pos data
        console.log('📝 Inserting sample pos data...');

        // Hash passwords
        const password1 = await bcrypt.hash('pos1234', 10);
        const password2 = await bcrypt.hash('pos1234', 10);
        const password3 = await bcrypt.hash('pos1234', 10);

        await client.query(
            `
            INSERT INTO security_pos (code, name, password, location_description, max_capacity)
            VALUES 
                ($1, 'Pos Security Utama', $2, 'Gerbang Utama Komplek', 3),
                ($3, 'Pos Security Samping', $4, 'Gerbang Samping Blok B', 2),
                ($5, 'Pos Security Belakang', $6, 'Gerbang Belakang Blok C', 2)
            ON CONFLICT (code) DO NOTHING
            RETURNING id, code, name
        `,
            ['pos1', password1, 'pos2', password2, 'pos3', password3]
        );

        const posResult = await client.query(
            'SELECT id, code, name FROM security_pos ORDER BY id'
        );

        console.log('\n✅ Sample pos created:');
        console.table(posResult.rows);
        console.log('\n🔑 Default password untuk semua pos: pos1234');

        await client.query('COMMIT');

        console.log('\n✅ Migration completed successfully!');

        // Show summary
        const summary = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM security_pos) as total_pos,
                (SELECT COUNT(*) FROM security_pos WHERE status = 'active') as active_pos,
                (SELECT COUNT(*) FROM pos_sessions) as total_sessions,
                (SELECT COUNT(*) FROM pos_sessions WHERE status = 'active') as active_sessions
        `);

        console.log('\n📊 Summary:');
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

        // Remove columns from attendance
        await client.query(`
            ALTER TABLE attendance
            DROP COLUMN IF EXISTS pos_session_id,
            DROP COLUMN IF EXISTS pos_id
        `);

        // Drop tables in reverse order
        await client.query('DROP TABLE IF EXISTS pos_sessions CASCADE');
        await client.query('DROP TABLE IF EXISTS security_pos CASCADE');

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
        console.log(
            '  node create_security_pos_tables.js up    - Apply migration'
        );
        console.log(
            '  node create_security_pos_tables.js down  - Rollback migration'
        );
        process.exit(1);
    }
}

module.exports = { up, down };
