// Attendance Service with Face Validation
// Purpose: Business logic for attendance operations with face recognition validation

const pool = require('../config/database');

// Security level thresholds
const SECURITY_LEVELS = {
    LOW: {
        threshold: 0.6,
        minMargin: 0.03,
        minConfidence: 60.0,
        description: 'Normal working hours, within office',
    },
    MEDIUM: {
        threshold: 0.65,
        minMargin: 0.05,
        minConfidence: 65.0,
        description: 'Outside normal hours or location',
    },
    HIGH: {
        threshold: 0.7,
        minMargin: 0.08,
        minConfidence: 70.0,
        description: 'High-risk scenario or critical operation',
    },
};

/**
 * Determine security level based on context
 * @param {Object} params - {time, location, userId}
 * @returns {String} 'LOW', 'MEDIUM', or 'HIGH'
 */
function determineSecurityLevel({ time, location, userId }) {
    const hour = time.getHours();
    const dayOfWeek = time.getDay(); // 0 = Sunday, 6 = Saturday

    // HIGH security: Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log(`[Security] HIGH level: Weekend (day ${dayOfWeek})`);
        return 'HIGH';
    }

    // HIGH security: Outside normal hours (before 6 AM or after 10 PM)
    if (hour < 6 || hour > 22) {
        console.log(`[Security] HIGH level: Outside normal hours (${hour}:00)`);
        return 'HIGH';
    }

    // MEDIUM security: Early morning (6-8 AM) or late evening (8-10 PM)
    if (hour < 8 || hour >= 20) {
        console.log(`[Security] MEDIUM level: Early/late hours (${hour}:00)`);
        return 'MEDIUM';
    }

    // TODO: Add location-based security (requires office location config)
    // if (location && isOutsideOffice(location)) {
    //     return 'MEDIUM';
    // }

    // LOW security: Normal working hours (8 AM - 8 PM), weekday
    console.log(`[Security] LOW level: Normal working hours (${hour}:00)`);
    return 'LOW';
}

/**
 * Calculate Euclidean distance between two embeddings
 * @param {Array} embedding1 - First embedding vector
 * @param {Array} embedding2 - Second embedding vector
 * @returns {Number} Distance value
 */
function calculateEuclideanDistance(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
        throw new Error('Embedding dimensions must match');
    }

    let sum = 0;
    for (let i = 0; i < embedding1.length; i++) {
        const diff = embedding1[i] - embedding2[i];
        sum += diff * diff;
    }

    return Math.sqrt(sum);
}

/**
 * Match face embedding against stored embeddings
 * @param {Array} embedding - Face embedding to match
 * @param {Number} userId - User ID to match against
 * @returns {Object} Match result with confidence and margin
 */
async function matchFaceEmbedding(embedding, userId) {
    console.log(`[FaceMatch] Matching embedding for user ${userId}`);

    // Get all stored embeddings for this user
    const result = await pool.query(
        'SELECT embedding FROM user_embeddings WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );

    if (result.rows.length === 0) {
        console.log('[FaceMatch] No embeddings found for user');
        return {
            success: false,
            confidence: 0,
            distance: 999,
            margin: 0,
            error: 'No registered face embeddings',
        };
    }

    console.log(
        `[FaceMatch] Comparing against ${result.rows.length} stored embeddings`
    );

    // Find best match
    let bestDistance = Infinity;
    let bestEmbedding = null;

    for (const row of result.rows) {
        const storedEmb = row.embedding;
        const distance = calculateEuclideanDistance(embedding, storedEmb);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestEmbedding = storedEmb;
        }
    }

    // Calculate confidence (inverse of distance, normalized to 0-100%)
    // Distance 0.0 = 100% confidence, Distance 1.0 = 0% confidence
    const confidence = Math.max(0, (1 - bestDistance) * 100);

    console.log(
        `[FaceMatch] Best distance: ${bestDistance.toFixed(
            4
        )}, Confidence: ${confidence.toFixed(2)}%`
    );

    return {
        success: true,
        confidence: parseFloat(confidence.toFixed(2)),
        distance: parseFloat(bestDistance.toFixed(4)),
        margin: 0, // Will be calculated in validation function if needed
    };
}

/**
 * Log attendance verification attempt
 * @param {Object} params - Attempt details
 */
