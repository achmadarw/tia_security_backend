const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const upload = require('../middleware/upload.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');

// Check-in/Check-out
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
    try {
        const { type, location_lat, location_lng, face_confidence } = req.body;
        const userId = req.user.userId;

        if (!type || !['check_in', 'check_out'].includes(type)) {
            return res
                .status(400)
                .json({ error: 'Valid type required (check_in or check_out)' });
        }

        // Get user's shift
        const userResult = await pool.query(
            'SELECT shift_id FROM users WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const shiftId = userResult.rows[0].shift_id;

        const photoUrl = req.file
            ? `/uploads/photos/${req.file.filename}`
            : null;

        const result = await pool.query(
            `INSERT INTO attendance (user_id, shift_id, type, location_lat, location_lng, face_confidence, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [
                userId,
                shiftId,
                type,
                location_lat,
                location_lng,
                face_confidence,
                photoUrl,
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Attendance error:', error);
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

// Get attendance records
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { userId, startDate, endDate, type } = req.query;

        let query = `
      SELECT a.*, u.name as user_name, s.name as shift_name
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN shifts s ON a.shift_id = s.id
      WHERE 1=1
    `;
        const params = [];

        // Non-admin can only see their own attendance
        if (req.user.role !== 'admin') {
            params.push(req.user.userId);
            query += ` AND a.user_id = $${params.length}`;
        } else if (userId) {
            params.push(userId);
            query += ` AND a.user_id = $${params.length}`;
        }

        if (startDate) {
            params.push(startDate);
            query += ` AND DATE(a.created_at) >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            query += ` AND DATE(a.created_at) <= $${params.length}`;
        }

        if (type) {
            params.push(type);
            query += ` AND a.type = $${params.length}`;
        }

        query += ' ORDER BY a.created_at DESC LIMIT 100';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({ error: 'Failed to get attendance records' });
    }
});

// Get today's attendance for user
router.get('/today', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        const result = await pool.query(
            `SELECT a.*, s.name as shift_name
       FROM attendance a
       LEFT JOIN shifts s ON a.shift_id = s.id
       WHERE a.user_id = $1 AND DATE(a.created_at) = CURRENT_DATE
       ORDER BY a.created_at DESC`,
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get today attendance error:', error);
        res.status(500).json({ error: "Failed to get today's attendance" });
    }
});

// Get attendance statistics
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.query;
        const targetUserId =
            req.user.role === 'admin' && userId ? userId : req.user.userId;

        const params = [targetUserId];
        let dateFilter = '';

        if (startDate) {
            params.push(startDate);
            dateFilter += ` AND DATE(created_at) >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            dateFilter += ` AND DATE(created_at) <= $${params.length}`;
        }

        const result = await pool.query(
            `SELECT 
         COUNT(*) FILTER (WHERE type = 'check_in') as total_checkins,
         COUNT(*) FILTER (WHERE type = 'check_out') as total_checkouts,
         COUNT(DISTINCT DATE(created_at)) as days_attended,
         AVG(face_confidence) as avg_confidence
       FROM attendance
       WHERE user_id = $1 ${dateFilter}`,
            params
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get attendance stats error:', error);
        res.status(500).json({ error: 'Failed to get attendance statistics' });
    }
});

module.exports = router;
