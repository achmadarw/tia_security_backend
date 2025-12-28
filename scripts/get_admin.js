const pool = require('../src/config/database');

async function getAdmin() {
    try {
        const result = await pool.query(`
            SELECT id, name, phone, role 
            FROM users 
            WHERE role = 'admin' 
            LIMIT 1
        `);

        console.log('Admin user found:');
        console.log(JSON.stringify(result.rows[0], null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

getAdmin();
