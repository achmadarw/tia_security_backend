const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tia_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

// Generate random embedding (192 dimensions for mobilefacenet)
function generateRandomEmbedding() {
    const embedding = [];
    for (let i = 0; i < 192; i++) {
        embedding.push(Math.random() * 2 - 1); // Random float between -1 and 1
    }

    // Normalize to unit vector (L2 normalization)
    const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
    );
    return embedding.map((val) => val / magnitude);
}

async function generateEmbeddingsForAllUsers() {
    try {
        console.log(
            '🚀 Generating dummy embeddings for users with face images...\n'
        );

        // Get all users with face images
        const usersResult = await pool.query(`
            SELECT DISTINCT u.id, u.name, COUNT(fi.id) as image_count
            FROM users u
            JOIN face_images fi ON u.id = fi.user_id
            GROUP BY u.id, u.name
            ORDER BY u.id
        `);

        if (usersResult.rows.length === 0) {
            console.log('⚠️  No users with face images found.');
            return;
        }

        console.log(
            `Found ${usersResult.rows.length} users with face images:\n`
        );

        for (const user of usersResult.rows) {
            console.log(
                `👤 User ${user.id}: ${user.name} (${user.image_count} images)`
            );

            // Generate multiple embeddings (simulating different face angles)
            const numEmbeddings = Math.min(user.image_count, 15);
            const embeddings = [];

            for (let i = 0; i < numEmbeddings; i++) {
                embeddings.push(generateRandomEmbedding());
            }

            // Update user's face_embeddings
            await pool.query(
                'UPDATE users SET face_embeddings = $1, updated_at = NOW() WHERE id = $2',
                [JSON.stringify(embeddings), user.id]
            );

            console.log(`  ✅ Generated ${embeddings.length} dummy embeddings`);
            console.log(`  📊 Each embedding: 192 dimensions\n`);
        }

        console.log('='.repeat(60));
        console.log('✅ Complete! All users now have dummy embeddings.');
        console.log('\n⚠️  NOTE: These are DUMMY embeddings for testing only!');
        console.log(
            'Face login will NOT work correctly with these embeddings.'
        );
        console.log('They are random and will not match actual face images.');
        console.log(
            '\nTo generate real embeddings, use Python with face_recognition library.'
        );
        console.log('='.repeat(60));
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

// Run the script
generateEmbeddingsForAllUsers();
