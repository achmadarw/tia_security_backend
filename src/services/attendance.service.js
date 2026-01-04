// Attendance Service with Face Validation
// Purpose: Business logic for attendance operations with face recognition validation

const pool = require('../config/database');

// Security level thresholds for 24/7 operations (security/residential)
// All hours treated equally for consistent user experience
const SECURITY_LEVELS = {
    LOW: {
        threshold: 0.6,
        minMargin: 0.03,
        minConfidence: 60.0,
        description: 'Standard threshold for all hours (24/7 operations)',
    },
    MEDIUM: {
        threshold: 0.65,
        minMargin: 0.05,
        minConfidence: 65.0,
        description: 'Reserved for future use (location-based, etc)',
    },
    HIGH: {
        threshold: 0.7,
        minMargin: 0.08,
        minConfidence: 70.0,
        description: 'Reserved for future use (manual verification, etc)',
    },
};

/**
 * Determine security level based on context
 * For 24/7 operations, all hours use LOW threshold for consistent UX
 * @param {Object} params - {time, location, userId}
 * @returns {String} 'LOW', 'MEDIUM', or 'HIGH'
 */
function determineSecurityLevel({ time, location, userId }) {
    const hour = time.getHours();

    // For 24/7 operations (security/residential), use consistent threshold
    // to avoid false rejections during night shifts with poor lighting
    console.log(`[Security] LOW level: 24/7 operation - hour ${hour}:00`);
    return 'LOW';

    // Future enhancement: Can add location-based security if needed
    // if (location && isOutsideAllowedArea(location)) {
    //     return 'MEDIUM';
    // }
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

    // Calculate cosine similarity (same as login endpoint)
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        norm1 += embedding1[i] * embedding1[i];
        norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude1 = Math.sqrt(norm1);
    const magnitude2 = Math.sqrt(norm2);

    if (magnitude1 === 0 || magnitude2 === 0) {
        return 2; // Maximum distance
    }

    const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);

    // Convert to cosine distance (0 = identical, 2 = opposite)
    const clampedSimilarity = Math.max(-1, Math.min(1, cosineSimilarity));
    const cosineDistance = 1 - clampedSimilarity;

    return cosineDistance;
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

        // Check if already checked in today (prevent duplicate check-ins during shift)
        if (type === 'check_in') {
            // Check if user has completed a shift today (check-in + check-out)
            const lastAttendanceResult = await client.query(
                `SELECT a_in.id as checkin_id, 
                        a_in.created_at as checkin_time,
                        a_out.created_at as checkout_time,
                        s.end_time as shift_end_time,
                        sa.assignment_date
                 FROM attendance a_in
                 LEFT JOIN attendance a_out ON a_in.user_id = a_out.user_id
                    AND DATE(a_out.created_at) = DATE(a_in.created_at)
                    AND a_out.type = 'check_out'
                    AND a_out.created_at > a_in.created_at
                 LEFT JOIN shift_assignments sa ON a_in.shift_assignment_id = sa.id
                 LEFT JOIN shifts s ON sa.shift_id = s.id
                 WHERE a_in.user_id = $1 
                 AND DATE(a_in.created_at) = CURRENT_DATE 
                 AND a_in.type = 'check_in'
                 ORDER BY a_in.created_at DESC
                 LIMIT 1`,
                [userId]
            );

            if (lastAttendanceResult.rows.length > 0) {
                const lastAttendance = lastAttendanceResult.rows[0];

                // User has check-in today
                if (!lastAttendance.checkout_time) {
                    // Still checked in (no check-out yet)
                    await client.query('ROLLBACK');
                    return {
                        success: false,
                        error: 'ALREADY_CHECKED_IN',
                        message:
                            'You are already checked in. Please check out first.',
                    };
                } else {
                    // Already checked out - check if shift has ended
                    if (lastAttendance.shift_end_time) {
                        const now = new Date();
                        const [endHour, endMinute] =
                            lastAttendance.shift_end_time.split(':');
                        const shiftEndTime = new Date();
                        shiftEndTime.setHours(
                            parseInt(endHour),
                            parseInt(endMinute),
                            0,
                            0
                        );

                        // Handle shift that ends past midnight (e.g., 24:00 or 02:00)
                        if (
                            parseInt(endHour) >= 24 ||
                            (parseInt(endHour) < 12 && now.getHours() >= 12)
                        ) {
                            // Shift ends tomorrow
                            shiftEndTime.setDate(shiftEndTime.getDate() + 1);
                        }

                        if (now < shiftEndTime) {
                            // Shift hasn't ended yet
                            await client.query('ROLLBACK');
                            return {
                                success: false,
                                error: 'SHIFT_NOT_ENDED',
                                message: `You have already completed your shift today. You can check in again after ${lastAttendance.shift_end_time}.`,
                            };
                        }
                    }
                    // Shift has ended or no shift info - allow check-in for backup
                }
            }
        }

        // Get shift info for this user
        const userShiftResult = await client.query(
            `SELECT s.id as shift_id, sa.id as shift_assignment_id
             FROM users u
             LEFT JOIN shift_assignments sa ON u.id = sa.user_id 
                AND sa.assignment_date = CURRENT_DATE
             LEFT JOIN shifts s ON u.shift_id = s.id
             WHERE u.id = $1`,
            [userId]
        );

        const shiftInfo = userShiftResult.rows[0] || {};
        const shiftId = shiftInfo.shift_id || null;
        const shiftAssignmentId = shiftInfo.shift_assignment_id || null;

        // Insert attendance record
        const insertQuery = `INSERT INTO attendance 
               (user_id, shift_id, shift_assignment_id, type, 
                location_lat, location_lng, 
                face_confidence, face_verified, security_level, verification_attempts)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, 1)
               RETURNING *`;

        const attendanceResult = await client.query(insertQuery, [
            userId,
            shiftId,
            shiftAssignmentId,
            type,
            latitude,
            longitude,
            matchResult.confidence,
            securityLevel,
        ]);

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
