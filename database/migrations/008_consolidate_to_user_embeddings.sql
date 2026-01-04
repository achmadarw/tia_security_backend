-- Migration: Consolidate to user_embeddings table
-- Date: 2026-01-03
-- Purpose: Migrate all embeddings to user_embeddings, remove redundancy from face_images

BEGIN;

-- Step 1: Migrate existing embeddings from face_images to user_embeddings (if any)
-- Only migrate if embedding exists and user doesn't already have embeddings in user_embeddings
INSERT INTO user_embeddings (user_id, embedding, created_at, updated_at)
SELECT 
    fi.user_id,
    fi.embedding::jsonb,
    fi.created_at,
    fi.created_at
FROM face_images fi
WHERE fi.embedding IS NOT NULL
  AND fi.embedding::text != 'null'
  AND NOT EXISTS (
      SELECT 1 FROM user_embeddings ue WHERE ue.user_id = fi.user_id
  )
ON CONFLICT DO NOTHING;

-- Step 2: Remove embedding column from face_images
-- Keep the table for image_url storage only (for profile photos/display)
ALTER TABLE face_images DROP COLUMN IF EXISTS embedding;

-- Step 3: Add comment to clarify purpose
COMMENT ON TABLE face_images IS 'Stores face image URLs for display purposes only (no embeddings)';
COMMENT ON COLUMN face_images.image_url IS 'Path to face image file for profile display';

-- Step 4: Remove face_embeddings column from users table if it exists
-- This was legacy storage in users table as JSONB array
ALTER TABLE users DROP COLUMN IF EXISTS face_embeddings;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 008 completed successfully';
    RAISE NOTICE '   - Migrated embeddings from face_images to user_embeddings';
    RAISE NOTICE '   - Removed embedding column from face_images';
    RAISE NOTICE '   - face_images now stores image URLs only';
    RAISE NOTICE '   - All embeddings consolidated in user_embeddings table';
END $$;

COMMIT;
