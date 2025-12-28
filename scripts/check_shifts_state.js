const pool = require('../src/config/database');

async function checkShiftsState() {
    const client = await pool.connect();
    try {
        console.log('🔍 Checking shifts table state...\n');

        // Check if shifts table exists
        const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'shifts'
      );
    `);

        if (!tableCheck.rows[0].exists) {
            console.log('❌ Shifts table does not exist');
            return;
        }

        console.log('✅ Shifts table exists\n');

        // Get columns
        const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'shifts' 
      ORDER BY ordinal_position
    `);

        console.log('📋 Shifts table columns:');
        columns.rows.forEach((col) => {
            console.log(
                `  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`
            );
        });

        // Get data
        const data = await client.query('SELECT * FROM shifts');
        console.log(`\n📊 Shifts data (${data.rows.length} rows):`);
        data.rows.forEach((row) => {
            console.log(
                `  - ID: ${row.id}, Name: ${row.name}, Start: ${row.start_time}, End: ${row.end_time}`
            );
        });

        // Check shift_assignments table
        const assignmentsCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'shift_assignments'
      );
    `);

        console.log(
            `\n${
                assignmentsCheck.rows[0].exists ? '✅' : '❌'
            } Shift_assignments table ${
                assignmentsCheck.rows[0].exists ? 'exists' : 'does not exist'
            }`
        );

        // Check attendance columns
        const attendanceColumns = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'attendance' 
      AND column_name IN ('shift_assignment_id', 'is_late', 'is_early_leave', 'is_overtime', 'late_minutes', 'overtime_minutes')
    `);

        console.log(
            `\n📋 Attendance table new columns (${attendanceColumns.rows.length}/6):`
        );
        attendanceColumns.rows.forEach((col) => {
            console.log(`  - ${col.column_name}`);
        });
    } finally {
        client.release();
        await pool.end();
    }
}

checkShiftsState().catch(console.error);
