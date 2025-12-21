const pool = require('../config/database');

/**
 * Log face login attempt (success or failure)
 * @param {Object} data - Login attempt data
 * @param {number} data.userId - User ID (null if not recognized)
 * @param {boolean} data.success - Whether login was successful
 * @param {number} data.confidence - Face match confidence (0-100)
 * @param {number} data.distance - Face distance metric
 * @param {string} data.ip - Client IP address
 * @param {string} data.deviceId - Device identifier
 * @param {string} data.userAgent - User agent string
 * @param {string} data.errorMessage - Error message if failed
 */
async function logFaceLoginAttempt(data) {
    try {
        const {
            userId = null,
            success = false,
            confidence = null,
            distance = null,
            ip = null,
            deviceId = null,
            userAgent = null,
            errorMessage = null,
        } = data;

        // Check if table exists, create if not
        await ensureFaceLoginLogsTable();

        await pool.query(
            `INSERT INTO face_login_logs 
             (user_id, success, confidence, distance, ip_address, device_id, user_agent, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId,
                success,
                confidence,
                distance,
                ip,
                deviceId,
                userAgent,
                errorMessage,
            ]
        );

        console.log(
            `[AuditLog] Face login attempt logged: user=${userId}, success=${success}`
        );
    } catch (error) {
        // Don't throw error, just log it
        console.error(
            '[AuditLog] Failed to log face login attempt:',
            error.message
        );
    }
}

/**
 * Ensure face_login_logs table exists
 */
async function ensureFaceLoginLogsTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS face_login_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                success BOOLEAN NOT NULL DEFAULT false,
                confidence DECIMAL(5,2),
                distance DECIMAL(10,6),
                ip_address VARCHAR(45),
                device_id VARCHAR(255),
                user_agent TEXT,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indexes for performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_face_login_logs_user_id 
            ON face_login_logs(user_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_face_login_logs_created_at 
            ON face_login_logs(created_at);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_face_login_logs_success 
            ON face_login_logs(success);
        `);
    } catch (error) {
        console.error(
            '[AuditLog] Failed to ensure table exists:',
            error.message
        );
    }
}

/**
 * Get face login statistics
 * @param {Object} filters
 * @param {number} filters.userId - Filter by user ID
 * @param {Date} filters.startDate - Start date
 * @param {Date} filters.endDate - End date
 * @param {boolean} filters.success - Filter by success status
 * @returns {Promise<Object>} Statistics
 */
async function getFaceLoginStats(filters = {}) {
    try {
        const { userId, startDate, endDate, success } = filters;

        let query = `
            SELECT 
                COUNT(*) as total_attempts,
                SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_attempts,
                SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_attempts,
                AVG(CASE WHEN success THEN confidence ELSE NULL END) as avg_confidence,
                MIN(created_at) as first_attempt,
                MAX(created_at) as last_attempt
            FROM face_login_logs
            WHERE 1=1
        `;

        const params = [];

        if (userId) {
            params.push(userId);
            query += ` AND user_id = $${params.length}`;
        }

        if (startDate) {
            params.push(startDate);
            query += ` AND created_at >= $${params.length}`;
        }

        if (endDate) {
            params.push(endDate);
            query += ` AND created_at <= $${params.length}`;
        }

        if (success !== undefined) {
            params.push(success);
            query += ` AND success = $${params.length}`;
        }

        const result = await pool.query(query, params);
        return result.rows[0];
    } catch (error) {
        console.error('[AuditLog] Failed to get stats:', error);
        return null;
    }
}

/**
 * Get recent face login attempts
 * @param {number} limit - Number of records to return
 * @param {number} userId - Optional user filter
 * @returns {Promise<Array>} Recent attempts
 */
async function getRecentFaceLoginAttempts(limit = 50, userId = null) {
    try {
        let query = `
            SELECT 
                fl.*,
                u.name as user_name,
                u.email as user_email
            FROM face_login_logs fl
            LEFT JOIN users u ON fl.user_id = u.id
            WHERE 1=1
        `;

        const params = [limit];

        if (userId) {
            params.unshift(userId);
            query += ` AND fl.user_id = $1`;
            query += ` ORDER BY fl.created_at DESC LIMIT $2`;
        } else {
            query += ` ORDER BY fl.created_at DESC LIMIT $1`;
        }

        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('[AuditLog] Failed to get recent attempts:', error);
        return [];
    }
}

/**
 * Detect suspicious activity
 * Multiple failed attempts from same IP/device
 */
async function detectSuspiciousActivity(threshold = 10, windowMinutes = 60) {
    try {
        const query = `
            SELECT 
                COALESCE(ip_address, device_id) as identifier,
                COUNT(*) as failed_count,
                MAX(created_at) as last_attempt,
                array_agg(DISTINCT user_id) as attempted_users
            FROM face_login_logs
            WHERE success = false
                AND created_at > NOW() - INTERVAL '${windowMinutes} minutes'
            GROUP BY COALESCE(ip_address, device_id)
            HAVING COUNT(*) >= $1
            ORDER BY failed_count DESC
        `;

        const result = await pool.query(query, [threshold]);
        return result.rows;
    } catch (error) {
        console.error(
            '[AuditLog] Failed to detect suspicious activity:',
            error
        );
        return [];
    }
}

module.exports = {
    logFaceLoginAttempt,
    getFaceLoginStats,
    getRecentFaceLoginAttempts,
    detectSuspiciousActivity,
    ensureFaceLoginLogsTable,
};
