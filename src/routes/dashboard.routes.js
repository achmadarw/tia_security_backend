const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');

// Get dashboard statistics (admin only)
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // Total users
        const usersResult = await pool.query(
            `SELECT 
         COUNT(*) as total_users,
         COUNT(*) FILTER (WHERE role = 'security') as total_security,
         COUNT(*) FILTER (WHERE status = 'active') as active_users
       FROM users`
        );

        // Today's attendance
        const attendanceResult = await pool.query(
            `SELECT 
         COUNT(*) FILTER (WHERE type = 'check_in') as checkins_today,
         COUNT(*) FILTER (WHERE type = 'check_out') as checkouts_today,
         COUNT(DISTINCT user_id) as users_active_today
       FROM attendance
       WHERE DATE(created_at) = CURRENT_DATE`
        );

        // Reports summary
        const reportsResult = await pool.query(
            `SELECT 
         COUNT(*) as total_reports,
         COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as reports_today,
         COUNT(*) FILTER (WHERE status = 'pending') as pending_reports,
         COUNT(*) FILTER (WHERE type = 'incident') as total_incidents
       FROM reports`
        );

        // Blocks
        const blocksResult = await pool.query(
            `SELECT COUNT(*) as total_blocks FROM blocks WHERE status = 'active'`
        );

        res.json({
            users: usersResult.rows[0],
            attendance: attendanceResult.rows[0],
            reports: reportsResult.rows[0],
            blocks: blocksResult.rows[0],
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to get dashboard statistics' });
    }
});

// Get recent activities (admin only)
router.get('/activities', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        // Recent attendance
        const attendance = await pool.query(
            `SELECT a.*, u.name as user_name, s.name as shift_name
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN shifts s ON a.shift_id = s.id
       ORDER BY a.created_at DESC
       LIMIT $1`,
            [limit]
        );

        // Recent reports
        const reports = await pool.query(
            `SELECT r.*, u.name as user_name, b.name as block_name
       FROM reports r
       JOIN users u ON r.user_id = u.id
       JOIN blocks b ON r.block_id = b.id
       ORDER BY r.created_at DESC
       LIMIT $1`,
            [limit]
        );

        res.json({
            recentAttendance: attendance.rows,
            recentReports: reports.rows,
        });
    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({ error: 'Failed to get recent activities' });
    }
});

// Get attendance trends (admin only)
router.get(
    '/trends/attendance',
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            const days = parseInt(req.query.days) || 7;

            const result = await pool.query(
                `SELECT 
         DATE(created_at) as date,
         COUNT(*) FILTER (WHERE type = 'check_in') as checkins,
         COUNT(*) FILTER (WHERE type = 'check_out') as checkouts,
         COUNT(DISTINCT user_id) as active_users
       FROM attendance
       WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
            );

            res.json(result.rows);
        } catch (error) {
            console.error('Get attendance trends error:', error);
            res.status(500).json({ error: 'Failed to get attendance trends' });
        }
    }
);

// Get reports by block (admin only)
router.get(
    '/reports/by-block',
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT 
         b.id, b.name,
         COUNT(r.id) as total_reports,
         COUNT(r.id) FILTER (WHERE r.type = 'incident') as incidents,
         COUNT(r.id) FILTER (WHERE r.type = 'normal_patrol') as normal_patrols
       FROM blocks b
       LEFT JOIN reports r ON b.id = r.block_id
       GROUP BY b.id, b.name
       ORDER BY total_reports DESC`
            );

            res.json(result.rows);
        } catch (error) {
            console.error('Get reports by block error:', error);
            res.status(500).json({ error: 'Failed to get reports by block' });
        }
    }
);

module.exports = router;
