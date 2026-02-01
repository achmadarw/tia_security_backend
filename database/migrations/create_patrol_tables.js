/**
 * Migration: Create Patrol Tables
 * Purpose: Real-time GPS patrol tracking dengan offline support
 * Date: January 19, 2026
 */

const pool = require('../../src/config/database');

async function up() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting migration: Create patrol tables...');

        await client.query('BEGIN');

        // 1. Create patrol_sessions table
        console.log('📊 Creating patrol_sessions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS patrol_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                post_session_id INTEGER REFERENCES pos_sessions(id),
                start_time TIMESTAMP NOT NULL DEFAULT NOW(),
                end_time TIMESTAMP,
                start_lat DECIMAL(10, 8) NOT NULL,
                start_lng DECIMAL(11, 8) NOT NULL,
                end_lat DECIMAL(10, 8),
                end_lng DECIMAL(11, 8),
                status VARCHAR(20) DEFAULT 'active',
                notes TEXT,
                total_duration_seconds INTEGER,
                total_checkpoints INTEGER DEFAULT 0,
                total_track_points INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                
                CONSTRAINT patrol_sessions_status_check 
                    CHECK (status IN ('active', 'completed', 'abandoned'))
            )
        `);

        // 2. Create patrol_checkpoints table
        console.log('📊 Creating patrol_checkpoints table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS patrol_checkpoints (
                id SERIAL PRIMARY KEY,
                patrol_session_id INTEGER NOT NULL REFERENCES patrol_sessions(id) ON DELETE CASCADE,
                block_id INTEGER REFERENCES blocks(id),
                block_name VARCHAR(100) NOT NULL,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                entered_at TIMESTAMP NOT NULL,
                exited_at TIMESTAMP,
                dwell_seconds INTEGER DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                
                CONSTRAINT patrol_checkpoints_dwell_check 
                    CHECK (dwell_seconds >= 0)
            )
        `);

        // 3. Create patrol_track_points table
        console.log('📊 Creating patrol_track_points table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS patrol_track_points (
                id SERIAL PRIMARY KEY,
                patrol_session_id INTEGER NOT NULL REFERENCES patrol_sessions(id) ON DELETE CASCADE,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                accuracy DECIMAL(6, 2),
                speed DECIMAL(6, 2),
                heading DECIMAL(6, 2),
                timestamp TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // 4. Create patrol_photos table
        console.log('📊 Creating patrol_photos table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS patrol_photos (
                id SERIAL PRIMARY KEY,
                patrol_session_id INTEGER NOT NULL REFERENCES patrol_sessions(id) ON DELETE CASCADE,
                photo_url VARCHAR(500) NOT NULL,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                taken_at TIMESTAMP NOT NULL,
                caption TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // 5. Create indexes for performance
        console.log('⚡ Creating indexes...');

        // Patrol sessions indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_sessions_user_id 
                ON patrol_sessions(user_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_sessions_status 
                ON patrol_sessions(status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_sessions_start_time 
                ON patrol_sessions(start_time DESC)
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_patrol_sessions_active_unique 
                ON patrol_sessions(user_id) 
                WHERE status = 'active'
        `);

        // Patrol checkpoints indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_checkpoints_session_id 
                ON patrol_checkpoints(patrol_session_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_checkpoints_block_id 
                ON patrol_checkpoints(block_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_checkpoints_entered_at 
                ON patrol_checkpoints(entered_at)
        `);

        // Patrol track points indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_track_points_session_id 
                ON patrol_track_points(patrol_session_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_track_points_timestamp 
                ON patrol_track_points(timestamp)
        `);

        // Patrol photos indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_patrol_photos_session_id 
                ON patrol_photos(patrol_session_id)
        `);

        // 6. Add table comments
        console.log('📝 Adding table comments...');
        await client.query(`
            COMMENT ON TABLE patrol_sessions IS 
            'Main patrol sessions dengan GPS tracking real-time'
        `);
        await client.query(`
            COMMENT ON TABLE patrol_checkpoints IS 
            'Checkpoint saat security memasuki block/area tertentu'
        `);
        await client.query(`
            COMMENT ON TABLE patrol_track_points IS 
            'GPS breadcrumb trail setiap 1 detik'
        `);
        await client.query(`
            COMMENT ON TABLE patrol_photos IS 
            'Foto dokumentasi selama patroli'
        `);

        // 7. Add column comments
        await client.query(`
            COMMENT ON COLUMN patrol_sessions.total_duration_seconds IS 
            'Total durasi patroli dalam detik'
        `);
        await client.query(`
            COMMENT ON COLUMN patrol_checkpoints.dwell_seconds IS 
            'Durasi di lokasi dalam detik'
        `);
        await client.query(`
            COMMENT ON COLUMN patrol_track_points.accuracy IS 
            'GPS accuracy dalam meter'
        `);
        await client.query(`
            COMMENT ON COLUMN patrol_track_points.speed IS 
            'Kecepatan dalam m/s'
        `);

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');

        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function down() {
    const client = await pool.connect();

    try {
        console.log('🔄 Rolling back migration: Drop patrol tables...');

        await client.query('BEGIN');

        await client.query('DROP TABLE IF EXISTS patrol_photos CASCADE');
        await client.query('DROP TABLE IF EXISTS patrol_track_points CASCADE');
        await client.query('DROP TABLE IF EXISTS patrol_checkpoints CASCADE');
        await client.query('DROP TABLE IF EXISTS patrol_sessions CASCADE');

        await client.query('COMMIT');
        console.log('✅ Rollback completed successfully!');

        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Rollback failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Run migration if called directly
if (require.main === module) {
    up()
        .then(() => {
            console.log('Migration script finished');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration script failed:', error);
            process.exit(1);
        });
}

module.exports = { up, down };
