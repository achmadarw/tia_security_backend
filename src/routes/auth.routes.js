const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authMiddleware } = require('../middleware/auth.middleware');
const { faceLoginRateLimit } = require('../middleware/rate-limit.middleware');
const { logFaceLoginAttempt } = require('../middleware/audit-log.middleware');

// Login
router.post('/login', async (req, res) => {
    try {
        const { phone, email, password } = req.body;

        if ((!phone && !email) || !password) {
            return res
                .status(400)
                .json({ error: 'Phone/Email and password are required' });
        }

        // Allow login with either phone or email
        let result;
        if (email) {
            result = await pool.query(
                'SELECT * FROM users WHERE email = $1 AND status = $2',
                [email, 'active']
            );
        } else {
            result = await pool.query(
                'SELECT * FROM users WHERE phone = $1 AND status = $2',
                [phone, 'active']
            );
        }

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate tokens
        const accessToken = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '1h' }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
        );

        // Return user data without password
        delete user.password;

        res.json({
            user,
            accessToken,
            refreshToken,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Face Login
router.post('/login/face', faceLoginRateLimit, async (req, res) => {
    const startTime = Date.now();

    // Get client info for audit log
    const ip = req.ip || req.connection.remoteAddress;
    const deviceId = req.body.device_id || req.headers['x-device-id'];
    const userAgent = req.headers['user-agent'];

    try {
        console.log('[Face Login] Request received');
        const { embedding } = req.body;

        console.log(
            '[Face Login] Embedding received:',
            embedding ? `Yes (${embedding.length} dimensions)` : 'No'
        );

        if (!embedding || !Array.isArray(embedding)) {
            // Log failed attempt
            await logFaceLoginAttempt({
                success: false,
                errorMessage: 'No embedding provided',
                ip,
                deviceId,
                userAgent,
            });

            return res
                .status(400)
                .json({ error: 'Valid face embedding required' });
        }

        // Get all users who have face embeddings registered
        const usersResult = await pool.query(
            `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, u.shift_id, 
                    u.status, u.password, u.created_at, u.updated_at
             FROM users u
             JOIN user_embeddings ue ON u.id = ue.user_id
             WHERE u.status = $1`,
            ['active']
        );

        console.log(
            '[Face Login] Users with face embeddings:',
            usersResult.rows.length
        );

        // Parse face_embeddings from text to array
        for (const user of usersResult.rows) {
            if (user.face_embeddings_text) {
                try {
                    user.face_embeddings = JSON.parse(
                        user.face_embeddings_text
                    );
                } catch (e) {
                    console.error(
                        '[Face Login] Failed to parse embeddings for user',
                        user.id
                    );
                    user.face_embeddings = null;
                }
            }
        }

        if (usersResult.rows.length === 0) {
            return res.status(404).json({
                error: 'No registered faces found',
                message: 'Please register your face first from User Management',
            });
        }

        // For users with embeddings, do matching
        // Adaptive multi-tier security: balance usability and security
        const threshold = parseFloat(process.env.FACE_MATCH_THRESHOLD) || 0.55;
        const minConfidence =
            parseFloat(process.env.FACE_MIN_CONFIDENCE) || 55.0;
        const minMargin = parseFloat(process.env.FACE_MIN_MARGIN) || 0.08;
        const highConfidence =
            parseFloat(process.env.FACE_HIGH_CONFIDENCE) || 70.0;
        console.log(
            '[Face Login] Threshold:',
            threshold,
            '| Min Confidence:',
            minConfidence,
            '| Min Margin:',
            minMargin
        );
        console.log('[Face Login] Using threshold:', threshold);
        let bestMatch = null;
        let bestDistance = Infinity;
        let secondBestDistance = Infinity; // Track runner-up for margin check

        for (const user of usersResult.rows) {
            console.log('[Face Login] Checking user:', user.id, user.name);

            // Get all embeddings for this user from user_embeddings table
            const embeddingsResult = await pool.query(
                'SELECT embedding FROM user_embeddings WHERE user_id = $1 ORDER BY created_at DESC',
                [user.id]
            );

            if (embeddingsResult.rows.length > 0) {
                console.log(
                    '[Face Login] User has',
                    embeddingsResult.rows.length,
                    'embeddings in user_embeddings table'
                );

                for (let i = 0; i < embeddingsResult.rows.length; i++) {
                    try {
                        const storedEmb = embeddingsResult.rows[i].embedding;
                        console.log(
                            '[Face Login] Comparing with embedding',
                            i,
                            '- length:',
                            storedEmb.length
                        );

                        const distance = calculateEuclideanDistance(
                            embedding,
                            storedEmb
                        );

                        console.log(
                            `[Face Login] User ${user.id} (${user.name}) Embedding ${i} Distance:`,
                            distance
                        );

                        if (distance < bestDistance) {
                            // Update runner-up before updating best
                            secondBestDistance = bestDistance;
                            bestDistance = distance;
                            console.log(
                                `[Face Login] New best distance: ${distance} (threshold: ${threshold})`
                            );
                            if (distance < threshold) {
                                bestMatch = user;
                                console.log(
                                    `[Face Login] ✅ MATCH! User ${user.id} (${user.name})`
                                );
                            } else {
                                console.log(
                                    `[Face Login] ❌ Distance ${distance} > threshold ${threshold} - NOT MATCHED`
                                );
                            }
                        } else if (distance < secondBestDistance) {
                            // Track second best for margin calculation
                            secondBestDistance = distance;
                        }
                    } catch (err) {
                        console.error(
                            '[Face Login] Error comparing embedding',
                            i,
                            ':',
                            err.message
                        );
                    }
                }
            } else {
                console.log('[Face Login] User has no embeddings registered');
            }
        }

        console.log(
            '[Face Login] Matching complete. Best distance:',
            bestDistance,
            '| Second best:',
            secondBestDistance
        );

        // Calculate margin between best and second best
        const margin = secondBestDistance - bestDistance;
        console.log(
            '[Face Login] Margin:',
            margin.toFixed(4),
            '| Required:',
            minMargin
        );

        if (!bestMatch) {
            console.log(
                '[Face Login] No match found. Best distance:',
                bestDistance
            );

            // Log failed attempt
            await logFaceLoginAttempt({
                success: false,
                distance: bestDistance,
                errorMessage: 'Face not recognized',
                ip,
                deviceId,
                userAgent,
            });

            return res.status(401).json({
                error: 'Face not recognized',
                message:
                    'Wajah tidak dikenali. Silakan coba lagi atau daftar wajah terlebih dahulu.',
            });
        }

        // Calculate confidence
        // Auto-detect real vs dummy embeddings based on distance
        let confidence;
        if (bestDistance < 2.0) {
            // Real embeddings: distance 0-1, higher is worse
            confidence = ((1 - bestDistance) * 100).toFixed(2);
        } else {
            // Dummy embeddings: distance ~8, use threshold-based calculation
            confidence = (
                ((threshold - bestDistance) / threshold) *
                100
            ).toFixed(2);
        }

        console.log(
            '[Face Login] Confidence:',
            confidence,
            '| Min required:',
            minConfidence
        );

        // CRITICAL: Check confidence minimum
        if (parseFloat(confidence) < minConfidence) {
            console.log(
                `[Face Login] ❌ REJECTED: Confidence ${confidence}% < minimum ${minConfidence}%`
            );

            await logFaceLoginAttempt({
                userId: bestMatch.id,
                success: false,
                confidence: parseFloat(confidence),
                distance: bestDistance,
                errorMessage: `Confidence too low: ${confidence}%`,
                ip,
                deviceId,
                userAgent,
            });

            return res.status(401).json({
                error: 'Face not recognized',
                message: `Confidence terlalu rendah (${confidence}%). Pastikan wajah Anda terlihat jelas.`,
            });
        }

        // ADAPTIVE: Check margin minimum (prevent close matches)
        // BUT: If confidence is very high (>70%), bypass margin check
        const needsMarginCheck = parseFloat(confidence) < highConfidence;

        if (needsMarginCheck && margin < minMargin) {
            console.log(
                `[Face Login] ❌ REJECTED: Confidence ${confidence}% < ${highConfidence}% AND Margin ${margin.toFixed(
                    4
                )} < minimum ${minMargin} - TOO CLOSE!`
            );

            await logFaceLoginAttempt({
                userId: bestMatch.id,
                success: false,
                confidence: parseFloat(confidence),
                distance: bestDistance,
                errorMessage: `Match too ambiguous: margin ${margin.toFixed(
                    4
                )}, confidence ${confidence}%`,
                ip,
                deviceId,
                userAgent,
            });

            return res.status(401).json({
                error: 'Face recognition ambiguous',
                message:
                    'Wajah terlalu mirip dengan pengguna lain. Silakan coba lagi dengan pencahayaan lebih baik.',
            });
        } else if (!needsMarginCheck) {
            console.log(
                `[Face Login] ✅ HIGH CONFIDENCE ${confidence}% - Margin check bypassed`
            );
        }

        console.log(
            '[Face Login] Match found! User:',
            bestMatch.id,
            'Confidence:',
            confidence
        );

        // Generate tokens
        const accessToken = jwt.sign(
            { userId: bestMatch.id, role: bestMatch.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '1h' }
        );

        const refreshToken = jwt.sign(
            { userId: bestMatch.id, role: bestMatch.role },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d' }
        );

        // Face login is only for authentication, NOT for attendance
        // Attendance should be done through Quick Attendance screen

        delete bestMatch.password;
        delete bestMatch.face_embeddings;
        // Log successful attempt
        await logFaceLoginAttempt({
            userId: bestMatch.id,
            success: true,
            confidence: parseFloat(confidence),
            distance: bestDistance,
            ip,
            deviceId,
            userAgent,
        });

        const responseTime = Date.now() - startTime;
        console.log(`[Face Login] Response time: ${responseTime}ms`);
        res.json({
            user: bestMatch,
            confidence: parseFloat(confidence),
            distance: bestDistance,
            accessToken,
            refreshToken,
        });
    } catch (error) {
        console.error('Face login error:', error);

        // Log system error
        await logFaceLoginAttempt({
            success: false,
            errorMessage: `System error: ${error.message}`,
            ip,
            deviceId,
            userAgent,
        });

        res.status(500).json({ error: 'Face login failed' });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET
        );

        const accessToken = jwt.sign(
            { userId: decoded.userId, role: decoded.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '1h' }
        );

        res.json({ accessToken });
    } catch (error) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, phone, role, shift_id, status, created_at FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Helper function - Using Cosine Distance for normalized embeddings
// Cosine distance = 1 - cosine similarity
// Lower distance = more similar (0 = identical, 2 = opposite)
function calculateEuclideanDistance(emb1, emb2) {
    if (emb1.length !== emb2.length) {
        throw new Error('Embeddings must have same length');
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < emb1.length; i++) {
        dotProduct += emb1[i] * emb2[i];
        norm1 += emb1[i] * emb1[i];
        norm2 += emb2[i] * emb2[i];
    }

    const magnitude1 = Math.sqrt(norm1);
    const magnitude2 = Math.sqrt(norm2);

    if (magnitude1 === 0 || magnitude2 === 0) {
        return 2; // Maximum distance
    }

    const cosineSimilarity = dotProduct / (magnitude1 * magnitude2);

    // Convert to cosine distance (0 = identical, 2 = opposite)
    // Clamp similarity to [-1, 1] to handle floating point errors
    const clampedSimilarity = Math.max(-1, Math.min(1, cosineSimilarity));
    const cosineDistance = 1 - clampedSimilarity;

    return cosineDistance;
}

module.exports = router;
