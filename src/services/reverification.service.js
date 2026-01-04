const pool = require('../config/database');

/**
 * Re-verification Service
 * Handles anomaly detection and manual re-verification for attendance records
 */

// ==================== CONFIGURATION ====================
const THRESHOLDS = {
    CONFIDENCE: {
        LOW: 65, // Below this triggers low confidence anomaly
        CRITICAL: 50, // Below this requires immediate review
    },
    LOCATION: {
        MAX_DISTANCE_KM: 0.5, // 500 meters from usual location
        CRITICAL_DISTANCE_KM: 2.0, // 2km triggers critical alert
    },
    FREQUENCY: {
        MAX_PER_HOUR: 5, // Max check-ins per hour
        MAX_PER_DAY: 12, // Max check-ins per day
    },
    TIME: {
        NORMAL_START_HOUR: 5, // 05:00
        NORMAL_END_HOUR: 23, // 23:00
    },
    QUALITY: {
        MIN_ACCEPTABLE: 55, // Minimum quality score for face embeddings
    },
};

const SEVERITY_SCORES = {
    low: { min: 0, max: 30 },
    medium: { min: 31, max: 60 },
    high: { min: 61, max: 85 },
    critical: { min: 86, max: 100 },
};

// ==================== ANOMALY DETECTION ====================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Get user's usual check-in location (average of recent attendance)
 */
async function getUserUsualLocation(userId) {
    const result = await pool.query(
        `SELECT 
            AVG(location_lat) as avg_lat,
            AVG(location_lng) as avg_lon,
            COUNT(*) as total_records
        FROM attendance
        WHERE user_id = $1
        AND location_lat IS NOT NULL
        AND location_lng IS NOT NULL
        AND created_at > NOW() - INTERVAL '30 days'`,
        [userId]
    );

    if (result.rows[0].total_records < 5) {
        return null; // Not enough data
    }

    return {
        latitude: parseFloat(result.rows[0].avg_lat),
        longitude: parseFloat(result.rows[0].avg_lon),
        sampleSize: parseInt(result.rows[0].total_records),
    };
}

/**
 * Detect location anomaly
 */
async function detectLocationAnomaly(userId, latitude, longitude) {
    const usualLocation = await getUserUsualLocation(userId);

    if (!usualLocation) {
        return null; // Not enough historical data
    }

    const distance = calculateDistance(
        usualLocation.latitude,
        usualLocation.longitude,
        latitude,
        longitude
    );

    if (distance > THRESHOLDS.LOCATION.CRITICAL_DISTANCE_KM) {
        return {
            type: 'location_anomaly',
            severity: 'critical',
            score: 90,
            description: `Check-in from unusual location (${distance.toFixed(
                2
            )}km from normal)`,
            context: {
                distance_km: distance,
                usual_location: usualLocation,
                current_location: { latitude, longitude },
            },
        };
    } else if (distance > THRESHOLDS.LOCATION.MAX_DISTANCE_KM) {
        const score = Math.min(
            85,
            40 + (distance / THRESHOLDS.LOCATION.CRITICAL_DISTANCE_KM) * 45
        );
        return {
            type: 'location_anomaly',
            severity: score > 70 ? 'high' : 'medium',
            score: Math.round(score),
            description: `Check-in from unusual location (${distance.toFixed(
                2
            )}km from normal)`,
            context: {
                distance_km: distance,
                usual_location: usualLocation,
                current_location: { latitude, longitude },
            },
        };
    }

    return null;
}

/**
 * Detect time anomaly (check-in outside normal hours)
 */
function detectTimeAnomaly(checkTime) {
    const hour = new Date(checkTime).getHours();

    if (
        hour < THRESHOLDS.TIME.NORMAL_START_HOUR ||
        hour >= THRESHOLDS.TIME.NORMAL_END_HOUR
    ) {
        const severity =
            hour < 3 || hour >= 24
                ? 'high'
                : hour < 5 || hour >= 23
                ? 'medium'
                : 'low';
        const score =
            severity === 'high' ? 70 : severity === 'medium' ? 50 : 30;

        return {
            type: 'time_anomaly',
            severity,
            score,
            description: `Check-in at unusual hour (${hour}:00)`,
            context: {
                check_hour: hour,
                normal_range: `${THRESHOLDS.TIME.NORMAL_START_HOUR}:00 - ${THRESHOLDS.TIME.NORMAL_END_HOUR}:00`,
            },
        };
    }

    return null;
}

