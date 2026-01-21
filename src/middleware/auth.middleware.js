const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.substring(7);

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * Flexible Auth Middleware - Support both access_token and pos_token
 * Priority:
 * 1. Check Authorization: Bearer {token} (could be access_token or pos_token)
 * 2. Check x-pos-token header (for backward compatibility)
 */
const flexibleAuthMiddleware = async (req, res, next) => {
    try {
        // Priority 1: Check Authorization header (could be access_token or pos_token)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if it's a pos_token (has pos_id field)
            if (decoded.pos_id) {
                // It's a pos_token
                req.user = {
                    pos_id: decoded.pos_id,
                    session_id: decoded.session_id,
                    app_access: 'security', // pos_token is always security app
                };

                // Extract user_id from token if available
                if (decoded.user_id) {
                    req.user.user_id = decoded.user_id;
                    req.userId = decoded.user_id;
                }

                // If user_id provided in body, include it (for face recognition flow)
                if (req.body.user_id) {
                    req.user.user_id = parseInt(req.body.user_id);
                    req.userId = parseInt(req.body.user_id);
                }

                req.authMethod = 'pos_token';
                return next();
            } else {
                // It's an access_token (security_access_token or regular access_token)
                req.user = decoded;
                req.userId = decoded.userId || decoded.user_id;
                req.authMethod = 'access_token';
                return next();
            }
        }

        // Priority 2: Check x-pos-token header (backward compatibility)
        const posToken = req.headers['x-pos-token'];

        if (posToken) {
            // Verify pos_token
            const decoded = jwt.verify(posToken, process.env.JWT_SECRET);

            // Ensure it's a pos token (has pos_id)
            if (!decoded.pos_id) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid pos token',
                });
            }

            // Build user object from decoded pos info
            req.user = {
                pos_id: decoded.pos_id,
                session_id: decoded.session_id,
                app_access: 'security', // pos_token is always security app
            };

            // Extract user_id from token if available
            if (decoded.user_id) {
                req.user.user_id = decoded.user_id;
                req.userId = decoded.user_id;
            }

            // If user_id provided in body, include it
            if (req.body.user_id) {
                req.user.user_id = parseInt(req.body.user_id);
                req.userId = parseInt(req.body.user_id);
            }

            req.authMethod = 'pos_token';
            return next();
        }

        // No valid authentication found
        return res.status(401).json({
            success: false,
            error: 'No authentication token provided',
        });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expired',
            });
        }
        return res.status(401).json({
            success: false,
            error: 'Invalid token',
        });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

const requireRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Required role: ${roles.join(' or ')}`,
            });
        }
        next();
    };
};

/**
 * Security App Only Middleware
 * Ensure only users with app_access = 'security' can access
 */
const securityAppOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
        });
    }

    if (req.user.app_access !== 'security') {
        return res.status(403).json({
            success: false,
            error: 'Akun ini hanya bisa digunakan di TIA Community App',
            hint: 'Download TIA Community App untuk mengakses fitur ini',
        });
    }

    next();
};

/**
 * Community App Only Middleware
 * Ensure only users with app_access = 'community' can access
 */
const communityAppOnly = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
        });
    }

    if (req.user.app_access !== 'community') {
        return res.status(403).json({
            success: false,
            error: 'Akun ini hanya bisa digunakan di TIA Security App',
            hint: 'Download TIA Security App untuk security guards',
        });
    }

    next();
};

module.exports = {
    authMiddleware,
    flexibleAuthMiddleware,
    adminMiddleware,
    requireRole,
    securityAppOnly,
    communityAppOnly,
    authenticateToken: authMiddleware, // Alias
};
