const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');

// Get shift assignments by date range
router.get('/calendar', authMiddleware, async (req, res) => {
    try {
        const { start_date, end_date, user_id } = req.query;

        let query = `
            SELECT 
                sa.*,
                u.name as user_name,
                u.phone as user_phone,
                s.name as shift_name,
                s.start_time,
                s.end_time,
                ru.name as replaced_user_name
            FROM shift_assignments sa
            JOIN users u ON sa.user_id = u.id
            JOIN shifts s ON sa.shift_id = s.id
            LEFT JOIN users ru ON sa.replaced_user_id = ru.id
            WHERE 1=1
        `;

        const values = [];
        let paramCount = 1;

        if (start_date) {
            query += ` AND sa.assignment_date >= $${paramCount++}`;
            values.push(start_date);
        }

        if (end_date) {
            query += ` AND sa.assignment_date <= $${paramCount++}`;
            values.push(end_date);
        }

        if (user_id) {
            query += ` AND sa.user_id = $${paramCount++}`;
            values.push(user_id);
        }

        query += ` ORDER BY sa.assignment_date, s.start_time`;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get assignments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get assignments',
        });
    }
});

// Get assignments for a specific date
router.get('/date/:date', authMiddleware, async (req, res) => {
    try {
        const { date } = req.params;

        const result = await pool.query(
            `
            SELECT 
                sa.*,
                u.name as user_name,
                u.phone as user_phone,
                s.name as shift_name,
                s.start_time,
                s.end_time,
                ru.name as replaced_user_name
            FROM shift_assignments sa
            JOIN users u ON sa.user_id = u.id
            JOIN shifts s ON sa.shift_id = s.id
            LEFT JOIN users ru ON sa.replaced_user_id = ru.id
            WHERE sa.assignment_date = $1
            ORDER BY s.start_time
        `,
            [date],
        );

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get date assignments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get date assignments',
        });
    }
});

// Get user's assignments
router.get('/user/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;
        const { start_date, end_date } = req.query;

        let query = `
            SELECT 
                sa.*,
                s.name as shift_name,
                s.start_time,
                s.end_time,
                ru.name as replaced_user_name
            FROM shift_assignments sa
            JOIN shifts s ON sa.shift_id = s.id
            LEFT JOIN users ru ON sa.replaced_user_id = ru.id
            WHERE sa.user_id = $1
        `;

        const values = [userId];
        let paramCount = 2;

        if (start_date) {
            query += ` AND sa.assignment_date >= $${paramCount++}`;
            values.push(start_date);
        }

        if (end_date) {
            query += ` AND sa.assignment_date <= $${paramCount++}`;
            values.push(end_date);
        }

        query += ` ORDER BY sa.assignment_date, s.start_time`;

        const result = await pool.query(query, values);

        res.json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error('Get user assignments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user assignments',
        });
    }
});

// Create single assignment (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const {
            user_id,
            shift_id,
            assignment_date,
            is_replacement,
            replaced_user_id,
            notes,
        } = req.body;

        if (!user_id || !shift_id || !assignment_date) {
            return res.status(400).json({
                success: false,
                message: 'user_id, shift_id, and assignment_date are required',
            });
        }

        const result = await pool.query(
            `
            INSERT INTO shift_assignments 
            (user_id, shift_id, assignment_date, is_replacement, replaced_user_id, notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `,
            [
                user_id,
                shift_id,
                assignment_date,
                is_replacement || false,
                replaced_user_id || null,
                notes || null,
                req.user.userId,
            ],
        );

        res.status(201).json({
            success: true,
            message: 'Assignment created successfully',
            data: result.rows[0],
        });
    } catch (error) {
        if (error.code === '23505') {
            // Unique violation
            return res.status(409).json({
                success: false,
                message: 'User already assigned to this shift on this date',
            });
        }
        console.error('Create assignment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create assignment',
        });
    }
});

// Bulk create assignments (admin only)
router.post('/bulk', authMiddleware, adminMiddleware, async (req, res) => {
    const client = await pool.connect();

    try {
        const { assignments } = req.body;

        if (!Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'assignments array is required',
            });
        }

        await client.query('BEGIN');

        const created = [];
        const errors = [];

        for (const assignment of assignments) {
            const {
                user_id,
                shift_id,
                assignment_date,
                is_replacement,
                replaced_user_id,
                notes,
            } = assignment;

            if (!user_id || !shift_id || !assignment_date) {
                errors.push({
                    assignment,
                    error: 'user_id, shift_id, and assignment_date are required',
                });
                continue;
            }

            try {
                const result = await client.query(
                    `
                    INSERT INTO shift_assignments 
                    (user_id, shift_id, assignment_date, is_replacement, replaced_user_id, notes, created_by)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `,
                    [
                        user_id,
                        shift_id,
                        assignment_date,
                        is_replacement || false,
                        replaced_user_id || null,
                        notes || null,
                        req.user.userId,
                    ],
                );

                created.push(result.rows[0]);
            } catch (error) {
                if (error.code === '23505') {
                    // Unique violation
                    errors.push({
                        assignment,
                        error: 'User already assigned to this shift on this date',
                    });
                } else {
                    errors.push({
                        assignment,
                        error: error.message,
                    });
                }
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            message: `Created ${created.length} assignments`,
            data: {
                created,
                errors: errors.length > 0 ? errors : undefined,
            },
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Bulk create assignments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create bulk assignments',
        });
    } finally {
        client.release();
    }
});

