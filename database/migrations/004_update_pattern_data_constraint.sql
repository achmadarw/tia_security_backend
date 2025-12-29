-- Migration: Update Pattern Data Constraint to Support Dynamic Shift IDs
-- Date: 2025-12-30
-- Description: Change pattern_data constraint from 0-3 to 0+ to support dynamic shift IDs

-- Drop the old constraint
ALTER TABLE patterns DROP CONSTRAINT IF EXISTS pattern_data_values;

-- Add new constraint that allows any non-negative integer (0 = OFF, >0 = shift ID)
ALTER TABLE patterns ADD CONSTRAINT pattern_data_values CHECK (
    pattern_data[1] >= 0 AND
    pattern_data[2] >= 0 AND
    pattern_data[3] >= 0 AND
    pattern_data[4] >= 0 AND
    pattern_data[5] >= 0 AND
    pattern_data[6] >= 0 AND
    pattern_data[7] >= 0
);

-- Optional: Add comment to document the change
COMMENT ON CONSTRAINT pattern_data_values ON patterns IS 'Pattern data values: 0 = OFF, >0 = shift ID from shifts table';
