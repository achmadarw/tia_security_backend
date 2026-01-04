-- Migration: 011 - Add image_url to user_embeddings
-- Description: Allow storing image URL alongside each embedding for display purposes
-- Date: 2026-01-04

-- Add image_url column to user_embeddings
ALTER TABLE user_embeddings 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_embeddings_image_url 
ON user_embeddings(user_id, image_url) 
WHERE image_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN user_embeddings.image_url IS 'URL path to the face image file for display purposes';
