-- Data Migration Script: Convert old roster_patterns to new pattern library
-- Date: 2025-12-28
-- Run this AFTER 002_refactor_pattern_library.sql

-- ============================================================
-- Extract unique 7-day patterns from old multi-row data
-- ============================================================

-- Temporary function to extract individual patterns
CREATE OR REPLACE FUNCTION extract_patterns_from_old_data()
RETURNS void AS $$
DECLARE
    old_pattern RECORD;
    row_pattern INTEGER[];
    pattern_exists INTEGER;
    new_pattern_id INTEGER;
    row_num INTEGER;
BEGIN
    -- Loop through old patterns
    FOR old_pattern IN SELECT * FROM roster_patterns_old LOOP
        -- Loop through each row (personil) in the pattern_data
        FOR row_num IN 1..array_length(old_pattern.pattern_data, 1) LOOP
            row_pattern := old_pattern.pattern_data[row_num];
            
            -- Check if this exact pattern already exists
            SELECT id INTO pattern_exists 
            FROM patterns 
            WHERE pattern_data = row_pattern
            LIMIT 1;
            
            -- If pattern doesn't exist, create it
            IF pattern_exists IS NULL THEN
                INSERT INTO patterns (
                    name, 
                    description, 
                    pattern_data,
                    created_by,
                    created_at
                ) VALUES (
                    'Migrated Pattern ' || row_num || ' from ' || old_pattern.name,
                    'Auto-migrated from old pattern: ' || old_pattern.description,
                    row_pattern,
                    old_pattern.created_by,
                    old_pattern.created_at
                ) RETURNING id INTO new_pattern_id;
                
                RAISE NOTICE 'Created new pattern % from old pattern % row %', new_pattern_id, old_pattern.id, row_num;
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute migration
SELECT extract_patterns_from_old_data();

-- Drop temporary function
DROP FUNCTION extract_patterns_from_old_data();

-- ============================================================
-- Update pattern names to be more descriptive
-- ============================================================

-- Find OFF day position for each pattern and rename accordingly
CREATE OR REPLACE FUNCTION rename_patterns_by_off_day()
RETURNS void AS $$
DECLARE
    p RECORD;
    off_day INTEGER;
    day_name TEXT;
BEGIN
    FOR p IN SELECT id, pattern_data FROM patterns WHERE name LIKE 'Migrated%' LOOP
        -- Find which day is OFF (value = 0)
        FOR off_day IN 1..7 LOOP
            IF p.pattern_data[off_day] = 0 THEN
                day_name := CASE off_day
                    WHEN 1 THEN 'Monday'
                    WHEN 2 THEN 'Tuesday'
                    WHEN 3 THEN 'Wednesday'
                    WHEN 4 THEN 'Thursday'
                    WHEN 5 THEN 'Friday'
                    WHEN 6 THEN 'Saturday'
                    WHEN 7 THEN 'Sunday'
                END;
                
                UPDATE patterns
                SET name = 'Pattern - OFF on ' || day_name,
                    description = 'Weekly rotation with rest day on ' || day_name || '. Pattern: ' || array_to_string(p.pattern_data, ',')
                WHERE id = p.id;
                
                EXIT; -- Found OFF day, move to next pattern
            END IF;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute renaming
SELECT rename_patterns_by_off_day();

-- Drop temporary function
DROP FUNCTION rename_patterns_by_off_day();

-- ============================================================
-- Verification queries
-- ============================================================

-- Show all migrated patterns
SELECT 
    id,
    name,
    array_to_string(pattern_data, ',') as pattern_string,
    created_at
FROM patterns
ORDER BY id;

-- Count patterns
SELECT COUNT(*) as total_patterns FROM patterns;

-- Show old patterns for comparison
SELECT 
    id,
    name,
    personil_count,
    array_length(pattern_data, 1) as row_count
FROM roster_patterns_old;

RAISE NOTICE 'Migration completed successfully!';