async function logVerificationAttempt(params) {
    const {
        userId,
        attendanceId = null,
        success,
        confidence,
        margin = null,
        reason = null,
        requiresReverification = false,
        ipAddress = null,
        deviceId = null,
        userAgent = null,
    } = params;

    try {
        await pool.query(
            `INSERT INTO attendance_verification_log 
            (user_id, attendance_id, success, confidence, margin, reason, 
             requires_reverification, ip_address, device_id, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                userId,
                attendanceId,
                success,
                confidence,
                margin,
                reason,
                requiresReverification,
                ipAddress,
                deviceId,
                userAgent,
            ]
        );
        console.log(
            `[AuditLog] Verification attempt logged: user=${userId}, success=${success}`
        );
    } catch (error) {
        console.error('[AuditLog] Failed to log attempt:', error.message);
    }
}

/**
 * Create attendance record with face validation
 * @param {Object} params - Attendance details
 * @returns {Object} Created attendance record
 */
async function createAttendanceWithFaceValidation(params) {
    const {
        userId,
        type,
        embedding,
        latitude,
        longitude,
        ipAddress,
        deviceId,
        userAgent,
    } = params;

    console.log(
        `[Attendance] Creating ${type} with face validation for user ${userId}`
    );

    // 1. Determine security level
    const securityLevel = determineSecurityLevel({
        time: new Date(),
        location: { latitude, longitude },
        userId,
    });

    const securityConfig = SECURITY_LEVELS[securityLevel];
    console.log(
        `[Attendance] Security level: ${securityLevel} (threshold: ${securityConfig.threshold}, min confidence: ${securityConfig.minConfidence}%)`
    );

    // 2. Match face embedding
    const matchResult = await matchFaceEmbedding(embedding, userId);

    if (!matchResult.success) {
        await logVerificationAttempt({
            userId,
            success: false,
            confidence: 0,
            reason: matchResult.error,
            ipAddress,
            deviceId,
            userAgent,
        });

        return {
            success: false,
            error: matchResult.error,
            message:
                'No registered face found. Please register your face first.',
        };
    }

    // 3. Validate confidence threshold
    if (matchResult.confidence < securityConfig.minConfidence) {
        await logVerificationAttempt({
            userId,
            success: false,
            confidence: matchResult.confidence,
            reason: 'CONFIDENCE_TOO_LOW',
            ipAddress,
            deviceId,
            userAgent,
        });

        return {
            success: false,
            error: 'CONFIDENCE_TOO_LOW',
            message: `Face recognition confidence (${matchResult.confidence}%) is below required ${securityConfig.minConfidence}%. Please try again with better lighting.`,
            confidence: matchResult.confidence,
            required: securityConfig.minConfidence,
            securityLevel,
        };
    }

    // 4. Validate distance threshold
    if (matchResult.distance > securityConfig.threshold) {
        await logVerificationAttempt({
            userId,
            success: false,
            confidence: matchResult.confidence,
            reason: 'DISTANCE_TOO_HIGH',
            ipAddress,
            deviceId,
            userAgent,
        });

        return {
            success: false,
            error: 'FACE_NOT_MATCHED',
            message: `Face does not match registered face. Distance: ${matchResult.distance.toFixed(
                4
            )} (max: ${securityConfig.threshold})`,
            confidence: matchResult.confidence,
            distance: matchResult.distance,
            threshold: securityConfig.threshold,
        };
    }

    // 5. Create attendance record
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if already checked in today (prevent duplicate check-ins)
        if (type === 'check_in') {
            const existingCheckIn = await client.query(
                `SELECT id FROM attendance 
                 WHERE user_id = $1 
                 AND DATE(check_in) = CURRENT_DATE 
                 AND check_out IS NULL`,
                [userId]
            );

            if (existingCheckIn.rows.length > 0) {
                await client.query('ROLLBACK');
                return {
                    success: false,
                    error: 'ALREADY_CHECKED_IN',
                    message: 'You are already checked in today.',
                };
            }
        }

        // Insert attendance
        const insertQuery =
            type === 'check_in'
                ? `INSERT INTO attendance 
                   (user_id, check_in, location_lat, location_lng, 
                    face_confidence, face_verified, security_level, verification_attempts)
                   VALUES ($1, NOW(), $2, $3, $4, true, $5, 1)
                   RETURNING *`
                : `UPDATE attendance 
                   SET check_out = NOW(),
                       location_out_lat = $2,
                       location_out_lng = $3,
                       face_confidence = $4,
                       face_verified = true,
                       security_level = $5
                   WHERE user_id = $1 
                   AND DATE(check_in) = CURRENT_DATE 
                   AND check_out IS NULL
                   RETURNING *`;

        const attendanceResult = await client.query(insertQuery, [
            userId,
            latitude,
            longitude,
            matchResult.confidence,
            securityLevel,
        ]);

        if (attendanceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return {
                success: false,
                error: 'NO_CHECK_IN_FOUND',
                message:
                    'No active check-in found for check-out. Please check in first.',
            };
        }

        const attendance = attendanceResult.rows[0];

        // Log successful attempt
        await client.query(
            `INSERT INTO attendance_verification_log 
            (user_id, attendance_id, success, confidence, reason, 
             ip_address, device_id, user_agent)
            VALUES ($1, $2, true, $3, 'SUCCESS', $4, $5, $6)`,
            [
                userId,
                attendance.id,
                matchResult.confidence,
                ipAddress,
                deviceId,
                userAgent,
            ]
        );

        await client.query('COMMIT');

        console.log(
            `[Attendance] ✅ ${type} successful for user ${userId}, confidence: ${matchResult.confidence}%`
        );

        return {
            success: true,
            attendance,
            verification: {
                confidence: matchResult.confidence,
                distance: matchResult.distance,
                securityLevel,
                faceVerified: true,
            },
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[Attendance] Error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    determineSecurityLevel,
    matchFaceEmbedding,
    logVerificationAttempt,
    createAttendanceWithFaceValidation,
    SECURITY_LEVELS,
};