// Update assignment (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            user_id,
            shift_id,
            assignment_date,
            is_replacement,
            replaced_user_id,
            notes,
        } = req.body;

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (user_id !== undefined) {
            updates.push(`user_id = $${paramCount++}`);
            values.push(user_id);
        }
        if (shift_id !== undefined) {
            updates.push(`shift_id = $${paramCount++}`);
            values.push(shift_id);
        }
        if (assignment_date !== undefined) {
            updates.push(`assignment_date = $${paramCount++}`);
            values.push(assignment_date);
        }
        if (is_replacement !== undefined) {
            updates.push(`is_replacement = $${paramCount++}`);
            values.push(is_replacement);
        }
        if (replaced_user_id !== undefined) {
            updates.push(`replaced_user_id = $${paramCount++}`);
            values.push(replaced_user_id);
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramCount++}`);
            values.push(notes);
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
            `
            UPDATE shift_assignments 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *
        `,
            values,
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found',
            });
        }

        res.json({
            success: true,
            message: 'Assignment updated successfully',
            data: result.rows[0],
        });
    } catch (error) {
        if (error.code === '23505') {
            // Unique violation
            return res.status(409).json({
                success: false,
                message: 'User already assigned to this shift on this date',
            });
        }
        console.error('Update assignment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update assignment',
        });
    }
});

// Delete assignment (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM shift_assignments WHERE id = $1 RETURNING *',
            [id],
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Assignment not found',
            });
        }

        res.json({
            success: true,
            message: 'Assignment deleted successfully',
            data: result.rows[0],
        });
    } catch (error) {
        console.error('Delete assignment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete assignment',
        });
    }
});

// Update shift assignment for a specific date (quick edit from roster calendar)
router.post('/update', authMiddleware, adminMiddleware, async (req, res) => {
    const client = await pool.connect();

    try {
        const { user_id, assignment_date, shift_id } = req.body;

        // Validation
        if (!user_id || !assignment_date || shift_id === undefined) {
            return res.status(400).json({
                success: false,
                message: 'user_id, assignment_date, and shift_id are required',
            });
        }

        // Check if user exists
        const userCheck = await client.query(
            "SELECT id FROM users WHERE id = $1 AND status = 'active'",
            [user_id],
        );

        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found or inactive',
            });
        }

        await client.query('BEGIN');

        // Handle OFF day (shift_id = 0): DELETE the assignment instead of INSERT/UPDATE
        if (shift_id === 0) {
            console.log(
                `🗑️ Deleting shift assignment: user_id=${user_id}, date=${assignment_date} (OFF day selected)`,
            );
            await client.query(
                'DELETE FROM shift_assignments WHERE user_id = $1 AND assignment_date = $2',
                [user_id, assignment_date],
            );

            await client.query('COMMIT');

            return res.json({
                success: true,
                message: 'OFF day set (assignment deleted)',
                data: null,
            });
        }

        // For actual shifts (shift_id > 0): Validate shift exists
        const shiftCheck = await client.query(
            'SELECT id FROM shifts WHERE id = $1 AND is_active = true',
            [shift_id],
        );

        if (shiftCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                message: `Shift ID ${shift_id} not found or inactive`,
            });
        }

        // Check if assignment exists
        const existingCheck = await client.query(
            'SELECT id FROM shift_assignments WHERE user_id = $1 AND assignment_date = $2',
            [user_id, assignment_date],
        );

        let result;

        if (existingCheck.rows.length > 0) {
            // Update existing assignment
            result = await client.query(
                `UPDATE shift_assignments 
                 SET shift_id = $1, updated_at = NOW()
                 WHERE user_id = $2 AND assignment_date = $3
                 RETURNING *`,
                [shift_id, user_id, assignment_date],
            );
            console.log(
                `✅ Shift assignment updated: user_id=${user_id}, date=${assignment_date}, shift_id=${shift_id}`,
            );
        } else {
            // Insert new assignment
            result = await client.query(
                `INSERT INTO shift_assignments (user_id, assignment_date, shift_id, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())
                 RETURNING *`,
                [user_id, assignment_date, shift_id],
            );
            console.log(
                `✅ Shift assignment created: user_id=${user_id}, date=${assignment_date}, shift_id=${shift_id}`,
            );
        }

        await client.query('COMMIT');

        res.json({
            success: true,
            message: 'Shift assignment updated successfully',
            data: result.rows[0],
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating shift assignment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update shift assignment',
            details: error.message,
        });
    } finally {
        client.release();
    }
});

module.exports = router;
