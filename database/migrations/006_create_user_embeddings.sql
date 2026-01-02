-- Migration: Create user_embeddings table
-- Date: 2026-01-02
-- Purpose: Store face embeddings for face recognition (Phase 1B)

-- Create user_embeddings table if not exists
CREATE TABLE IF NOT EXISTS user_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    embedding JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster user lookup
CREATE INDEX IF NOT EXISTS idx_user_embeddings_user_id ON user_embeddings(user_id);

-- Add comment
COMMENT ON TABLE user_embeddings IS 'Stores face embeddings for face recognition (192D vectors)';
COMMENT ON COLUMN user_embeddings.embedding IS 'Face embedding as JSON array of 192 floats';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 006_create_user_embeddings completed successfully';
END $$;
