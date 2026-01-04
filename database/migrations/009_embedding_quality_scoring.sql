-- Migration: Embedding Quality Scoring System
-- Date: 2026-01-03
-- Purpose: Add quality scoring columns to user_embeddings (Phase 2 MEDIUM)

BEGIN;

-- Step 1: Add quality scoring columns to user_embeddings
ALTER TABLE user_embeddings 
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS consistency_score DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS distinctiveness_score DECIMAL(5,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Step 2: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_embeddings_quality 
ON user_embeddings(user_id, quality_score DESC) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_embeddings_active 
ON user_embeddings(user_id, is_active);

-- Step 3: Add comments
COMMENT ON COLUMN user_embeddings.quality_score IS 'Overall quality score (0-100): combination of consistency and distinctiveness';
COMMENT ON COLUMN user_embeddings.consistency_score IS 'Intra-class consistency (0-100): how similar to user''s other embeddings';
COMMENT ON COLUMN user_embeddings.distinctiveness_score IS 'Inter-class separation (0-100): how different from other users'' embeddings';
COMMENT ON COLUMN user_embeddings.is_active IS 'Whether embedding is active for face matching (low quality can be deactivated)';

-- Step 4: Create embedding_quality_history table for tracking
CREATE TABLE IF NOT EXISTS embedding_quality_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    embedding_id INTEGER NOT NULL REFERENCES user_embeddings(id) ON DELETE CASCADE,
    quality_score DECIMAL(5,2) NOT NULL,
    consistency_score DECIMAL(5,2),
    distinctiveness_score DECIMAL(5,2),
    calculation_method VARCHAR(50),
    calculated_at TIMESTAMP DEFAULT NOW()
);

-- Index for history lookup
CREATE INDEX IF NOT EXISTS idx_embedding_quality_history_user 
ON embedding_quality_history(user_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_embedding_quality_history_embedding 
ON embedding_quality_history(embedding_id);

-- Comments
COMMENT ON TABLE embedding_quality_history IS 'Historical record of quality score calculations for analysis and improvement';
COMMENT ON COLUMN embedding_quality_history.calculation_method IS 'Method used for scoring (e.g., euclidean_v1, cosine_v1)';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 009 completed successfully';
    RAISE NOTICE '   - Added quality scoring columns to user_embeddings';
    RAISE NOTICE '   - Created embedding_quality_history table';
    RAISE NOTICE '   - Added indexes for performance';
    RAISE NOTICE '   - Ready for quality scoring system';
END $$;

COMMIT;