/**
 * Detect frequency anomaly (too many check-ins)
 */
async function detectFrequencyAnomaly(userId, checkTime) {
    // Check hourly frequency
    const hourlyResult = await pool.query(
        `SELECT COUNT(*) as total
        FROM attendance
        WHERE user_id = $1
        AND created_at > $2::timestamp - INTERVAL '1 hour'
        AND created_at <= $2::timestamp`,
        [userId, checkTime]
    );

    const hourlyCount = parseInt(hourlyResult.rows[0].total);

    if (hourlyCount >= THRESHOLDS.FREQUENCY.MAX_PER_HOUR) {
        return {
            type: 'frequency_anomaly',
            severity:
                hourlyCount >= THRESHOLDS.FREQUENCY.MAX_PER_HOUR * 2
                    ? 'critical'
                    : 'high',
            score: Math.min(95, 60 + hourlyCount * 8),
            description: `Too many check-ins (${hourlyCount} in last hour)`,
            context: {
                count_last_hour: hourlyCount,
                threshold: THRESHOLDS.FREQUENCY.MAX_PER_HOUR,
            },
        };
    }

    // Check daily frequency
    const dailyResult = await pool.query(
        `SELECT COUNT(*) as total
        FROM attendance
        WHERE user_id = $1
        AND DATE(created_at) = DATE($2::timestamp)`,
        [userId, checkTime]
    );

    const dailyCount = parseInt(dailyResult.rows[0].total);

    if (dailyCount >= THRESHOLDS.FREQUENCY.MAX_PER_DAY) {
        return {
            type: 'frequency_anomaly',
            severity: 'medium',
            score: 50,
            description: `Unusual number of check-ins today (${dailyCount})`,
            context: {
                count_today: dailyCount,
                threshold: THRESHOLDS.FREQUENCY.MAX_PER_DAY,
            },
        };
    }

    return null;
}

/**
 * Detect pattern anomaly (unusual behavior based on history)
 */
async function detectPatternAnomaly(userId, checkTime, checkType) {
    const checkDate = new Date(checkTime);
    const dayOfWeek = checkDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Get user's typical check-in pattern for this day of week
    const patternResult = await pool.query(
        `SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as frequency
        FROM attendance
        WHERE user_id = $1
        AND EXTRACT(DOW FROM created_at) = $2
        AND type = $3
        AND created_at > NOW() - INTERVAL '60 days'
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY frequency DESC
        LIMIT 3`,
        [userId, dayOfWeek, checkType]
    );

    if (patternResult.rows.length < 2) {
        return null; // Not enough data
    }

    const currentHour = checkDate.getHours();
    const typicalHours = patternResult.rows.map((r) => parseInt(r.hour));

    // Check if current hour deviates significantly from typical hours
    const minDeviation = Math.min(
        ...typicalHours.map((h) => Math.abs(h - currentHour))
    );

    if (minDeviation > 3) {
        // More than 3 hours deviation
        const score = Math.min(70, 40 + minDeviation * 5);
        return {
            type: 'pattern_anomaly',
            severity: minDeviation > 6 ? 'high' : 'medium',
            score: Math.round(score),
            description: `Check-${checkType} at unusual time for this day`,
            context: {
                current_hour: currentHour,
                typical_hours: typicalHours,
                day_of_week: dayOfWeek,
                deviation_hours: minDeviation,
            },
        };
    }

    return null;
}

/**
 * Detect low confidence anomaly
 */
function detectConfidenceAnomaly(confidenceScore) {
    if (confidenceScore < THRESHOLDS.CONFIDENCE.CRITICAL) {
        return {
            type: 'confidence_low',
            severity: 'critical',
            score: 95,
            description: `Very low face recognition confidence (${confidenceScore}%)`,
            context: {
                confidence: confidenceScore,
                threshold: THRESHOLDS.CONFIDENCE.LOW,
            },
        };
    } else if (confidenceScore < THRESHOLDS.CONFIDENCE.LOW) {
        return {
            type: 'confidence_low',
            severity: 'high',
            score: 75,
            description: `Low face recognition confidence (${confidenceScore}%)`,
            context: {
                confidence: confidenceScore,
                threshold: THRESHOLDS.CONFIDENCE.LOW,
            },
        };
    }

    return null;
}

/**
 * Run all anomaly detection checks
 */
