const pool = require('../src/config/database');

async function checkUserEmbeddings(userId) {
    try {
        console.log(`\n🔍 Checking user ID: ${userId}...`);

        const result = await pool.query(
            `SELECT id, name, 
                    face_embeddings IS NOT NULL as has_embeddings
             FROM users WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            console.log(`❌ User ${userId} not found`);
            process.exit(1);
        }

        const user = result.rows[0];
        console.log(`\n👤 User: ${user.name}`);
        console.log(`   ID: ${user.id}`);
        console.log(
            `   Has embeddings: ${user.has_embeddings ? '✅ YES' : '❌ NO'}`
        );

        const imagesResult = await pool.query(
            'SELECT COUNT(*), MAX(created_at) as last_upload FROM face_images WHERE user_id = $1',
            [userId]
        );

        console.log(`   Face images: ${imagesResult.rows[0].count}`);
        if (imagesResult.rows[0].last_upload) {
            console.log(`   Last upload: ${imagesResult.rows[0].last_upload}`);
        }

        if (!user.has_embeddings) {
            console.log(`\n⚠️  WARNING: User has NO embeddings!`);
            console.log(`   Face login will NOT work.`);
            console.log(
                `\n💡 Solution: Re-register face and make sure embeddings are sent from Flutter app`
            );
        }

        console.log('');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

const userId = process.argv[2] || 8;
checkUserEmbeddings(userId);
