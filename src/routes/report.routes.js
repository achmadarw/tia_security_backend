const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const upload = require('../middleware/upload.middleware');
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');

// Create report
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
    try {
        const {
            block_id,
            type,
            title,
            description,
            location_lat,
            location_lng,
        } = req.body;
        const userId = req.user.userId;

        if (!block_id || !type) {
            return res
                .status(400)
                .json({ error: 'Block ID and type are required' });
        }

        if (!['normal_patrol', 'incident'].includes(type)) {
            return res.status(400).json({ error: 'Invalid report type' });
        }

        // Get user's shift
        const userResult = await pool.query(
            'SELECT shift_id FROM users WHERE id = $1',
            [userId]
        );
        const shiftId = userResult.rows[0]?.shift_id;

        const photoUrl = req.file
            ? `/uploads/reports/${req.file.filename}`
            : null;

        if (!photoUrl) {
            return res.status(400).json({ error: 'Photo is required' });
        }

        const result = await pool.query(
            `INSERT INTO reports (user_id, block_id, shift_id, type, title, description, photo_url, location_lat, location_lng, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
       RETURNING *`,
            [
                userId,
                block_id,
                shiftId,
                type,
                title,
                description,
                photoUrl,
                location_lat,
                location_lng,
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create report error:', error);
        res.status(500).json({ error: 'Failed to create report' });
    }
});

// Get reports
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { userId, blockId, type, status, startDate, endDate } = req.query;

        let query = `
      SELECT r.*, 
             u.name as user_name, 
             b.name as block_name,
             s.name as shift_name,
             reviewer.name as reviewed_by_name
      FROM reports r
      JOIN users u ON r.user_id = u.id
      JOIN blocks b ON r.block_id = b.id
      LEFT JOIN shifts s ON r.shift_id = s.id
      LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
      WHERE 1=1
    `;
        const params = [];

        // Non-admin can only see their own reports
        if (req.user.role !== 'admin') {
            params.push(req.user.userId);
            query += ` AND r.user_id = $${params.length}`;
        } else if (userId) {
            params.push(userId);
            query += ` AND r.user_id = $${params.length}`;
        }

        if (blockId) {
            params.push(blockId);
            query += ` AND r.block_id = $${params.length}`;
        }

        if (type) {
            params.push(type);
            query += ` AND r.type = $${params.length}`;
        }

        if (status) {
            params.push(status);
            query += ` AND r.status = $${params.length}`;
        }

        if (startDate) {
            params.push(startDate);
            query += ` AND DATE(r.created_at) >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            query += ` AND DATE(r.created_at) <= $${params.length}`;
        }

        query += ' ORDER BY r.created_at DESC LIMIT 200';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Get report by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT r.*, 
              u.name as user_name, u.phone as user_phone,
              b.name as block_name,
              s.name as shift_name,
              reviewer.name as reviewed_by_name
       FROM reports r
       JOIN users u ON r.user_id = u.id
       JOIN blocks b ON r.block_id = b.id
       LEFT JOIN shifts s ON r.shift_id = s.id
       LEFT JOIN users reviewer ON r.reviewed_by = reviewer.id
       WHERE r.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        // Non-admin can only view their own reports
        if (
            req.user.role !== 'admin' &&
            result.rows[0].user_id !== req.user.userId
        ) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get report error:', error);
        res.status(500).json({ error: 'Failed to get report' });
    }
});

// Review report (admin only)
router.put('/:id/review', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || !['pending', 'reviewed'].includes(status)) {
            return res.status(400).json({ error: 'Valid status required' });
        }

        const result = await pool.query(
            `UPDATE reports 
       SET status = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3
       RETURNING *`,
            [status, req.user.userId, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Review report error:', error);
        res.status(500).json({ error: 'Failed to review report' });
    }
});

// Get report statistics
router.get('/stats/summary', authMiddleware, async (req, res) => {
    try {
        const { userId, startDate, endDate } = req.query;

        let userFilter = '';
        const params = [];

        if (req.user.role !== 'admin') {
            params.push(req.user.userId);
            userFilter = `WHERE user_id = $${params.length}`;
        } else if (userId) {
            params.push(userId);
            userFilter = `WHERE user_id = $${params.length}`;
        }

        let dateFilter = '';
        if (startDate) {
            params.push(startDate);
            dateFilter += `${
                userFilter ? 'AND' : 'WHERE'
            } DATE(created_at) >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            dateFilter += `${
                userFilter || dateFilter ? 'AND' : 'WHERE'
            } DATE(created_at) <= $${params.length}`;
        }

        const result = await pool.query(
            `SELECT 
         COUNT(*) as total_reports,
         COUNT(*) FILTER (WHERE type = 'normal_patrol') as normal_patrols,
         COUNT(*) FILTER (WHERE type = 'incident') as incidents,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'reviewed') as reviewed
       FROM reports
       ${userFilter} ${dateFilter}`,
            params
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get report stats error:', error);
        res.status(500).json({ error: 'Failed to get report statistics' });
    }
});

// Delete report (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM reports WHERE id = $1 RETURNING id',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        console.error('Delete report error:', error);
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

module.exports = router;
