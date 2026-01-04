-- Migration 007: Add face validation columns to attendance table
-- Purpose: Track face recognition confidence and verification status

-- Add columns to attendance table
ALTER TABLE attendance 
ADD COLUMN IF NOT EXISTS face_confidence DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS face_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS security_level VARCHAR(10),
ADD COLUMN IF NOT EXISTS verification_attempts INT DEFAULT 1;

-- Create attendance verification audit log table
CREATE TABLE IF NOT EXISTS attendance_verification_log (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attendance_id INT REFERENCES attendance(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL,
    confidence DECIMAL(5,2),
    margin DECIMAL(5,2),
    reason VARCHAR(100),
    requires_reverification BOOLEAN DEFAULT false,
    ip_address VARCHAR(45),
    device_id VARCHAR(255),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_face_verified 
    ON attendance(user_id, face_verified);

CREATE INDEX IF NOT EXISTS idx_attendance_verification_log_user 
    ON attendance_verification_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_verification_log_success 
    ON attendance_verification_log(success, created_at DESC);

-- Comments for documentation
COMMENT ON COLUMN attendance.face_confidence IS 'Face recognition confidence percentage (0-100)';
COMMENT ON COLUMN attendance.face_verified IS 'Whether attendance was verified with face recognition';
COMMENT ON COLUMN attendance.security_level IS 'Security level applied: LOW, MEDIUM, HIGH';
COMMENT ON COLUMN attendance.verification_attempts IS 'Number of verification attempts made';

COMMENT ON TABLE attendance_verification_log IS 'Audit log for all attendance face verification attempts';