async function detectAnomalies({
    userId,
    checkTime,
    checkType,
    latitude,
    longitude,
    confidenceScore,
}) {
    const anomalies = [];

    // 1. Confidence check
    if (confidenceScore) {
        const confidenceAnomaly = detectConfidenceAnomaly(confidenceScore);
        if (confidenceAnomaly) anomalies.push(confidenceAnomaly);
    }

    // 2. Location check
    if (latitude && longitude) {
        const locationAnomaly = await detectLocationAnomaly(
            userId,
            latitude,
            longitude
        );
        if (locationAnomaly) anomalies.push(locationAnomaly);
    }

    // 3. Time check
    const timeAnomaly = detectTimeAnomaly(checkTime);
    if (timeAnomaly) anomalies.push(timeAnomaly);

    // 4. Frequency check
    const frequencyAnomaly = await detectFrequencyAnomaly(userId, checkTime);
    if (frequencyAnomaly) anomalies.push(frequencyAnomaly);

    // 5. Pattern check
    const patternAnomaly = await detectPatternAnomaly(
        userId,
        checkTime,
        checkType
    );
    if (patternAnomaly) anomalies.push(patternAnomaly);

    return anomalies;
}

// ==================== RE-VERIFICATION ====================

/**
 * Create pending attendance record for manual review
 */
async function createPendingAttendance({
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
}) {
    const result = await pool.query(
        `INSERT INTO pending_attendance (
            user_id, check_time, check_type, location_name,
            latitude, longitude, notes, photo,
            confidence_score, matched_embeddings, security_level,
            reason, reason_details
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
            userId,
            checkTime,
            checkType,
            locationName,
            latitude,
            longitude,
            notes,
            photo,
            confidenceScore,
            JSON.stringify(matchedEmbeddings),
            securityLevel,
            reason,
            reasonDetails,
        ]
    );

    return result.rows[0];
}

/**
 * Log anomaly to database
 */
async function logAnomaly({
    userId,
    attendanceId = null,
    pendingAttendanceId = null,
    anomalyType,
    severity,
    description,
    anomalyScore,
    contextData,
}) {
    const result = await pool.query(
        `INSERT INTO attendance_anomaly_log (
            user_id, attendance_id, pending_attendance_id,
            anomaly_type, severity, description, anomaly_score, context_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
            userId,
            attendanceId,
            pendingAttendanceId,
            anomalyType,
            severity,
            description,
            anomalyScore,
            JSON.stringify(contextData),
        ]
    );

    return result.rows[0];
}

/**
 * Trigger re-verification (create pending + log anomalies)
 */
