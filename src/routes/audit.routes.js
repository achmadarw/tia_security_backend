const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    getFaceLoginStats,
    getRecentFaceLoginAttempts,
    detectSuspiciousActivity,
} = require('../middleware/audit-log.middleware');

// Middleware to check admin role
const adminOnly = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Get face login statistics
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { userId, startDate, endDate, success } = req.query;

        const filters = {};
        if (userId) filters.userId = parseInt(userId);
        if (startDate) filters.startDate = new Date(startDate);
        if (endDate) filters.endDate = new Date(endDate);
        if (success !== undefined) filters.success = success === 'true';

        const stats = await getFaceLoginStats(filters);
        res.json(stats);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Get recent face login attempts
router.get('/recent', authMiddleware, async (req, res) => {
    try {
        const { limit = 50 } = req.query;

        // Non-admin can only see their own
        const userId =
            req.user.role === 'admin' ? req.query.userId : req.user.userId;

        const attempts = await getRecentFaceLoginAttempts(
            parseInt(limit),
            userId ? parseInt(userId) : null
        );

        res.json(attempts);
    } catch (error) {
        console.error('Get recent attempts error:', error);
        res.status(500).json({ error: 'Failed to get recent attempts' });
    }
});

// Detect suspicious activity
router.get('/suspicious', authMiddleware, adminOnly, async (req, res) => {
    try {
        const { threshold = 10, windowMinutes = 60 } = req.query;

        const suspicious = await detectSuspiciousActivity(
            parseInt(threshold),
            parseInt(windowMinutes)
        );

        res.json(suspicious);
    } catch (error) {
        console.error('Detect suspicious error:', error);
        res.status(500).json({
            error: 'Failed to detect suspicious activity',
        });
    }
});

// Get my face login history
router.get('/my-history', authMiddleware, async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const attempts = await getRecentFaceLoginAttempts(
            parseInt(limit),
            req.user.userId
        );

        const stats = await getFaceLoginStats({ userId: req.user.userId });

        res.json({
            attempts,
            stats,
        });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

module.exports = router;
