const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authenticateToken,
    requireRole,
} = require('../middleware/auth.middleware');

// ============================================================
// ROSTER ASSIGNMENT ROUTES (Personil-Pattern mapping per month)
// ============================================================

/**
 * GET /api/roster-assignments
 * Get all assignments
 * Query params: ?month=2025-12&user_id=5
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { month, user_id } = req.query;

        let query = 'SELECT * FROM v_roster_assignments WHERE 1=1';
        const params = [];

        if (month) {
            params.push(month);
            query += ` AND DATE_TRUNC('month', assignment_month) = DATE_TRUNC('month', $${params.length}::date)`;
        }

        if (user_id) {
            params.push(user_id);
            query += ` AND user_id = $${params.length}`;
        }

        query += ' ORDER BY assignment_month DESC, user_name ASC';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ error: 'Failed to fetch assignments' });
    }
});

/**
 * GET /api/roster-assignments/month/:year/:month
 * Get all assignments for a specific month
 * Example: /api/roster-assignments/month/2025/12
 */
router.get('/month/:year/:month', authenticateToken, async (req, res) => {
    try {
        const { year, month } = req.params;
        const monthDate = `${year}-${month.padStart(2, '0')}-01`;

        const result = await pool.query(
            `SELECT * FROM v_roster_assignments 
             WHERE DATE_TRUNC('month', assignment_month) = DATE_TRUNC('month', $1::date)
             ORDER BY user_name ASC`,
            [monthDate]
        );

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length,
            month: monthDate,
        });
    } catch (error) {
        console.error('Error fetching month assignments:', error);
        res.status(500).json({ error: 'Failed to fetch month assignments' });
    }
});

/**
 * POST /api/roster-assignments
 * Create new assignment
 * Body: { user_id, pattern_id, assignment_month: "2025-12-01", notes }
 */
router.post(
    '/',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        try {
            const { user_id, pattern_id, assignment_month, notes } = req.body;

            // Validation
            if (!user_id || !pattern_id || !assignment_month) {
                return res.status(400).json({
                    error: 'user_id, pattern_id, and assignment_month are required',
                });
            }

            // Check if user exists and is active
            const userCheck = await pool.query(
                'SELECT id, status FROM users WHERE id = $1',
                [user_id]
            );

            if (userCheck.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (userCheck.rows[0].status !== 'active') {
                return res
                    .status(400)
                    .json({ error: 'Cannot assign pattern to inactive user' });
            }

            // Check if pattern exists and is active
            const patternCheck = await pool.query(
                'SELECT id, is_active FROM patterns WHERE id = $1',
                [pattern_id]
            );

            if (patternCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Pattern not found' });
            }

            if (!patternCheck.rows[0].is_active) {
                return res
                    .status(400)
                    .json({ error: 'Cannot assign inactive pattern' });
            }

            // Insert assignment (will fail if duplicate due to unique constraint)
            const result = await pool.query(
                `INSERT INTO roster_assignments (user_id, pattern_id, assignment_month, assigned_by, notes)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
                [user_id, pattern_id, assignment_month, req.user.userId, notes]
            );

            // Update pattern usage
            await pool.query(
                `UPDATE patterns 
             SET usage_count = usage_count + 1, last_used_at = NOW()
             WHERE id = $1`,
                [pattern_id]
            );

            // Return full assignment details
            const fullResult = await pool.query(
                'SELECT * FROM v_roster_assignments WHERE id = $1',
                [result.rows[0].id]
            );

            res.status(201).json({
                success: true,
                data: fullResult.rows[0],
            });
        } catch (error) {
            if (error.code === '23505') {
                // Unique constraint violation
                return res.status(400).json({
                    error: 'User already has a pattern assigned for this month',
                });
            }
            console.error('Error creating assignment:', error);
            res.status(500).json({ error: 'Failed to create assignment' });
        }
    }
);

/**
 * PUT /api/roster-assignments/:id
 * Update assignment
 */
router.put(
    '/:id',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { pattern_id, notes } = req.body;

            // If changing pattern, validate it exists and is active
            if (pattern_id) {
                const patternCheck = await pool.query(
                    'SELECT id, is_active FROM patterns WHERE id = $1',
                    [pattern_id]
                );

                if (patternCheck.rows.length === 0) {
                    return res.status(404).json({ error: 'Pattern not found' });
                }

                if (!patternCheck.rows[0].is_active) {
                    return res
                        .status(400)
                        .json({ error: 'Cannot assign inactive pattern' });
                }
            }

            const result = await pool.query(
                `UPDATE roster_assignments 
             SET pattern_id = COALESCE($1, pattern_id),
                 notes = COALESCE($2, notes)
             WHERE id = $3
             RETURNING *`,
                [pattern_id, notes, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found' });
            }

            // Update pattern usage if changed
            if (pattern_id) {
                await pool.query(
                    `UPDATE patterns 
                 SET usage_count = usage_count + 1, last_used_at = NOW()
                 WHERE id = $1`,
                    [pattern_id]
                );
            }

            // Return full assignment details
            const fullResult = await pool.query(
                'SELECT * FROM v_roster_assignments WHERE id = $1',
                [result.rows[0].id]
            );

            res.json({
                success: true,
                data: fullResult.rows[0],
            });
        } catch (error) {
            console.error('Error updating assignment:', error);
            res.status(500).json({ error: 'Failed to update assignment' });
        }
    }
);

/**
 * DELETE /api/roster-assignments/:id
 * Delete assignment
 */
router.delete(
    '/:id',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        try {
            const { id } = req.params;

            const result = await pool.query(
                'DELETE FROM roster_assignments WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Assignment not found' });
            }

            res.json({
                success: true,
                message: 'Assignment deleted successfully',
            });
        } catch (error) {
            console.error('Error deleting assignment:', error);
            res.status(500).json({ error: 'Failed to delete assignment' });
        }
    }
);

/**
 * POST /api/roster-assignments/bulk
 * Bulk create assignments for multiple users in a month
 * Body: { assignment_month, assignments: [{ user_id, pattern_id }] }
 */
router.post(
    '/bulk',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        const client = await pool.connect();

        try {
            const { assignment_month, assignments } = req.body;

            if (
                !assignment_month ||
                !Array.isArray(assignments) ||
                assignments.length === 0
            ) {
                return res.status(400).json({
                    error: 'assignment_month and assignments array are required',
                });
            }

            await client.query('BEGIN');

            const created = [];
            const errors = [];

            for (const assignment of assignments) {
                try {
                    const { user_id, pattern_id } = assignment;

                    const result = await client.query(
                        `INSERT INTO roster_assignments (user_id, pattern_id, assignment_month, assigned_by)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, assignment_month) 
                     DO UPDATE SET pattern_id = EXCLUDED.pattern_id
                     RETURNING *`,
                        [user_id, pattern_id, assignment_month, req.user.userId]
                    );

                    created.push(result.rows[0]);

                    // Update pattern usage
                    await client.query(
                        `UPDATE patterns 
                     SET usage_count = usage_count + 1, last_used_at = NOW()
                     WHERE id = $1`,
                        [pattern_id]
                    );
                } catch (error) {
                    errors.push({
                        user_id: assignment.user_id,
                        error: error.message,
                    });
                }
            }

            await client.query('COMMIT');

            res.status(201).json({
                success: true,
                data: created,
                errors: errors.length > 0 ? errors : undefined,
                count: created.length,
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error bulk creating assignments:', error);
            res.status(500).json({
                error: 'Failed to create bulk assignments',
            });
        } finally {
            client.release();
        }
    }
);

module.exports = router;
