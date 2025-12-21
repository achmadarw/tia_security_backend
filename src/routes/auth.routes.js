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
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res
                .status(400)
                .json({ error: 'Phone and password are required' });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE phone = $1 AND status = $2',
            [phone, 'active']
        );

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

        // Get all users with face images (even without embeddings)
        const usersResult = await pool.query(
            `SELECT DISTINCT u.id, u.name, u.email, u.phone, u.role, u.shift_id, 
                    u.status, u.password, u.face_embeddings::text as face_embeddings_text,
                    u.created_at, u.updated_at
             FROM users u
             JOIN face_images fi ON u.id = fi.user_id
             WHERE u.status = $1`,
            ['active']
        );

        console.log(
            '[Face Login] Users with face images:',
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
        // Using Cosine Distance (0 = identical, 2 = completely different)
        // Threshold 0.4 means: accept if cosine distance <= 0.4
        // This equals cosine similarity >= 0.6 (60% similar)
        const threshold = parseFloat(process.env.FACE_MATCH_THRESHOLD) || 0.4;
        console.log('[Face Login] Using threshold:', threshold);
        let bestMatch = null;
        let bestDistance = Infinity;

        for (const user of usersResult.rows) {
            console.log('[Face Login] Checking user:', user.id, user.name);

            // Check if user has embeddings
            if (user.face_embeddings && Array.isArray(user.face_embeddings)) {
                console.log(
                    '[Face Login] User has',
                    user.face_embeddings.length,
                    'embeddings in users table'
                );

                for (let i = 0; i < user.face_embeddings.length; i++) {
                    try {
                        const storedEmb = user.face_embeddings[i];
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

                        console.log('[Face Login] Distance:', distance);

                        if (distance < bestDistance) {
                            bestDistance = distance;
                            if (distance < threshold) {
                                bestMatch = user;
                                console.log('[Face Login] New best match!');
                            }
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
                console.log(
                    '[Face Login] User has no embeddings in users table, checking face_images...'
                );
                // User has images but no embeddings - check their face_images table
                const imagesResult = await pool.query(
                    'SELECT embedding FROM face_images WHERE user_id = $1 AND embedding IS NOT NULL LIMIT 1',
                    [user.id]
                );

                if (imagesResult.rows.length > 0) {
                    try {
                        const imageEmbedding = imagesResult.rows[0].embedding;
                        const distance = calculateEuclideanDistance(
                            embedding,
                            imageEmbedding
                        );

                        if (distance < bestDistance && distance < threshold) {
                            bestDistance = distance;
                            bestMatch = user;
                        }
                    } catch (err) {
                        console.error(
                            '[Face Login] Error with image embedding:',
                            err.message
                        );
                    }
                }
            }
        }

        console.log(
            '[Face Login] Matching complete. Best distance:',
            bestDistance
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

        // Auto create attendance record
        let attendance = null;
        try {
            const { location_lat, location_lng } = req.body;

            // Check today's attendance status
            const today = new Date().toISOString().split('T')[0];
            const attendanceCheck = await pool.query(
                `SELECT * FROM attendance 
                 WHERE user_id = $1 
                 AND DATE(created_at) = $2 
                 ORDER BY created_at DESC 
                 LIMIT 1`,
                [bestMatch.id, today]
            );

            // Determine type: check_in if no record today OR last was check_out
            let type = 'check_in';
            if (attendanceCheck.rows.length > 0) {
                const lastAttendance = attendanceCheck.rows[0];
                type =
                    lastAttendance.type === 'check_in'
                        ? 'check_out'
                        : 'check_in';
            }

            // Create attendance record
            const attendanceResult = await pool.query(
                `INSERT INTO attendance 
                 (user_id, shift_id, type, location_lat, location_lng, face_confidence, photo_url)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING *`,
                [
                    bestMatch.id,
                    bestMatch.shift_id,
                    type,
                    location_lat || null,
                    location_lng || null,
                    parseFloat(confidence),
                    null, // No photo for face login
                ]
            );

            attendance = attendanceResult.rows[0];
            console.log(
                '[Face Login] Attendance created:',
                type,
                'ID:',
                attendance.id
            );
        } catch (attendanceError) {
            console.error(
                '[Face Login] Failed to create attendance:',
                attendanceError
            );
            // Continue login even if attendance fails
        }

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
            attendance: attendance, // Include attendance info
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
