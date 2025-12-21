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
        const result = await pool.query(
            'SELECT * FROM shifts ORDER BY start_time'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get shifts error:', error);
        res.status(500).json({ error: 'Failed to get shifts' });
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
            return res.status(404).json({ error: 'Shift not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get shift error:', error);
        res.status(500).json({ error: 'Failed to get shift' });
    }
});

// Create shift (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, start_time, end_time } = req.body;

        if (!name || !start_time || !end_time) {
            return res
                .status(400)
                .json({ error: 'Name, start time, and end time are required' });
        }

        const result = await pool.query(
            `INSERT INTO shifts (name, start_time, end_time) VALUES ($1, $2, $3) RETURNING *`,
            [name, start_time, end_time]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create shift error:', error);
        res.status(500).json({ error: 'Failed to create shift' });
    }
});

// Update shift (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, start_time, end_time } = req.body;

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (start_time) {
            updates.push(`start_time = $${paramCount++}`);
            values.push(start_time);
        }
        if (end_time) {
            updates.push(`end_time = $${paramCount++}`);
            values.push(end_time);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const result = await pool.query(
            `UPDATE shifts SET ${updates.join(
                ', '
            )} WHERE id = $${paramCount} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update shift error:', error);
        res.status(500).json({ error: 'Failed to update shift' });
    }
});

// Delete shift (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM shifts WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        res.json({ message: 'Shift deleted successfully' });
    } catch (error) {
        console.error('Delete shift error:', error);
        res.status(500).json({ error: 'Failed to delete shift' });
    }
});

module.exports = router;
