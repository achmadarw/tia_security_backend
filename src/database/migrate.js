const pool = require('../config/database');

const migrations = [
    // Create users table
    `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'security',
    face_embeddings JSON,
    shift_id INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create shifts table
    `CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create attendance table
    `CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    shift_id INTEGER REFERENCES shifts(id),
    type VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    face_confidence DECIMAL(5, 2),
    photo_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create blocks table
    `CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create reports table
    `CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    block_id INTEGER REFERENCES blocks(id),
    shift_id INTEGER REFERENCES shifts(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200),
    description TEXT,
    photo_url VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    created_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create face_images table
    `CREATE TABLE IF NOT EXISTS face_images (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    image_url VARCHAR(255),
    embedding JSON,
    created_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create audit_logs table
    `CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100),
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
  )`,

    // Create indexes
    `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reports_block ON reports(block_id)`,
    `CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(created_at)`,

    // Create roster_patterns table
    `CREATE TABLE IF NOT EXISTS roster_patterns (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      personil_count INTEGER NOT NULL CHECK (personil_count > 0),
      pattern_data JSONB NOT NULL,
      is_default BOOLEAN DEFAULT false,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      usage_count INTEGER DEFAULT 0,
      last_used_at TIMESTAMP WITH TIME ZONE
    )`,

    // Create indexes for roster_patterns
    `CREATE INDEX IF NOT EXISTS idx_roster_patterns_personil_count ON roster_patterns(personil_count)`,
    `CREATE INDEX IF NOT EXISTS idx_roster_patterns_is_default ON roster_patterns(is_default) WHERE is_default = true`,
    `CREATE INDEX IF NOT EXISTS idx_roster_patterns_created_by ON roster_patterns(created_by)`,
];

async function migrate() {
    const client = await pool.connect();

    try {
        console.log('🚀 Starting database migration...\n');

        await client.query('BEGIN');

        for (let i = 0; i < migrations.length; i++) {
            console.log(`Running migration ${i + 1}/${migrations.length}...`);
            await client.query(migrations[i]);
            console.log(`✅ Migration ${i + 1} completed\n`);
        }

        await client.query('COMMIT');
        console.log('✅ All migrations completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrate().catch((err) => {
    console.error(err);
    process.exit(1);
});
