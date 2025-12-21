const pool = require('../src/config/database');

async function deleteFaceData(userId) {
    try {
        console.log(`🗑️  Deleting face data for user ID: ${userId}...`);

        // Delete face images
        const deleteImages = await pool.query(
            'DELETE FROM face_images WHERE user_id = $1',
            [userId]
        );
        console.log(`✅ Deleted ${deleteImages.rowCount} face images`);

        // Clear face embeddings from users table
        const updateUser = await pool.query(
            'UPDATE users SET face_embeddings = NULL, updated_at = NOW() WHERE id = $1 RETURNING name',
            [userId]
        );

        if (updateUser.rows.length > 0) {
            console.log(
                `✅ Cleared face embeddings for: ${updateUser.rows[0].name}`
            );
            console.log('\n📝 Next step: RE-REGISTER face from Flutter app');
            console.log('   Tips for best results:');
            console.log('   - Good lighting (not too dark/bright)');
            console.log('   - Face directly to camera');
            console.log('   - Distance: 30-50cm from camera');
            console.log('   - Take 15 photos from various slight angles\n');
        } else {
            console.log(`⚠️  User with ID ${userId} not found`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Get user ID from command line argument
const userId = process.argv[2] || 8;
deleteFaceData(userId);
