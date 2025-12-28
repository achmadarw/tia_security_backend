const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/database');
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');

// Get all users (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { role, status } = req.query;

        let query = `
      SELECT u.id, u.name, u.email, u.phone, u.role, u.shift_id, u.status, u.created_at,
             s.name as shift_name
      FROM users u
      LEFT JOIN shifts s ON u.shift_id = s.id
      WHERE 1=1
    `;
        const params = [];

        if (role) {
            params.push(role);
            query += ` AND u.role = $${params.length}`;
        }

        if (status) {
            params.push(status);
            query += ` AND u.status = $${params.length}`;
        }

        query += ' ORDER BY u.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Get user by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Users can only view their own data unless admin
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await pool.query(
            `SELECT u.id, u.name, u.email, u.phone, u.role, u.shift_id, u.status, u.created_at,
              s.name as shift_name, s.start_time, s.end_time
       FROM users u
       LEFT JOIN shifts s ON u.shift_id = s.id
       WHERE u.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Create user (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { name, email, phone, password, role, shift_id } = req.body;

        if (!name || !phone || !password) {
            return res
                .status(400)
                .json({ error: 'Name, phone, and password are required' });
        }

        // Check if phone already exists
        const existing = await pool.query(
            'SELECT id FROM users WHERE phone = $1',
            [phone]
        );
        if (existing.rows.length > 0) {
            return res
                .status(409)
                .json({ error: 'Phone number already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users (name, email, phone, password, role, shift_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, name, email, phone, role, shift_id, status, created_at`,
            [name, email, phone, hashedPassword, role || 'security', shift_id]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update user
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, shift_id, status } = req.body;

        // Users can only update their own data unless admin
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const updates = [];
        const values = [];
        let paramCount = 1;

        if (name) {
            updates.push(`name = $${paramCount++}`);
            values.push(name);
        }
        if (email) {
            updates.push(`email = $${paramCount++}`);
            values.push(email);
        }
        if (phone) {
            updates.push(`phone = $${paramCount++}`);
            values.push(phone);
        }
        if (shift_id !== undefined && req.user.role === 'admin') {
            updates.push(`shift_id = $${paramCount++}`);
            values.push(shift_id);
        }
        if (status && req.user.role === 'admin') {
            updates.push(`status = $${paramCount++}`);
            values.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(id);

        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, name, email, phone, role, shift_id, status, updated_at`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Change password
router.put('/:id/password', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;

        // Users can only change their own password unless admin
        if (req.user.role !== 'admin' && req.user.userId !== parseInt(id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!newPassword) {
            return res.status(400).json({ error: 'New password required' });
        }

        // Verify current password if not admin
        if (req.user.role !== 'admin') {
            if (!currentPassword) {
                return res
                    .status(400)
                    .json({ error: 'Current password required' });
            }

            const userResult = await pool.query(
                'SELECT password FROM users WHERE id = $1',
                [id]
            );
            const validPassword = await bcrypt.compare(
                currentPassword,
                userResult.rows[0].password
            );

            if (!validPassword) {
                return res
                    .status(401)
                    .json({ error: 'Current password is incorrect' });
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await pool.query(
            'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, id]
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM users WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Get user face images count
router.get('/:id/face-images', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT image_url, created_at FROM face_images WHERE user_id = $1 ORDER BY created_at DESC',
            [id]
        );

        res.json({
            data: {
                count: result.rows.length,
                images: result.rows.map((row) => ({
                    url: row.image_url,
                    createdAt: row.created_at,
                })),
            },
        });
    } catch (error) {
        console.error('Get face images count error:', error);
        res.status(500).json({ error: 'Failed to get face images count' });
    }
});

module.exports = router;
