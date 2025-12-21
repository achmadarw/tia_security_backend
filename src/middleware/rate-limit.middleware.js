const pool = require('../config/database');

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.firstAttempt > 60000) {
            // Remove entries older than 1 minute
            rateLimitStore.delete(key);
        }
    }
}, 300000);

/**
 * Rate limiter middleware for face login
 * Limits to 5 attempts per minute per IP/device
 */
const faceLoginRateLimit = (req, res, next) => {
    try {
        // Get identifier from IP or device_id (if provided)
        const deviceId = req.body.device_id || req.headers['x-device-id'];
        const ip = req.ip || req.connection.remoteAddress;
        const identifier = deviceId || ip;

        const now = Date.now();
        const key = `face_login:${identifier}`;

        let rateData = rateLimitStore.get(key);

        if (!rateData) {
            // First attempt
            rateLimitStore.set(key, {
                count: 1,
                firstAttempt: now,
                lastAttempt: now,
            });
            return next();
        }

        // Check if window has expired (1 minute)
        if (now - rateData.firstAttempt > 60000) {
            // Reset window
            rateLimitStore.set(key, {
                count: 1,
                firstAttempt: now,
                lastAttempt: now,
            });
            return next();
        }

        // Increment count
        rateData.count++;
        rateData.lastAttempt = now;
        rateLimitStore.set(key, rateData);

        // Check limit
        const limit = parseInt(process.env.FACE_LOGIN_RATE_LIMIT) || 5;
        if (rateData.count > limit) {
            const remainingTime = Math.ceil(
                (60000 - (now - rateData.firstAttempt)) / 1000
            );
            console.log(
                `[RateLimit] Face login blocked for ${identifier}: ${rateData.count} attempts`
            );

            return res.status(429).json({
                error: 'Too many attempts',
                message: `Terlalu banyak percobaan. Silakan coba lagi dalam ${remainingTime} detik.`,
                retryAfter: remainingTime,
            });
        }

        // Log warning if approaching limit
        if (rateData.count === limit) {
            console.warn(
                `[RateLimit] Face login approaching limit for ${identifier}`
            );
        }

        next();
    } catch (error) {
        console.error('[RateLimit] Error:', error);
        // Don't block on error
        next();
    }
};

/**
 * General rate limiter
 * @param {number} limit - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @param {string} message - Error message
 */
const createRateLimiter = (limit, windowMs, message) => {
    return (req, res, next) => {
        try {
            const ip = req.ip || req.connection.remoteAddress;
            const key = `${req.baseUrl}${req.path}:${ip}`;
            const now = Date.now();

            let rateData = rateLimitStore.get(key);

            if (!rateData) {
                rateLimitStore.set(key, {
                    count: 1,
                    firstAttempt: now,
                    lastAttempt: now,
                });
                return next();
            }

            if (now - rateData.firstAttempt > windowMs) {
                rateLimitStore.set(key, {
                    count: 1,
                    firstAttempt: now,
                    lastAttempt: now,
                });
                return next();
            }

            rateData.count++;
            rateData.lastAttempt = now;
            rateLimitStore.set(key, rateData);

            if (rateData.count > limit) {
                const remainingTime = Math.ceil(
                    (windowMs - (now - rateData.firstAttempt)) / 1000
                );
                return res.status(429).json({
                    error: 'Too many requests',
                    message:
                        message || 'Too many requests. Please try again later.',
                    retryAfter: remainingTime,
                });
            }

            next();
        } catch (error) {
            console.error('[RateLimit] Error:', error);
            next();
        }
    };
};

module.exports = {
    faceLoginRateLimit,
    createRateLimiter,
};
