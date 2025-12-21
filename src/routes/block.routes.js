const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');

// Get all blocks
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { status } = req.query;

        let query = 'SELECT * FROM blocks WHERE 1=1';
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND status = $${params.length}`;
        }

        query += ' ORDER BY name';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get blocks error:', error);
        res.status(500).json({ error: 'Failed to get blocks' });
    }
});

// Get block by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query('SELECT * FROM blocks WHERE id = $1', [
            id,
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Block not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get block error:', error);
        res.status(500).json({ error: 'Failed to get block' });
    }
});

// Create block (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, description, location_lat, location_lng } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Block name is required' });
        }

        const result = await pool.query(
            `INSERT INTO blocks (name, description, location_lat, location_lng, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
            [name, description, location_lat, location_lng]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create block error:', error);
        res.status(500).json({ error: 'Failed to create block' });
    }
});

// Update block (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, location_lat, location_lng, status } =
            req.body;

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramCount++}`);
            values.push(description);
        }
        if (location_lat !== undefined) {
            updates.push(`location_lat = $${paramCount++}`);
            values.push(location_lat);
        }
        if (location_lng !== undefined) {
            updates.push(`location_lng = $${paramCount++}`);
            values.push(location_lng);
        }
        if (status) {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(id);

        const result = await pool.query(
            `UPDATE blocks SET ${updates.join(
                ', '
            )} WHERE id = $${paramCount} RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Block not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update block error:', error);
        res.status(500).json({ error: 'Failed to update block' });
    }
});

// Delete block (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM blocks WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Block not found' });
        }

        res.json({ message: 'Block deleted successfully' });
    } catch (error) {
        console.error('Delete block error:', error);
        res.status(500).json({ error: 'Failed to delete block' });
    }
});

module.exports = router;
