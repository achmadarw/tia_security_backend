const pool = require('../config/database');
const bcrypt = require('bcrypt');

async function seed() {
    const client = await pool.connect();

    try {
        console.log('🌱 Seeding database...\n');

        await client.query('BEGIN');

        // Seed Shifts
        console.log('Creating shifts...');
        await client.query(`
      INSERT INTO shifts (name, start_time, end_time) VALUES
      ('Shift Pagi', '06:00:00', '14:00:00'),
      ('Shift Siang', '14:00:00', '22:00:00'),
      ('Shift Malam', '22:00:00', '06:00:00')
      ON CONFLICT DO NOTHING
    `);
        console.log('✅ Shifts created\n');

        // Seed Blocks
        console.log('Creating blocks...');
        await client.query(`
      INSERT INTO blocks (name, description) VALUES
      ('Blok A', 'Blok A - Area Depan'),
      ('Blok B', 'Blok B - Area Tengah'),
      ('Blok C', 'Blok C - Area Belakang'),
      ('Blok D', 'Blok D - Area Samping Kiri'),
      ('Blok E', 'Blok E - Area Samping Kanan')
      ON CONFLICT DO NOTHING
    `);
        console.log('✅ Blocks created\n');

        // Seed Admin User
        console.log('Creating admin user...');
        const hashedPassword = await bcrypt.hash('admin123', 12);
        await client.query(
            `
      INSERT INTO users (name, email, phone, password, role, status) VALUES
      ('Admin', 'admin@tia.com', '081234567890', $1, 'admin', 'active')
      ON CONFLICT (phone) DO NOTHING
    `,
            [hashedPassword]
        );
        console.log('✅ Admin user created');
        console.log('   Email: admin@tia.com');
        console.log('   Phone: 081234567890');
        console.log('   Password: admin123\n');

        // DISABLED: Sample Security Users (commented out to use real data)
        /*
        console.log('Creating sample security users...');
        const securityPassword = await bcrypt.hash('security123', 12);

        for (let i = 1; i <= 5; i++) {
            await client.query(
                `
        INSERT INTO users (name, phone, password, role, shift_id, status) VALUES
        ($1, $2, $3, 'security', $4, 'active')
        ON CONFLICT (phone) DO NOTHING
      `,
                [
                    `Security ${i}`,
                    `0812345678${90 + i}`,
                    securityPassword,
                    ((i - 1) % 3) + 1, // Distribute across 3 shifts
                ]
            );
        }
        console.log('✅ 5 security users created');
        console.log('   Password for all: security123\n');
        */

        // Seed Roster Patterns
        console.log('Creating default roster patterns...');

        // Pattern for 4 personil (from Juni 2025 reference)
        const pattern4 = JSON.stringify([
            [1, 3, 2, 3, 2, 2, 0], // Row 1
            [0, 1, 3, 2, 3, 3, 2], // Row 2
            [2, 0, 1, 3, 3, 3, 3], // Row 3
            [3, 2, 0, 1, 1, 1, 1], // Row 4
        ]);

        // Pattern for 5 personil (from Oktober-Desember 2025 reference)
        const pattern5 = JSON.stringify([
            [1, 3, 3, 3, 2, 2, 0], // Row 1
            [3, 3, 2, 2, 1, 0, 1], // Row 2
            [3, 2, 3, 2, 0, 1, 3], // Row 3
            [2, 0, 1, 1, 3, 3, 3], // Row 4
            [0, 1, 2, 3, 3, 3, 2], // Row 5
        ]);

        await client.query(
            `INSERT INTO roster_patterns (name, description, personil_count, pattern_data, is_default)
       VALUES 
       ('Pattern 4 Personil - Balanced', 'Proven pattern from Juni 2025 roster. Balanced OFF days with 7-day rotation cycle.', 4, $1, true),
       ('Pattern 5 Personil - Balanced', 'Proven pattern from Oktober-Desember 2025 roster. Optimized for 5 personnel with staggered OFF days.', 5, $2, true)
       ON CONFLICT DO NOTHING`,
            [pattern4, pattern5]
        );
        console.log('✅ Default roster patterns created\n');

        await client.query('COMMIT');
        console.log('✅ Database seeding completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch((err) => {
    console.error(err);
    process.exit(1);
});
