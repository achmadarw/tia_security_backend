const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Restore database from backup
router.post('/restore-backup', async (req, res) => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    try {
        console.log('📖 Reading SQL backup file...');
        const sqlFile = path.join(__dirname, '../../backup_full_clean.sql');

        if (!fs.existsSync(sqlFile)) {
            return res.status(404).json({
                success: false,
                error: 'Backup file not found. Please upload backup_full_clean.sql to backend folder.',
            });
        }

        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('🔌 Connecting to Railway database...');
        const client = await pool.connect();

        // Drop all tables first
        console.log('🗑️  Dropping all existing tables...');
        await client.query(`
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO postgres;
            GRANT ALL ON SCHEMA public TO public;
        `);
        console.log('✅ All tables dropped!');

        console.log('📥 Restoring database...');

        // Remove comments and split SQL into statements
        const cleanSql = sql
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n');

        // Split into individual statements
        const statements = cleanSql
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        let executed = 0;
        for (const statement of statements) {
            if (statement.trim()) {
                await client.query(statement);
                executed++;
                if (executed % 10 === 0) {
                    console.log(
                        `   Executed ${executed}/${statements.length} statements...`
                    );
                }
            }
        }

        console.log(`✅ Executed ${executed} SQL statements successfully!`);

        // Verify data
        const usersCount = await client.query('SELECT COUNT(*) FROM users');
        const shiftsCount = await client.query('SELECT COUNT(*) FROM shifts');
        const attendanceCount = await client.query(
            'SELECT COUNT(*) FROM attendance'
        );

        await client.release();
        await pool.end();

        res.json({
            success: true,
            message: '✅ Database restored successfully!',
            data: {
                users: usersCount.rows[0].count,
                shifts: shiftsCount.rows[0].count,
                attendance: attendanceCount.rows[0].count,
            },
        });
    } catch (error) {
        console.error('❌ Restore error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            detail: error.stack,
        });
    }
});

// One-time seed endpoint - REMOVE AFTER SEEDING
router.post('/run-seed-once', async (req, res) => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    try {
        const client = await pool.connect();

        console.log('🌱 Starting database seeding...');

        // Check if data already exists
        const checkAdmin = await client.query(
            `SELECT * FROM users WHERE email = 'admin@tia.com'`
        );
        if (checkAdmin.rows.length > 0) {
            await client.release();
            return res.json({
                success: false,
                message: 'Database already seeded (admin user exists)',
            });
        }

        // Check shifts table columns first
        const columnsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'shifts'
    `);
        const hasColorColumn = columnsCheck.rows.some(
            (r) => r.column_name === 'color'
        );
        const hasShiftCodeColumn = columnsCheck.rows.some(
            (r) => r.column_name === 'shift_code'
        );

        // Create shifts
        console.log('Creating shifts...');
        let shiftsResult;
        if (hasColorColumn && hasShiftCodeColumn) {
            shiftsResult = await client.query(`
        INSERT INTO shifts (name, start_time, end_time, color, shift_code) 
        VALUES 
          ('Pagi', '06:00', '14:00', '#3B82F6', 'P'),
          ('Siang', '14:00', '22:00', '#10B981', 'S'),
          ('Malam', '22:00', '06:00', '#8B5CF6', 'M')
        ON CONFLICT DO NOTHING
        RETURNING id, name
      `);
        } else {
            // Fallback for old schema without color/shift_code
            shiftsResult = await client.query(`
        INSERT INTO shifts (name, start_time, end_time) 
        VALUES 
          ('Pagi', '06:00', '14:00'),
          ('Siang', '14:00', '22:00'),
          ('Malam', '22:00', '06:00')
        ON CONFLICT DO NOTHING
        RETURNING id, name
      `);
        }
        console.log(`✓ Created ${shiftsResult.rows.length} shifts`);

        // Create admin user
        console.log('Creating admin user...');
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);

        const adminResult = await client.query(
            `
      INSERT INTO users (
        employee_id, name, email, password, role, shift_id, is_active
      ) VALUES (
        'ADM001', 'Administrator', 'admin@tia.com', $1, 'admin', NULL, true
      )
      ON CONFLICT DO NOTHING
      RETURNING id, name, email
    `,
            [hashedPassword]
        );
        console.log(`✓ Created admin user: ${adminResult.rows[0]?.name}`);

        await client.release();
        await pool.end();

        res.json({
            success: true,
            message: '✅ Database seeded successfully!',
            data: {
                shifts: shiftsResult.rows,
                admin: adminResult.rows[0],
            },
        });
    } catch (error) {
        console.error('❌ Seeding error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

module.exports = router;
