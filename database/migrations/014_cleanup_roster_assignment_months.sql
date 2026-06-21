-- Migration: Clean invalid roster assignment month dates
-- Date: 2026-06-21
-- Description: roster_assignments.assignment_month must always be the first day of month.

DELETE FROM roster_assignments
WHERE assignment_month <> DATE_TRUNC('month', assignment_month)::date;
