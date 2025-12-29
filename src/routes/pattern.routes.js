const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authenticateToken,
    requireRole,
} = require('../middleware/auth.middleware');

// ============================================================
// PATTERN LIBRARY ROUTES (Single 7-day patterns)
// ============================================================

/**
 * GET /api/patterns
 * Get all patterns from library
 * Query params: ?active=true&search=weekend
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { active, search } = req.query;

        let query = 'SELECT * FROM patterns WHERE 1=1';
        const params = [];

        if (active !== undefined) {
            params.push(active === 'true');
            query += ` AND is_active = $${params.length}`;
        }

        if (search) {
            params.push(`%${search}%`);
            query += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
        }

        query += ' ORDER BY usage_count DESC, name ASC';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error('Error fetching patterns:', error);
        res.status(500).json({ error: 'Failed to fetch patterns' });
    }
});

/**
 * GET /api/patterns/:id
 * Get single pattern by ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT * FROM patterns WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Pattern not found' });
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Error fetching pattern:', error);
        res.status(500).json({ error: 'Failed to fetch pattern' });
    }
});

/**
 * POST /api/patterns
 * Create new pattern
 * Body: { name, description, pattern_data: [7 integers] }
 */
router.post(
    '/',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        try {
            const { name, description, pattern_data } = req.body;

            // Validation
            if (!name || !pattern_data) {
                return res
                    .status(400)
                    .json({ error: 'Name and pattern_data are required' });
            }

            if (!Array.isArray(pattern_data) || pattern_data.length !== 7) {
                return res.status(400).json({
                    error: 'pattern_data must be array of 7 integers',
                });
            }

            if (
                !pattern_data.every((val) => Number.isInteger(val) && val >= 0)
            ) {
                return res.status(400).json({
                    error: 'pattern_data values must be integers >= 0 (0=OFF, >0=shift ID)',
                });
            }

            // Validate shift IDs exist (except 0 which is OFF)
            const shiftIds = pattern_data.filter((id) => id > 0);
            if (shiftIds.length > 0) {
                const shiftsResult = await pool.query(
                    'SELECT id FROM shifts WHERE id = ANY($1::int[])',
                    [shiftIds]
                );
                const validIds = shiftsResult.rows.map((row) => row.id);
                const invalidIds = shiftIds.filter(
                    (id) => !validIds.includes(id)
                );
                if (invalidIds.length > 0) {
                    return res.status(400).json({
                        error: `Invalid shift IDs: ${invalidIds.join(', ')}`,
                    });
                }
            }

            const result = await pool.query(
                `INSERT INTO patterns (name, description, pattern_data, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
                [name, description, pattern_data, req.user.userId]
            );

            res.status(201).json({
                success: true,
                data: result.rows[0],
            });
        } catch (error) {
            console.error('Error creating pattern:', error);
            res.status(500).json({ error: 'Failed to create pattern' });
        }
    }
);

/**
 * PUT /api/patterns/:id
 * Update pattern
 */
router.put(
    '/:id',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, pattern_data, is_active } = req.body;

            // Validation for pattern_data if provided
            if (pattern_data) {
                if (!Array.isArray(pattern_data) || pattern_data.length !== 7) {
                    return res.status(400).json({
                        error: 'pattern_data must be array of 7 integers',
                    });
                }

                if (
                    !pattern_data.every(
                        (val) => Number.isInteger(val) && val >= 0
                    )
                ) {
                    return res
                        .status(400)
                        .json({
                            error: 'pattern_data values must be integers >= 0 (0=OFF, >0=shift ID)',
                        });
                }

                // Validate shift IDs exist (except 0 which is OFF)
                const shiftIds = pattern_data.filter((id) => id > 0);
                if (shiftIds.length > 0) {
                    const shiftsResult = await pool.query(
                        'SELECT id FROM shifts WHERE id = ANY($1::int[])',
                        [shiftIds]
                    );
                    const validIds = shiftsResult.rows.map((row) => row.id);
                    const invalidIds = shiftIds.filter(
                        (id) => !validIds.includes(id)
                    );
                    if (invalidIds.length > 0) {
                        return res.status(400).json({
                            error: `Invalid shift IDs: ${invalidIds.join(
                                ', '
                            )}`,
                        });
                    }
                }
            }

            const result = await pool.query(
                `UPDATE patterns 
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 pattern_data = COALESCE($3, pattern_data),
                 is_active = COALESCE($4, is_active),
                 updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
                [name, description, pattern_data, is_active, id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Pattern not found' });
            }

            res.json({
                success: true,
                data: result.rows[0],
            });
        } catch (error) {
            console.error('Error updating pattern:', error);
            res.status(500).json({ error: 'Failed to update pattern' });
        }
    }
);

/**
 * DELETE /api/patterns/:id
 * Delete pattern (only if not in use)
 */
router.delete(
    '/:id',
    authenticateToken,
    requireRole(['admin']),
    async (req, res) => {
        try {
            const { id } = req.params;

            // Check if pattern is in use
            const usageCheck = await pool.query(
                'SELECT COUNT(*) as count FROM roster_assignments WHERE pattern_id = $1',
                [id]
            );

            if (parseInt(usageCheck.rows[0].count) > 0) {
                return res.status(400).json({
                    error: 'Cannot delete pattern that is currently assigned to personil',
                });
            }

            const result = await pool.query(
                'DELETE FROM patterns WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Pattern not found' });
            }

            res.json({
                success: true,
                message: 'Pattern deleted successfully',
            });
        } catch (error) {
            console.error('Error deleting pattern:', error);
            res.status(500).json({ error: 'Failed to delete pattern' });
        }
    }
);

module.exports = router;
