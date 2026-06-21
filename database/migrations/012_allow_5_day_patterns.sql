-- Migration: Allow 5-day and 7-day roster patterns
-- Date: 2026-06-19
-- Description: Support 5p-2s rotating patterns with 5-day cycles.

ALTER TABLE patterns DROP CONSTRAINT IF EXISTS patterns_pattern_data_check;
ALTER TABLE patterns DROP CONSTRAINT IF EXISTS pattern_data_values;
ALTER TABLE patterns DROP CONSTRAINT IF EXISTS pattern_data_length;

ALTER TABLE patterns
ADD CONSTRAINT pattern_data_length CHECK (
    array_length(pattern_data, 1) IN (5, 7)
);

ALTER TABLE patterns
ADD CONSTRAINT pattern_data_values CHECK (
    array_position(pattern_data, NULL) IS NULL
    AND 0 <= ALL(pattern_data)
);

COMMENT ON CONSTRAINT pattern_data_length ON patterns IS
    'Pattern length: 5 days for 5p-2s rotation, 7 days for 5p-3s rotation';

COMMENT ON CONSTRAINT pattern_data_values ON patterns IS
    'Pattern data values: 0 = OFF, >0 = shift ID from shifts table';
