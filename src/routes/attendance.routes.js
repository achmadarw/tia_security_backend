const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const upload = require('../middleware/upload.middleware');
const { authMiddleware } = require('../middleware/auth.middleware');
const attendanceService = require('../services/attendance.service');
const reverificationService = require('../services/reverification.service');

// NEW: Check-in/Check-out with Face Validation
router.post('/with-face', authMiddleware, async (req, res) => {
    try {
        const { type, embedding, latitude, longitude } = req.body;
        const userId = req.user.userId;

        // Validate input
        if (!type || !['check_in', 'check_out'].includes(type)) {
            return res.status(400).json({
                error: 'Invalid type',
                message: 'Type must be check_in or check_out',
            });
        }

        if (
            !embedding ||
            !Array.isArray(embedding) ||
            embedding.length !== 192
        ) {
            return res.status(400).json({
                error: 'Invalid embedding',
                message: 'Embedding must be an array of 192 numbers',
            });
        }

        console.log(
            `[Attendance] Face validation ${type} request from user ${userId}`
        );

        // Extract client info for audit logging
        const ipAddress =
            req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const deviceId = req.headers['x-device-id'] || null;
        const userAgent = req.headers['user-agent'] || null;

        // Create attendance with face validation
        const result =
            await attendanceService.createAttendanceWithFaceValidation({
                userId,
                type,
                embedding,
                latitude: latitude || null,
                longitude: longitude || null,
                ipAddress,
                deviceId,
                userAgent,
            });

        if (!result.success) {
            return res.status(401).json(result);
        }

        return res.json(result);
    } catch (error) {
        console.error('[Attendance] Face validation error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

// OLD: Check-in/Check-out (legacy, kept for backward compatibility)
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
    try {
        const { type, location_lat, location_lng, face_confidence } = req.body;
        const userId = req.user.userId;

        if (!type || !['check_in', 'check_out'].includes(type)) {
            return res
                .status(400)
                .json({ error: 'Valid type required (check_in or check_out)' });
        }

        // Get today's date
        const today = new Date().toISOString().split('T')[0];

        // Get user's shift assignment for today
        const assignmentResult = await pool.query(
            `SELECT sa.id as assignment_id, sa.shift_id, s.start_time, s.end_time, s.name as shift_name
             FROM shift_assignments sa
             JOIN shifts s ON sa.shift_id = s.id
             WHERE sa.user_id = $1 
             AND sa.assignment_date = $2
             ORDER BY s.start_time
             LIMIT 1`,
            [userId, today]
        );

        let shiftAssignmentId = null;
        let shiftId = null;
        let isLate = false;
        let isEarlyLeave = false;
        let isOvertime = false;
        let lateMinutes = 0;
        let overtimeMinutes = 0;

        if (assignmentResult.rows.length > 0) {
            const assignment = assignmentResult.rows[0];
            shiftAssignmentId = assignment.assignment_id;
            shiftId = assignment.shift_id;

            const now = new Date();
            const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

            if (type === 'check_in') {
                // Check if late
                const shiftStart = assignment.start_time;
                if (currentTime > shiftStart) {
                    isLate = true;
                    const startDateTime = new Date(`${today}T${shiftStart}`);
                    const nowDateTime = new Date(`${today}T${currentTime}`);
                    lateMinutes = Math.floor(
                        (nowDateTime - startDateTime) / (1000 * 60)
                    );
                }
            } else if (type === 'check_out') {
                const shiftEnd = assignment.end_time;

                // Handle midnight crossing shifts (e.g., 23:00 - 07:00)
                let endDateTime;
                if (shiftEnd < assignment.start_time) {
                    // Shift crosses midnight
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    endDateTime = new Date(
                        `${tomorrow.toISOString().split('T')[0]}T${shiftEnd}`
                    );
                } else {
                    endDateTime = new Date(`${today}T${shiftEnd}`);
                }

                const nowDateTime = new Date(`${today}T${currentTime}`);

                if (nowDateTime < endDateTime) {
                    // Early leave
                    isEarlyLeave = true;
                } else if (nowDateTime > endDateTime) {
                    // Overtime
                    isOvertime = true;
                    overtimeMinutes = Math.floor(
                        (nowDateTime - endDateTime) / (1000 * 60)
                    );
                }
            }
        } else {
            // No assignment found - fall back to user's default shift
            const userResult = await pool.query(
                'SELECT shift_id FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows.length > 0) {
                shiftId = userResult.rows[0].shift_id;
            }
        }

        const photoUrl = req.file
            ? `/uploads/photos/${req.file.filename}`
            : null;

        const result = await pool.query(
            `INSERT INTO attendance (
                user_id, shift_id, shift_assignment_id, type, 
                location_lat, location_lng, face_confidence, photo_url,
                is_late, is_early_leave, is_overtime, 
                late_minutes, overtime_minutes
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [
                userId,
                shiftId,
                shiftAssignmentId,
                type,
                location_lat,
                location_lng,
                face_confidence,
                photoUrl,
                isLate,
                isEarlyLeave,
                isOvertime,
                lateMinutes,
                overtimeMinutes,
            ]
        );

        // Add shift info to response
        const attendanceRecord = result.rows[0];
        if (shiftAssignmentId) {
            const shiftInfo = assignmentResult.rows[0];
            attendanceRecord.shift_name = shiftInfo.shift_name;
            attendanceRecord.shift_start_time = shiftInfo.start_time;
            attendanceRecord.shift_end_time = shiftInfo.end_time;
        }

        res.status(201).json(attendanceRecord);
    } catch (error) {
        console.error('Attendance error:', error);
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

// Get today's attendance for current user (Multiple shift support with assignment info)
router.get('/today', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get current date in Jakarta timezone (UTC+7) using offset
        const jakartaTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
        const today = jakartaTime.toISOString().split('T')[0];

        console.log(
            `[Today Attendance] Fetching for user ${userId}, date: ${today} (Jakarta UTC+7)`
        );

        // Get today's shift assignments
        const assignmentsResult = await pool.query(
            `SELECT sa.id, sa.shift_id, s.name as shift_name, s.start_time, s.end_time,
                    sa.is_replacement, sa.notes
             FROM shift_assignments sa
             JOIN shifts s ON sa.shift_id = s.id
             WHERE sa.user_id = $1 
             AND sa.assignment_date = $2
             ORDER BY s.start_time`,
            [userId, today]
        );

        const todayAssignments = assignmentsResult.rows;

        // Get today's attendance records (timezone-aware for Jakarta UTC+7)
        const result = await pool.query(
            `SELECT a.*, s.name as shift_name, s.start_time, s.end_time
             FROM attendance a
             LEFT JOIN shifts s ON a.shift_id = s.id
             WHERE a.user_id = $1 
             AND DATE(a.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta') = $2 
             ORDER BY a.created_at ASC`,
            [userId, today]
        );

        const records = result.rows;

        console.log(
            `[Today Attendance] User ${userId} - Records:`,
            records.length
        );
        console.log(
            `[Today Attendance] Records:`,
            JSON.stringify(
                records.map((r) => ({
                    id: r.id,
                    type: r.type,
                    created_at: r.created_at,
                })),
                null,
                2
            )
        );

        // Build shift pairs (check-in + check-out)
        const shifts = [];
        let totalMilliseconds = 0;

        for (let i = 0; i < records.length; i++) {
            if (records[i].type === 'check_in') {
                // Find matching check-out
                const checkOut = records.find(
                    (r, idx) => idx > i && r.type === 'check_out'
                );

                const shift = {
                    checkIn: records[i],
                    checkOut: checkOut || null,
                };

                // Add late/early/overtime info
                shift.isLate = records[i].is_late || false;
                shift.lateMinutes = records[i].late_minutes || 0;
                if (checkOut) {
                    shift.isEarlyLeave = checkOut.is_early_leave || false;
                    shift.isOvertime = checkOut.is_overtime || false;
                    shift.overtimeMinutes = checkOut.overtime_minutes || 0;
                }

                // Calculate duration for this shift
                if (checkOut) {
                    const diff =
                        new Date(checkOut.created_at) -
                        new Date(records[i].created_at);
                    totalMilliseconds += diff;
                    shift.hours = Math.floor(diff / (1000 * 60 * 60));
                    shift.minutes = Math.floor(
                        (diff % (1000 * 60 * 60)) / (1000 * 60)
                    );
                }

                shifts.push(shift);
            }
        }

        // Calculate total hours and minutes
        const totalHours = Math.floor(totalMilliseconds / (1000 * 60 * 60));
        const totalMinutes = Math.floor(
            (totalMilliseconds % (1000 * 60 * 60)) / (1000 * 60)
        );

        // Get current status (last record)
        const lastRecord =
            records.length > 0 ? records[records.length - 1] : null;
        const isCheckedIn = lastRecord?.type === 'check_in';

        console.log(
            `[Today Attendance] Last record type: ${lastRecord?.type}, isCheckedIn: ${isCheckedIn}`
        );

        // Current active shift (last check-in without checkout)
        let currentShift = null;
        if (isCheckedIn) {
            currentShift = shifts[shifts.length - 1]; // Last shift is active
        }

        // Previous completed shifts
        const completedShifts = shifts.filter((s) => s.checkOut !== null);

        // First shift for backward compatibility
        const firstCheckIn = records.find((r) => r.type === 'check_in');
        const firstCheckOut = records.find((r) => r.type === 'check_out');

        console.log(
            `[Today Attendance] Response - shifts: ${
                shifts.length
            }, isCheckedIn: ${isCheckedIn}, currentShift: ${
                currentShift ? 'YES' : 'NO'
            }`
        );

        res.json({
            // Backward compatibility
            checkIn: firstCheckIn || null,
            checkOut: firstCheckOut || null,
            totalHours,
            totalMinutes,
            // New multiple shift data
            shifts,
            isCheckedIn,
            shiftCount: shifts.length,
            // Current shift focused data
            currentShift: currentShift,
            completedShifts: completedShifts,
            lastCheckOut:
                completedShifts.length > 0
                    ? completedShifts[completedShifts.length - 1].checkOut
                    : null,
            // Shift assignments data
            assignments: todayAssignments,
            hasAssignments: todayAssignments.length > 0,
        });
    } catch (error) {
        console.error('Get today attendance error:', error);
        res.status(500).json({ error: 'Failed to get today attendance' });
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

// ==================== RE-VERIFICATION ENDPOINTS ====================

// Trigger manual re-verification for an attendance
router.post('/reverify', authMiddleware, async (req, res) => {
    try {
        const {
            userId,
            checkTime,
            checkType,
            locationName,
            latitude,
            longitude,
            notes,
            photo,
            confidenceScore,
            matchedEmbeddings,
            securityLevel,
            reason,
            reasonDetails,
        } = req.body;

        // Validate required fields
        if (!userId || !checkTime || !checkType || !reason) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['userId', 'checkTime', 'checkType', 'reason'],
            });
        }

        console.log(
            `[Reverification] Manual reverify request for user ${userId}`
        );

        // Run anomaly detection
        const anomalies = await reverificationService.detectAnomalies({
            userId,
            checkTime,
            checkType,
            latitude,
            longitude,
            confidenceScore,
        });

        // Trigger re-verification
        const result = await reverificationService.triggerReverification(
            {
                userId,
                checkTime,
                checkType,
                locationName,
                latitude,
                longitude,
                notes,
                photo,
                confidenceScore,
                matchedEmbeddings,
                securityLevel,
                reason,
                reasonDetails,
            },
            anomalies
        );

        res.json({
            success: true,
            message: 'Attendance sent for manual review',
            pendingId: result.pendingAttendance.id,
            anomaliesDetected: result.anomaliesLogged,
            anomalies: anomalies.map((a) => ({
                type: a.type,
                severity: a.severity,
                score: a.score,
                description: a.description,
            })),
        });
    } catch (error) {
        console.error('[Reverification] Error:', error);
        res.status(500).json({
            error: 'Failed to trigger re-verification',
            message: error.message,
        });
    }
});

// Get pending attendance records (admin only)
router.get('/pending', authMiddleware, async (req, res) => {
    try {
        // Only admin can view pending records
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { status, userId, reason, limit } = req.query;

        const filters = {};
        if (status) filters.status = status;
        if (userId) filters.userId = parseInt(userId);
        if (reason) filters.reason = reason;
        if (limit) filters.limit = parseInt(limit);

        const pendingRecords = await reverificationService.getPendingAttendance(
            filters
        );

        res.json({
            total: pendingRecords.length,
            records: pendingRecords.map((record) => ({
                id: record.id,
                userId: record.user_id,
                userName: record.user_name,
                checkTime: record.check_time,
                checkType: record.check_type,
                locationName: record.location_name,
                coordinates:
                    record.latitude && record.longitude
                        ? {
                              latitude: parseFloat(record.latitude),
                              longitude: parseFloat(record.longitude),
                          }
                        : null,
                notes: record.notes,
                photo: record.photo,
                confidenceScore: record.confidence_score
                    ? parseFloat(record.confidence_score)
                    : null,
                matchedEmbeddings: record.matched_embeddings,
                securityLevel: record.security_level,
                reason: record.reason,
                reasonDetails: record.reason_details,
                status: record.status,
                reviewedBy: record.reviewed_by,
                reviewerName: record.reviewer_name,
                reviewedAt: record.reviewed_at,
                reviewNotes: record.review_notes,
                createdAt: record.created_at,
            })),
        });
    } catch (error) {
        console.error('[Reverification] Error getting pending records:', error);
        res.status(500).json({
            error: 'Failed to get pending records',
            message: error.message,
        });
    }
});

// Approve or reject pending attendance (admin only)
router.patch('/pending/:id', authMiddleware, async (req, res) => {
    try {
        // Only admin can process pending records
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { id } = req.params;
        const { action, reviewNotes } = req.body;

        if (!action || !['approve', 'reject'].includes(action)) {
            return res.status(400).json({
                error: 'Invalid action',
                message: 'Action must be "approve" or "reject"',
            });
        }

        console.log(
            `[Reverification] ${action} pending attendance ${id} by admin ${req.user.userId}`
        );

        const result = await reverificationService.processPendingAttendance(
            parseInt(id),
            action,
            req.user.userId,
            reviewNotes
        );

        res.json({
            success: true,
            action: result.action,
            message:
                action === 'approve'
                    ? 'Attendance approved and created'
                    : 'Attendance rejected',
            attendance: result.attendance,
            pending: result.pending,
        });
    } catch (error) {
        console.error(
            '[Reverification] Error processing pending record:',
            error
        );
        res.status(500).json({
            error: 'Failed to process pending record',
            message: error.message,
        });
    }
});

// Get anomaly logs (admin only)
router.get('/anomalies', authMiddleware, async (req, res) => {
    try {
        // Only admin can view anomaly logs
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { status, severity, userId, anomalyType, limit } = req.query;

        const filters = {};
        if (status) filters.status = status;
        if (severity) filters.severity = severity;
        if (userId) filters.userId = parseInt(userId);
        if (anomalyType) filters.anomalyType = anomalyType;
        if (limit) filters.limit = parseInt(limit);

        const anomalies = await reverificationService.getAnomalyLogs(filters);

        res.json({
            total: anomalies.length,
            records: anomalies.map((log) => ({
                id: log.id,
                userId: log.user_id,
                userName: log.user_name,
                attendanceId: log.attendance_id,
                pendingAttendanceId: log.pending_attendance_id,
                anomalyType: log.anomaly_type,
                severity: log.severity,
                description: log.description,
                anomalyScore: log.anomaly_score
                    ? parseFloat(log.anomaly_score)
                    : null,
                contextData: log.context_data,
                status: log.status,
                resolvedBy: log.resolved_by,
                resolverName: log.resolver_name,
                resolvedAt: log.resolved_at,
                resolutionNotes: log.resolution_notes,
                createdAt: log.created_at,
            })),
        });
    } catch (error) {
        console.error('[Reverification] Error getting anomaly logs:', error);
        res.status(500).json({
            error: 'Failed to get anomaly logs',
            message: error.message,
        });
    }
});

module.exports = router;
