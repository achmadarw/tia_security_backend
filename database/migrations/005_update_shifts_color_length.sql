-- Migration: Update Shifts Color Column Length
-- Date: 2025-12-30
-- Description: Change color column from VARCHAR(7) to VARCHAR(50) to support HSL color format

-- Update the color column to support longer color formats (HSL, RGB, etc)
ALTER TABLE shifts ALTER COLUMN color TYPE VARCHAR(50);

-- Add comment to document the change
COMMENT ON COLUMN shifts.color IS 'Shift color in any CSS format: hex (#RRGGBB), hsl(h, s%, l%), rgb(r, g, b), etc';
