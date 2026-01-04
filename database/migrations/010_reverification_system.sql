-- ==========================================
-- Migration: 010 - Re-verification System
-- Description: Tables and triggers for handling ambiguous face matches and anomaly detection
-- Author: TIA Development Team
-- Date: 2025-01-03
-- ==========================================

-- 1. Pending Attendance Table (for ambiguous matches)
CREATE TABLE IF NOT EXISTS pending_attendance (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    
    -- Attendance details
    check_time TIMESTAMP NOT NULL,
    check_type VARCHAR(20) NOT NULL CHECK (check_type IN ('check_in', 'check_out')),
    location_name VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    notes TEXT,
    photo TEXT,
    
    -- Face verification details
    confidence_score DECIMAL(5, 2),
    matched_embeddings JSONB, -- Array of {embedding_id, distance, quality_score}
    security_level VARCHAR(20) CHECK (security_level IN ('LOW', 'MEDIUM', 'HIGH')),
    
    -- Reverification reason
    reason VARCHAR(100) NOT NULL CHECK (reason IN (
        'low_confidence', 
        'multiple_matches', 
        'anomaly_detected',
        'manual_request',
        'quality_poor'
    )),
    reason_details TEXT,
    
    -- Review status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INT REFERENCES users(id),
    reviewed_at TIMESTAMP,
    review_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Attendance Anomaly Log (for suspicious patterns)
CREATE TABLE IF NOT EXISTS attendance_anomaly_log (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    attendance_id INT REFERENCES attendance(id) ON DELETE SET NULL,
    pending_attendance_id INT REFERENCES pending_attendance(id) ON DELETE SET NULL,
    
    -- Anomaly details
    anomaly_type VARCHAR(50) NOT NULL CHECK (anomaly_type IN (
        'location_anomaly',      -- Check-in from unusual location
        'time_anomaly',          -- Check-in at unusual time
        'frequency_anomaly',     -- Too many check-ins in short period
        'pattern_anomaly',       -- Deviation from normal behavior
        'distance_anomaly',      -- Too far from usual location
        'confidence_low'         -- Consistently low face confidence
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    anomaly_score DECIMAL(5, 2), -- 0-100, higher = more suspicious
    
    -- Context
    context_data JSONB, -- Store relevant context (location, time, confidence, etc)
    
    -- Resolution
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive')),
    resolved_by INT REFERENCES users(id),
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Indexes for performance
CREATE INDEX idx_pending_attendance_user ON pending_attendance(user_id);
CREATE INDEX idx_pending_attendance_status ON pending_attendance(status);
CREATE INDEX idx_pending_attendance_check_time ON pending_attendance(check_time);
CREATE INDEX idx_pending_attendance_reason ON pending_attendance(reason);

CREATE INDEX idx_anomaly_log_user ON attendance_anomaly_log(user_id);
CREATE INDEX idx_anomaly_log_type ON attendance_anomaly_log(anomaly_type);
CREATE INDEX idx_anomaly_log_severity ON attendance_anomaly_log(severity);
CREATE INDEX idx_anomaly_log_status ON attendance_anomaly_log(status);
CREATE INDEX idx_anomaly_log_created ON attendance_anomaly_log(created_at);

-- 4. Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pending_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pending_attendance_updated_at
    BEFORE UPDATE ON pending_attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_pending_attendance_updated_at();

CREATE OR REPLACE FUNCTION update_anomaly_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_anomaly_log_updated_at
    BEFORE UPDATE ON attendance_anomaly_log
    FOR EACH ROW
    EXECUTE FUNCTION update_anomaly_log_updated_at();

-- 5. Add configuration for anomaly detection thresholds
-- (Optional: can be stored in a settings table or environment variables)
-- Example thresholds:
-- - Low confidence: < 65%
-- - Multiple matches: distance < 0.6 for 2+ users
-- - Location anomaly: > 500m from usual location
-- - Frequency anomaly: > 5 check-ins in 1 hour
-- - Time anomaly: Check-in outside 05:00-23:00
