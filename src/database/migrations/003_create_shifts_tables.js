const pool = require('../../config/database');

async function up() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check if shifts table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'shifts'
            );
        `);

        if (tableCheck.rows[0].exists) {
            // Table exists - add missing columns
            console.log('📋 Shifts table exists, adding missing columns...');

            await client.query(`
                ALTER TABLE shifts 
                ADD COLUMN IF NOT EXISTS description TEXT,
                ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            `);

            // Update existing shifts with proper descriptions
            await client.query(`
                UPDATE shifts SET
                    description = CASE 
                        WHEN name = 'Shift Pagi' THEN 'Shift pagi 07:00 - 16:00'
                        WHEN name = 'Shift Siang' THEN 'Shift siang 15:00 - 24:00'
                        WHEN name = 'Shift Malam' THEN 'Shift malam 23:00 - 07:00'
                        ELSE name
                    END,
                    is_active = true
                WHERE description IS NULL
            `);

            // Update shift names to match new format
            await client.query(`
                UPDATE shifts SET
                    name = CASE 
                        WHEN name = 'Shift Pagi' THEN 'Shift 1 (Pagi)'
                        WHEN name = 'Shift Siang' THEN 'Shift 2 (Siang)'
                        WHEN name = 'Shift Malam' THEN 'Shift 3 (Malam)'
                        ELSE name
                    END
                WHERE name IN ('Shift Pagi', 'Shift Siang', 'Shift Malam')
            `);

            // Update shift times to match new requirements
            await client.query(`
                UPDATE shifts SET
                    start_time = '07:00:00',
                    end_time = '16:00:00'
                WHERE name = 'Shift 1 (Pagi)'
            `);

            await client.query(`
                UPDATE shifts SET
                    start_time = '15:00:00',
                    end_time = '00:00:00'
                WHERE name = 'Shift 2 (Siang)'
            `);

            await client.query(`
                UPDATE shifts SET
                    start_time = '23:00:00',
                    end_time = '07:00:00'
                WHERE name = 'Shift 3 (Malam)'
            `);
        } else {
            // Create new table
            console.log('📋 Creating shifts table...');

            await client.query(`
                CREATE TABLE shifts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    start_time TIME NOT NULL,
                    end_time TIME NOT NULL,
                    description TEXT,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Insert default shifts
            await client.query(`
                INSERT INTO shifts (name, start_time, end_time, description) VALUES
                ('Shift 1 (Pagi)', '07:00:00', '16:00:00', 'Shift pagi 07:00 - 16:00'),
                ('Shift 2 (Siang)', '15:00:00', '00:00:00', 'Shift siang 15:00 - 24:00'),
                ('Shift 3 (Malam)', '23:00:00', '07:00:00', 'Shift malam 23:00 - 07:00')
            `);
        }

        // Create shift_assignments table (monthly roster)
        await client.query(`
            CREATE TABLE IF NOT EXISTS shift_assignments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
                assignment_date DATE NOT NULL,
                is_replacement BOOLEAN DEFAULT false,
                replaced_user_id INTEGER REFERENCES users(id),
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, assignment_date, shift_id)
            )
        `);

        // Add shift_assignment_id to attendance table
        await client.query(`
            ALTER TABLE attendance 
            ADD COLUMN IF NOT EXISTS shift_assignment_id INTEGER REFERENCES shift_assignments(id),
            ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_early_leave BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS is_overtime BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER DEFAULT 0
        `);

        // Create indexes for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_shift_assignments_user_date 
            ON shift_assignments(user_id, assignment_date)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_shift_assignments_date 
            ON shift_assignments(assignment_date)
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_attendance_shift_assignment 
            ON attendance(shift_assignment_id)
        `);

        await client.query('COMMIT');
        console.log('✅ Shifts migration completed successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Shifts migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function down() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query('DROP TABLE IF EXISTS shift_assignments CASCADE');
        await client.query('DROP TABLE IF EXISTS shifts CASCADE');
        await client.query(`
            ALTER TABLE attendance 
            DROP COLUMN IF EXISTS shift_assignment_id,
            DROP COLUMN IF EXISTS is_late,
            DROP COLUMN IF EXISTS is_early_leave,
            DROP COLUMN IF EXISTS is_overtime,
            DROP COLUMN IF EXISTS late_minutes,
            DROP COLUMN IF EXISTS overtime_minutes
        `);

        await client.query('COMMIT');
        console.log('✅ Shifts migration rollback completed');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Shifts migration rollback failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { up, down };
