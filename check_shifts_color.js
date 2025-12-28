const pool = require('./src/config/database');

async function checkShiftsTable() {
    try {
        // Check table structure
        const result = await pool.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'shifts'
            ORDER BY ordinal_position;
        `);

        console.log('\n📋 Shifts table structure:');
        console.log('==========================');
        result.rows.forEach((row) => {
            console.log(
                `- ${row.column_name} (${row.data_type}) ${
                    row.column_default ? `default: ${row.column_default}` : ''
                }`
            );
        });

        // Check if color column exists
        const hasColor = result.rows.some((row) => row.column_name === 'color');

        if (!hasColor) {
            console.log('\n⚠️  COLOR COLUMN NOT FOUND! Adding it now...\n');

            await pool.query(`
                ALTER TABLE shifts 
                ADD COLUMN color VARCHAR(7) DEFAULT '#2196F3'
            `);

            console.log('✅ Color column added!');

            // Update existing shifts with colors
            await pool.query(`
                UPDATE shifts 
                SET color = CASE 
                    WHEN name ILIKE '%pagi%' THEN '#2196F3'
                    WHEN name ILIKE '%siang%' THEN '#FF9800'
                    WHEN name ILIKE '%malam%' OR name ILIKE '%sore%' THEN '#9C27B0'
                    ELSE '#2196F3'
                END
            `);

            console.log('✅ Colors updated for existing shifts!\n');
        } else {
            console.log('\n✅ Color column exists!\n');
        }

        // Show current shifts with colors
        const shifts = await pool.query(
            'SELECT id, name, color FROM shifts ORDER BY id'
        );
        console.log('📊 Current shifts:');
        console.log('=================');
        shifts.rows.forEach((shift) => {
            console.log(
                `${shift.id}. ${shift.name} - Color: ${shift.color || 'NULL'}`
            );
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkShiftsTable();
