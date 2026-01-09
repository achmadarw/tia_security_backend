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
        console.log('📖 Reading SQL backup file (data only)...');
        const sqlFile = path.join(__dirname, '../../backup_data_insert.sql');

        if (!fs.existsSync(sqlFile)) {
            return res.status(404).json({
                success: false,
                error: 'Backup file not found. Please upload backup_data_insert.sql to backend folder.',
            });
        }

        const sql = fs.readFileSync(sqlFile, 'utf8');

        console.log('🔌 Connecting to Railway database...');
        const client = await pool.connect();

        console.log('📥 Restoring data...');

        // For data-only backup, we can execute directly
        // It only contains INSERT/COPY statements, no complex functions
        await client.query(sql);

        console.log('✅ Data restored successfully!');

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

        // Get actual columns from users table
        const userColumnsResult = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'users' ORDER BY ordinal_position
        `);
        const userColumns = userColumnsResult.rows.map(r => r.column_name);
        console.log('Users table columns:', userColumns);

        // Get actual columns from shifts table  
        const shiftColumnsResult = await client.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'shifts' ORDER BY ordinal_position
        `);
        const shiftColumns = shiftColumnsResult.rows.map(r => r.column_name);
        console.log('Shifts table columns:', shiftColumns);

        // Create shifts based on available columns
        console.log('Creating shifts...');
        let shiftsQuery;
        if (shiftColumns.includes('color') && shiftColumns.includes('code')) {
            shiftsQuery = `
                INSERT INTO shifts (name, start_time, end_time, description, color, code) 
                VALUES 
                  ('Shift 1 (Pagi)', '07:00', '16:00', 'Shift pagi 07:00 - 16:00', 'hsl(43, 70%, 50%)', '1'),
                  ('Shift 2 (Siang)', '15:00', '00:00', 'Shift siang 15:00 - 24:00', 'hsl(79, 70%, 50%)', '2'),
                  ('Shift 3 (Malam)', '23:00', '07:00', 'Shift malam 23:00 - 07:00', 'hsl(352, 70%, 50%)', '3')
                RETURNING id, name
            `;
        } else {
            // Fallback for minimal schema
            shiftsQuery = `
                INSERT INTO shifts (name, start_time, end_time) 
                VALUES 
                  ('Shift 1 (Pagi)', '07:00', '16:00'),
                  ('Shift 2 (Siang)', '15:00', '00:00'),
                  ('Shift 3 (Malam)', '23:00', '07:00')
                RETURNING id, name
            `;
        }
        const shiftsResult = await client.query(shiftsQuery);
        console.log(`✓ Created ${shiftsResult.rows.length} shifts`);

        // Create admin user based on available columns
        console.log('Creating admin user...');
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);

        let adminQuery;
        if (userColumns.includes('employee_id')) {
            adminQuery = `
                INSERT INTO users (employee_id, name, email, password, role, shift_id, is_active)
                VALUES ('ADM001', 'Administrator', 'admin@tia.com', $1, 'admin', NULL, true)
                RETURNING id, name, email
            `;
        } else {
            // Fallback schema without employee_id
            adminQuery = `
                INSERT INTO users (name, email, password, role, shift_id, status)
                VALUES ('Administrator', 'admin@tia.com', $1, 'admin', NULL, 'active')
                RETURNING id, name, email
            `;
        }
        
        const adminResult = await client.query(adminQuery, [hashedPassword]);
        console.log(`✓ Created admin user: ${adminResult.rows[0]?.name}`);

        await client.release();
        await pool.end();

        res.json({
            success: true,
            message: '✅ Database seeded successfully!',
            data: {
                shifts: shiftsResult.rows,
                admin: adminResult.rows[0],
                schema: {
                    userColumns,
                    shiftColumns
                }
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
