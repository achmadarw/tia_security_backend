const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

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

        // Create shifts
        console.log('Creating shifts...');
        const shiftsResult = await client.query(`
      INSERT INTO shifts (name, start_time, end_time, color, shift_code) 
      VALUES 
        ('Pagi', '06:00', '14:00', '#3B82F6', 'P'),
        ('Siang', '14:00', '22:00', '#10B981', 'S'),
        ('Malam', '22:00', '06:00', '#8B5CF6', 'M')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
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