async function triggerReverification(attendanceData, anomalies) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Create pending attendance
        const pendingResult = await client.query(
            `INSERT INTO pending_attendance (
                user_id, check_time, check_type, location_name,
                latitude, longitude, notes, photo,
                confidence_score, matched_embeddings, security_level,
                reason, reason_details
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                attendanceData.userId,
                attendanceData.checkTime,
                attendanceData.checkType,
                attendanceData.locationName,
                attendanceData.latitude,
                attendanceData.longitude,
                attendanceData.notes,
                attendanceData.photo,
                attendanceData.confidenceScore,
                JSON.stringify(attendanceData.matchedEmbeddings),
                attendanceData.securityLevel,
                attendanceData.reason,
                attendanceData.reasonDetails,
            ]
        );

        const pendingId = pendingResult.rows[0].id;

        // Log all detected anomalies
        for (const anomaly of anomalies) {
            await client.query(
                `INSERT INTO attendance_anomaly_log (
                    user_id, pending_attendance_id,
                    anomaly_type, severity, description, anomaly_score, context_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    attendanceData.userId,
                    pendingId,
                    anomaly.type,
                    anomaly.severity,
                    anomaly.description,
                    anomaly.score,
                    JSON.stringify(anomaly.context),
                ]
            );
        }

        await client.query('COMMIT');

        return {
            pendingAttendance: pendingResult.rows[0],
            anomaliesLogged: anomalies.length,
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Process pending attendance (approve/reject)
 */
async function processPendingAttendance(
    pendingId,
    action,
    reviewerId,
    reviewNotes
) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get pending record
        const pendingResult = await client.query(
            'SELECT * FROM pending_attendance WHERE id = $1',
            [pendingId]
        );

        if (pendingResult.rows.length === 0) {
            throw new Error('Pending attendance not found');
        }

        const pending = pendingResult.rows[0];

        if (pending.status !== 'pending') {
            throw new Error(`Pending attendance already ${pending.status}`);
        }

        if (action === 'approve') {
            // Create actual attendance record
            const attendanceResult = await client.query(
                `INSERT INTO attendance (
                    user_id, type, location_lat, location_lng, 
                    face_confidence, photo_url
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [
                    pending.user_id,
                    pending.check_type,
                    pending.latitude,
                    pending.longitude,
                    pending.confidence_score,
                    pending.photo,
                ]
            );

            // Update pending status
            await client.query(
                `UPDATE pending_attendance
                SET status = 'approved',
                    reviewed_by = $1,
                    reviewed_at = NOW(),
                    review_notes = $2
                WHERE id = $3`,
                [reviewerId, reviewNotes, pendingId]
            );

            // Mark related anomalies as resolved
            await client.query(
                `UPDATE attendance_anomaly_log
                SET status = 'resolved',
                    resolved_by = $1,
                    resolved_at = NOW(),
                    resolution_notes = 'Attendance approved by admin'
                WHERE pending_attendance_id = $2`,
                [reviewerId, pendingId]
            );

            await client.query('COMMIT');

            return {
                action: 'approved',
                attendance: attendanceResult.rows[0],
                pending: pendingResult.rows[0],
            };
        } else if (action === 'reject') {
            // Update pending status
            await client.query(
                `UPDATE pending_attendance
                SET status = 'rejected',
                    reviewed_by = $1,
                    reviewed_at = NOW(),
                    review_notes = $2
                WHERE id = $3`,
                [reviewerId, reviewNotes, pendingId]
            );

            // Mark related anomalies as false positive or keep open
            await client.query(
                `UPDATE attendance_anomaly_log
                SET status = 'false_positive',
                    resolved_by = $1,
                    resolved_at = NOW(),
                    resolution_notes = 'Attendance rejected by admin'
                WHERE pending_attendance_id = $2`,
                [reviewerId, pendingId]
            );

            await client.query('COMMIT');

            return {
                action: 'rejected',
                pending: pendingResult.rows[0],
            };
        } else {
            throw new Error('Invalid action. Must be "approve" or "reject"');
        }
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Get pending attendance records (for admin review)
 */
async function getPendingAttendance(filters = {}) {
    let query = `
        SELECT 
            pa.*,
            u.name as user_name,
            r.name as reviewer_name
        FROM pending_attendance pa
        JOIN users u ON pa.user_id = u.id
        LEFT JOIN users r ON pa.reviewed_by = r.id
        WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (filters.status) {
        query += ` AND pa.status = $${paramCount}`;
        params.push(filters.status);
        paramCount++;
    }

    if (filters.userId) {
        query += ` AND pa.user_id = $${paramCount}`;
        params.push(filters.userId);
        paramCount++;
    }

    if (filters.reason) {
        query += ` AND pa.reason = $${paramCount}`;
        params.push(filters.reason);
        paramCount++;
    }

    query += ' ORDER BY pa.created_at DESC';

    if (filters.limit) {
        query += ` LIMIT $${paramCount}`;
        params.push(filters.limit);
        paramCount++;
    }

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Get anomaly logs
 */
async function getAnomalyLogs(filters = {}) {
    let query = `
        SELECT 
            aal.*,
            u.name as user_name,
            r.name as resolver_name
        FROM attendance_anomaly_log aal
        JOIN users u ON aal.user_id = u.id
        LEFT JOIN users r ON aal.resolved_by = r.id
        WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (filters.status) {
        query += ` AND aal.status = $${paramCount}`;
        params.push(filters.status);
        paramCount++;
    }

    if (filters.severity) {
        query += ` AND aal.severity = $${paramCount}`;
        params.push(filters.severity);
        paramCount++;
    }

    if (filters.userId) {
        query += ` AND aal.user_id = $${paramCount}`;
        params.push(filters.userId);
        paramCount++;
    }

    if (filters.anomalyType) {
        query += ` AND aal.anomaly_type = $${paramCount}`;
        params.push(filters.anomalyType);
        paramCount++;
    }

    query += ' ORDER BY aal.created_at DESC';

    if (filters.limit) {
        query += ` LIMIT $${paramCount}`;
        params.push(filters.limit);
        paramCount++;
    }

    const result = await pool.query(query, params);
    return result.rows;
}

module.exports = {
    THRESHOLDS,
    detectAnomalies,
    createPendingAttendance,
    logAnomaly,
    triggerReverification,
    processPendingAttendance,
    getPendingAttendance,
    getAnomalyLogs,
    calculateDistance,
};
