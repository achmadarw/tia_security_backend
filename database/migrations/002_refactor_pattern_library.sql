-- Migration: Refactor Roster Pattern to Pattern Library Model
-- Date: 2025-12-28
-- Description: Change from multi-row patterns to single pattern library + assignments

-- ============================================================
-- STEP 1: Rename existing table for backup
-- ============================================================
ALTER TABLE roster_patterns RENAME TO roster_patterns_old;

-- ============================================================
-- STEP 2: Create new Pattern Library table (single 7-day pattern)
-- ============================================================
CREATE TABLE patterns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 7-day pattern array [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    -- 0 = OFF, 1 = Pagi, 2 = Siang, 3 = Sore
    pattern_data INTEGER[] NOT NULL CHECK (array_length(pattern_data, 1) = 7),
    
    -- Pattern metadata
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    CONSTRAINT pattern_data_values CHECK (
        pattern_data[1] BETWEEN 0 AND 3 AND
        pattern_data[2] BETWEEN 0 AND 3 AND
        pattern_data[3] BETWEEN 0 AND 3 AND
        pattern_data[4] BETWEEN 0 AND 3 AND
        pattern_data[5] BETWEEN 0 AND 3 AND
        pattern_data[6] BETWEEN 0 AND 3 AND
        pattern_data[7] BETWEEN 0 AND 3
    )
);

-- Index for searching patterns
CREATE INDEX idx_patterns_active ON patterns(is_active);
CREATE INDEX idx_patterns_created_by ON patterns(created_by);

-- ============================================================
-- STEP 3: Create Roster Assignments table (personil-pattern mapping)
-- ============================================================
CREATE TABLE roster_assignments (
    id SERIAL PRIMARY KEY,
    
    -- Assignment details
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id INTEGER NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
    
    -- Time period
    assignment_month DATE NOT NULL, -- First day of the month (e.g., 2025-12-01)
    
    -- Assignment metadata
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    
    -- Ensure one pattern per person per month
    CONSTRAINT unique_assignment UNIQUE (user_id, assignment_month)
);

-- Indexes for quick lookups
CREATE INDEX idx_assignments_user ON roster_assignments(user_id);
CREATE INDEX idx_assignments_pattern ON roster_assignments(pattern_id);
CREATE INDEX idx_assignments_month ON roster_assignments(assignment_month);
CREATE INDEX idx_assignments_user_month ON roster_assignments(user_id, assignment_month);

-- ============================================================
-- STEP 4: Insert default patterns from analysis
-- ============================================================

-- Pattern A: OFF on Sunday (day 7)
INSERT INTO patterns (name, description, pattern_data, is_active) VALUES
('Pattern A - Weekend OFF', 'Standard pattern with Sunday off. Balanced morning, afternoon, and evening shifts.', 
 ARRAY[1,3,3,3,2,2,0], true);

-- Pattern B: OFF on Saturday (day 6)
INSERT INTO patterns (name, description, pattern_data, is_active) VALUES
('Pattern B - Saturday OFF', 'Pattern with Saturday off. Good for weekend rotation coverage.', 
 ARRAY[3,3,2,2,1,0,1], true);

-- Pattern C: OFF on Friday (day 5)
INSERT INTO patterns (name, description, pattern_data, is_active) VALUES
('Pattern C - Friday OFF', 'Pattern with Friday off. Covers weekend with morning shift on Sunday.', 
 ARRAY[3,2,3,2,0,1,3], true);

-- Pattern D: OFF on Tuesday (day 2)
INSERT INTO patterns (name, description, pattern_data, is_active) VALUES
('Pattern D - Midweek OFF', 'Pattern with Tuesday off. Provides midweek rest with strong weekend coverage.', 
 ARRAY[2,0,1,1,3,3,3], true);

-- Pattern E: OFF on Monday (day 1)
INSERT INTO patterns (name, description, pattern_data, is_active) VALUES
('Pattern E - Monday OFF', 'Pattern with Monday off. Good for rotation after weekend work.', 
 ARRAY[0,1,2,3,3,3,2], true);

-- ============================================================
-- STEP 5: Create view for easy roster generation
-- ============================================================
CREATE OR REPLACE VIEW v_roster_assignments AS
SELECT 
    ra.id,
    ra.assignment_month,
    u.id as user_id,
    u.name as user_name,
    u.phone as user_phone,
    u.role as user_role,
    p.id as pattern_id,
    p.name as pattern_name,
    p.pattern_data,
    ra.notes,
    ra.assigned_at
FROM roster_assignments ra
JOIN users u ON ra.user_id = u.id
JOIN patterns p ON ra.pattern_id = p.id
WHERE u.status = 'active' AND p.is_active = true
ORDER BY ra.assignment_month DESC, u.name;

-- ============================================================
-- STEP 6: Add comments for documentation
-- ============================================================
COMMENT ON TABLE patterns IS 'Pattern library: single 7-day shift patterns (independent of personil count)';
COMMENT ON TABLE roster_assignments IS 'Monthly assignments: which personil uses which pattern for a given month';
COMMENT ON TABLE roster_patterns_old IS 'DEPRECATED: Old multi-row pattern format. Keep for data migration reference.';

COMMENT ON COLUMN patterns.pattern_data IS '7-day array: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]. Values: 0=OFF, 1=Pagi, 2=Siang, 3=Sore';
COMMENT ON COLUMN roster_assignments.assignment_month IS 'First day of month (YYYY-MM-01) when this pattern assignment is active';

-- ============================================================
-- STEP 7: Grant permissions (skip if tia_user doesn't exist)
-- ============================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON patterns TO tia_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON roster_assignments TO tia_user;
-- GRANT USAGE, SELECT ON SEQUENCE patterns_id_seq TO tia_user;
-- GRANT USAGE, SELECT ON SEQUENCE roster_assignments_id_seq TO tia_user;
-- GRANT SELECT ON v_roster_assignments TO tia_user;
