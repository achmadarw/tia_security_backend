/**
 * Migration: Create roster_patterns table
 * Purpose: Store pattern templates for roster auto-generation
 */

const { Pool } = require('pg');

async function up(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS roster_patterns (
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
      last_used_at TIMESTAMP WITH TIME ZONE,
      CONSTRAINT unique_default_per_count UNIQUE NULLS NOT DISTINCT (personil_count, is_default)
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_roster_patterns_personil_count 
      ON roster_patterns(personil_count);
    
    CREATE INDEX IF NOT EXISTS idx_roster_patterns_is_default 
      ON roster_patterns(is_default) WHERE is_default = true;
    
    CREATE INDEX IF NOT EXISTS idx_roster_patterns_created_by 
      ON roster_patterns(created_by);

    -- Trigger to auto-update updated_at
    CREATE OR REPLACE FUNCTION update_roster_patterns_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER roster_patterns_updated_at
      BEFORE UPDATE ON roster_patterns
      FOR EACH ROW
      EXECUTE FUNCTION update_roster_patterns_updated_at();

    -- Function to ensure only one default pattern per personil_count
    CREATE OR REPLACE FUNCTION ensure_single_default_pattern()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.is_default = true THEN
        UPDATE roster_patterns 
        SET is_default = false 
        WHERE personil_count = NEW.personil_count 
          AND id != NEW.id 
          AND is_default = true;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER roster_patterns_single_default
      BEFORE INSERT OR UPDATE ON roster_patterns
      FOR EACH ROW
      WHEN (NEW.is_default = true)
      EXECUTE FUNCTION ensure_single_default_pattern();

    -- Add comment
    COMMENT ON TABLE roster_patterns IS 'Stores roster pattern templates for auto-generation';
    COMMENT ON COLUMN roster_patterns.pattern_data IS 'Array of arrays representing 7-day cycle per row: [[1,3,3,3,2,2,0], ...]';
    COMMENT ON COLUMN roster_patterns.personil_count IS 'Number of personnel this pattern is designed for';
    COMMENT ON COLUMN roster_patterns.usage_count IS 'Number of times this pattern has been used';
  `);

    console.log('✓ Created roster_patterns table with indexes and triggers');
}

async function down(pool) {
    await pool.query(`
    DROP TRIGGER IF EXISTS roster_patterns_single_default ON roster_patterns;
    DROP TRIGGER IF EXISTS roster_patterns_updated_at ON roster_patterns;
    DROP FUNCTION IF EXISTS ensure_single_default_pattern();
    DROP FUNCTION IF EXISTS update_roster_patterns_updated_at();
    DROP TABLE IF EXISTS roster_patterns CASCADE;
  `);

    console.log('✓ Dropped roster_patterns table');
}

module.exports = { up, down };
