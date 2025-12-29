const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');

// Get all shifts
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id,
                name,
                code,
                start_time,
                end_time,
                COALESCE(color, '#2196F3') as color,
                description,
                is_active,
                created_at,
                updated_at
            FROM shifts 
            WHERE is_active = true 
            ORDER BY start_time
        `);

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get shifts error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shifts',
        });
    }
});

// Get shift by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM shifts WHERE id = $1', [
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Shift not found',
            });
        }

        res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Get shift error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shift',
        });
    }
});

// Create shift (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, code, start_time, end_time, description, is_active } =
            req.body;

        if (!name || !code || !start_time || !end_time) {
            return res.status(400).json({
                success: false,
                message: 'Name, code, start time, and end time are required',
            });
        }

        // Validate code format (1-3 uppercase chars)
        if (!/^[A-Z0-9]{1,3}$/.test(code)) {
            return res.status(400).json({
                success: false,
                message: 'Code must be 1-3 uppercase alphanumeric characters',
            });
        }

        // Generate random vibrant color for the shift
        const colors = [
            '#2196F3', // Blue
            '#4CAF50', // Green
            '#FF9800', // Orange
            '#9C27B0', // Purple
            '#F44336', // Red
            '#00BCD4', // Cyan
            '#FF5722', // Deep Orange
            '#3F51B5', // Indigo
            '#009688', // Teal
            '#E91E63', // Pink
            '#FFC107', // Amber
            '#673AB7', // Deep Purple
        ];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const result = await pool.query(
            `INSERT INTO shifts (name, code, start_time, end_time, description, color, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                name,
                code.toUpperCase(),
                start_time,
                end_time,
                description || null,
                randomColor,
                is_active !== undefined ? is_active : true,
            ]
        );

        res.status(201).json({
            success: true,
            message: 'Shift created successfully',
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Create shift error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create shift',
        });
    }
});

// Update shift (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, start_time, end_time, description, is_active } =
            req.body;

        // Validate code if provided
        if (code !== undefined && !/^[A-Z0-9]{1,3}$/.test(code)) {
            return res.status(400).json({
                success: false,
                message: 'Code must be 1-3 uppercase alphanumeric characters',
            });
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (code !== undefined) {
            updates.push(`code = $${paramCount++}`);
            values.push(code.toUpperCase());
        }
        if (start_time !== undefined) {
            updates.push(`start_time = $${paramCount++}`);
            values.push(start_time);
        }
        if (end_time !== undefined) {
            updates.push(`end_time = $${paramCount++}`);
            values.push(end_time);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${paramCount++}`);
            values.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update',
            });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const result = await pool.query(
            `UPDATE shifts SET ${updates.join(
                ', '
            )} WHERE id = $${paramCount} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Shift not found',
            });
        }

        res.json({
            success: true,
            message: 'Shift updated successfully',
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Update shift error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update shift',
        });
    }
});

// Delete shift (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if shift has assignments
        const assignmentCheck = await pool.query(
            'SELECT COUNT(*) as count FROM shift_assignments WHERE shift_id = $1',
            [id]
        );

        if (parseInt(assignmentCheck.rows[0].count) > 0) {
            // Soft delete - deactivate
            const result = await pool.query(
                `UPDATE shifts 
                 SET is_active = false, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 RETURNING *`,
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Shift not found',
                });
            }

            return res.json({
                success: true,
                message:
                    'Shift deactivated successfully (has existing assignments)',
                data: result.rows[0],
            });
        } else {
            // Hard delete - no assignments
            const result = await pool.query(
                'DELETE FROM shifts WHERE id = $1 RETURNING *',
                [id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Shift not found',
                });
            }

            res.json({
                success: true,
                message: 'Shift deleted successfully',
                data: result.rows[0],
            });
        }
    } catch (error) {
        console.error('Delete shift error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete shift',
        });
    }
});

module.exports = router;
