const pool = require('../src/config/database');
const bcrypt = require('bcrypt');

async function resetAdminPassword() {
    try {
        const newPassword = '123456';
        const hash = await bcrypt.hash(newPassword, 10);

        const result = await pool.query(
            `
            UPDATE users 
            SET password = $1 
            WHERE phone = '081234567890'
            RETURNING id, name, phone, role
        `,
            [hash]
        );

        console.log('✅ Password reset successful for:');
        console.log(result.rows[0]);
        console.log(`\nNew password: ${newPassword}`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

resetAdminPassword();
