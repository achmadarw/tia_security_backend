-- Migration: Create auto assign undo snapshots
-- Date: 2026-06-21
-- Description: Store the previous month roster before Auto Assign so it can be restored.

CREATE TABLE IF NOT EXISTS roster_auto_assign_snapshots (
    id SERIAL PRIMARY KEY,
    assignment_month DATE NOT NULL,
    roster_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
    shift_assignments JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    restored_at TIMESTAMP,
    restored_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roster_auto_assign_snapshots_month
    ON roster_auto_assign_snapshots(assignment_month);

CREATE INDEX IF NOT EXISTS idx_roster_auto_assign_snapshots_active
    ON roster_auto_assign_snapshots(assignment_month, restored_at, created_at DESC);
