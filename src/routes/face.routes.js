const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const upload = require('../middleware/upload.middleware');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const {
    authMiddleware,
    adminMiddleware,
} = require('../middleware/auth.middleware');
const qualityService = require('../services/embedding_quality.service');

// Register/Update face embeddings (admin only)
router.post(
    '/register',
    authMiddleware,
    adminMiddleware,
    upload.array('images', 15),
    async (req, res) => {
        try {
            const { user_id, userId, embeddings: embeddingsStr } = req.body;
            const finalUserId = user_id || userId;

            console.log('[Face Register] ===== REQUEST RECEIVED =====');
            console.log('[Face Register] Body keys:', Object.keys(req.body));
            console.log('[Face Register] Body values:');
            for (const key in req.body) {
                const value = req.body[key];
                if (typeof value === 'string' && value.length > 100) {
                    console.log(
                        `  ${key}: [string ${
                            value.length
                        } chars] ${value.substring(0, 100)}...`
                    );
                } else {
                    console.log(`  ${key}:`, value);
                }
            }
            console.log('[Face Register] user_id:', finalUserId);
            console.log('[Face Register] Files count:', req.files?.length || 0);
            console.log(
                '[Face Register] Embeddings provided:',
                embeddingsStr ? 'Yes' : 'No'
            );
            if (embeddingsStr) {
                console.log(
                    '[Face Register] Embeddings string length:',
                    embeddingsStr.length
                );
            }

            if (!finalUserId) {
                return res.status(400).json({ error: 'User ID required' });
            }

            if (!req.files || req.files.length === 0) {
                return res
                    .status(400)
                    .json({ error: 'At least one image required' });
            }

            // Parse embeddings if provided
            let embeddings = null;
            if (embeddingsStr) {
                try {
                    embeddings = JSON.parse(embeddingsStr);
                    console.log(
                        '[Face Register] Parsed embeddings:',
                        embeddings.length
                    );
                } catch (e) {
                    console.error(
                        '[Face Register] Failed to parse embeddings:',
                        e
                    );
                }
            }

            // Check if user exists
            const userCheck = await pool.query(
                'SELECT id, name FROM users WHERE id = $1',
                [finalUserId]
            );

            if (userCheck.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Delete existing face images for this user
            await pool.query('DELETE FROM face_images WHERE user_id = $1', [
                finalUserId,
            ]);

            // Save new face images (without embeddings initially)
            const savedImages = [];
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];

                const result = await pool.query(
                    `INSERT INTO face_images (user_id, image_url)
                     VALUES ($1, $2)
                     RETURNING id, image_url, created_at`,
                    [finalUserId, `/uploads/faces/${file.filename}`]
                );
                savedImages.push(result.rows[0]);
            }

            console.log(
                '[Face Register] Saved',
                savedImages.length,
                'images, now generating embeddings...'
            );

            // Generate embeddings using Python script with TFLite
            try {
                const scriptPath = path.join(
                    __dirname,
                    '..',
                    '..',
                    'scripts',
                    'extract_embeddings_tflite.py'
                );

                // Set environment variables for Python script
                const pythonEnv = {
                    ...process.env,
                    DB_HOST: process.env.DB_HOST || 'localhost',
                    DB_PORT: process.env.DB_PORT || '5432',
                    DB_NAME: process.env.DB_NAME || 'tia_db',
                    DB_USER: process.env.DB_USER || 'postgres',
                    DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',
                };

                console.log(
                    '[Face Register] Executing Python embedding script...'
                );

                const { stdout, stderr } = await execPromise(
                    `python "${scriptPath}" ${finalUserId}`,
                    { env: pythonEnv, timeout: 60000 } // 60 second timeout
                );

                if (stdout) console.log('[Python]', stdout);
                if (stderr) console.warn('[Python Error]', stderr);

                // Check if embeddings were generated
                const embeddingCheck = await pool.query(
                    'SELECT face_embeddings FROM users WHERE id = $1',
                    [finalUserId]
                );

                const hasEmbeddings =
                    embeddingCheck.rows[0]?.face_embeddings != null;

                console.log(
                    '[Face Register] ✅ Success:',
                    savedImages.length,
                    'images uploaded,',
                    hasEmbeddings ? 'embeddings generated' : 'NO embeddings'
                );

                res.status(201).json({
                    message: 'Face images registered successfully',
                    user: userCheck.rows[0],
                    imagesCount: savedImages.length,
                    embeddingsGenerated: hasEmbeddings,
                    images: savedImages,
                });
            } catch (pythonError) {
                console.error(
                    '[Face Register] Python script error:',
                    pythonError
                );
                // Still return success for image upload, but warn about embeddings
                res.status(201).json({
                    message:
                        'Face images uploaded but embedding generation failed',
                    user: userCheck.rows[0],
                    imagesCount: savedImages.length,
                    embeddingsGenerated: false,
                    warning:
                        'Embeddings not generated. Please run extract_embeddings.py manually',
                    error: pythonError.message,
                    images: savedImages,
                });
            }
        } catch (error) {
            console.error('[Face Register] Error:', error);
            res.status(500).json({
                error: 'Failed to register face',
                message: error.message,
            });
        }
    }
);

// Recognize face
router.post('/recognize', async (req, res) => {
    try {
        const { embedding } = req.body;

        if (!embedding || !Array.isArray(embedding)) {
            return res
                .status(400)
                .json({ error: 'Valid face embedding required' });
        }

        // Get all users with face embeddings
        const result = await pool.query(
            `SELECT id, name, phone, role, shift_id, face_embeddings
       FROM users 
       WHERE face_embeddings IS NOT NULL AND status = 'active'`
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No registered faces found' });
        }

        // Find best match using Cosine Distance
        // Threshold 0.4 means: accept if cosine distance <= 0.4
        const threshold = parseFloat(process.env.FACE_MATCH_THRESHOLD) || 0.4;
        let bestMatch = null;
        let bestDistance = Infinity;

        for (const user of result.rows) {
            const storedEmbeddings = user.face_embeddings;

            for (const storedEmb of storedEmbeddings) {
                const distance = calculateEuclideanDistance(
                    embedding,
                    storedEmb
                );

                if (distance < bestDistance) {
                    bestDistance = distance;
                    if (distance < threshold) {
                        bestMatch = user;
                    }
                }
            }
        }

        if (!bestMatch) {
            return res.status(404).json({
                error: 'Face not recognized',
                bestDistance: bestDistance.toFixed(4),
                threshold,
            });
        }

        const confidence = ((1 - bestDistance) * 100).toFixed(2);

        delete bestMatch.face_embeddings;

        res.json({
            user: bestMatch,
            confidence: parseFloat(confidence),
            distance: parseFloat(bestDistance.toFixed(4)),
            matched: true,
        });
    } catch (error) {
        console.error('Face recognition error:', error);
        res.status(500).json({ error: 'Face recognition failed' });
    }
});

// Get user face images (admin only)
router.get(
    '/images/:userId',
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        try {
            const { userId } = req.params;

            const result = await pool.query(
                `SELECT id, image_url, created_at
       FROM face_images
       WHERE user_id = $1
       ORDER BY created_at DESC`,
                [userId]
            );

            res.json(result.rows);
        } catch (error) {
            console.error('Get face images error:', error);
            res.status(500).json({ error: 'Failed to get face images' });
        }
    }
);

// Delete face data (admin only)
router.delete('/:userId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Delete face embeddings from user_embeddings table
        await pool.query('DELETE FROM user_embeddings WHERE user_id = $1', [
            userId,
        ]);

        // Delete face images (for display purposes)
        await pool.query('DELETE FROM face_images WHERE user_id = $1', [
            userId,
        ]);

        res.json({ message: 'Face data deleted successfully' });
    } catch (error) {
        console.error('Delete face error:', error);
        res.status(500).json({ error: 'Failed to delete face data' });
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

// ========================================
// NEW ENDPOINT: Register embeddings directly from mobile
// ========================================
// This endpoint accepts pre-processed embeddings from mobile,
// eliminating the need for Python script and ensuring consistency
// UPDATED: Now also accepts and saves image files with embeddings
router.post(
    '/register-embeddings',
    authMiddleware,
    adminMiddleware,
    upload.array('images', 15),
    async (req, res) => {
        try {
            const { user_id } = req.body;
            let { embeddings } = req.body;

            // Parse embeddings if it's a string (from multipart/form-data)
            if (typeof embeddings === 'string') {
                try {
                    embeddings = JSON.parse(embeddings);
                } catch (e) {
                    return res.status(400).json({
                        error: 'Invalid embeddings format',
                    });
                }
            }

            console.log(
                '[Face Register Embeddings] ===== REQUEST RECEIVED ====='
            );
            console.log('[Face Register Embeddings] User ID:', user_id);
            console.log(
                '[Face Register Embeddings] Embeddings count:',
                embeddings?.length || 0
            );
            console.log(
                '[Face Register Embeddings] Images count:',
                req.files?.length || 0
            );

            // Validate input
            if (!user_id) {
                return res.status(400).json({ error: 'User ID required' });
            }

            if (
                !embeddings ||
                !Array.isArray(embeddings) ||
                embeddings.length === 0
            ) {
                return res.status(400).json({
                    error: 'At least one embedding required',
                });
            }

            // Validate embedding format
            for (let i = 0; i < embeddings.length; i++) {
                const embedding = embeddings[i];
                if (!Array.isArray(embedding) || embedding.length !== 192) {
                    return res.status(400).json({
                        error: `Invalid embedding at index ${i}: must be array of 192 floats`,
                    });
                }
            }

            // Check if user exists
            const userCheck = await pool.query(
                'SELECT id, name FROM users WHERE id = $1',
                [user_id]
            );

            if (userCheck.rows.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const user = userCheck.rows[0];

            // Delete existing embeddings
            await pool.query('DELETE FROM user_embeddings WHERE user_id = $1', [
                user_id,
            ]);

            console.log(
                '[Face Register Embeddings] Deleted old embeddings for user',
                user_id
            );

            // Insert new embeddings with image URLs
            const insertedEmbeddings = [];
            for (let i = 0; i < embeddings.length; i++) {
                const embedding = embeddings[i];
                const embeddingJson = JSON.stringify(embedding);

                // Get image URL if available
                let imageUrl = null;
                if (req.files && req.files[i]) {
                    imageUrl = `/uploads/faces/${req.files[i].filename}`;
                    console.log(
                        `[Face Register Embeddings] Image URL for embedding ${
                            i + 1
                        }: ${imageUrl}`
                    );
                }

                const result = await pool.query(
                    `INSERT INTO user_embeddings (user_id, embedding, image_url, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           RETURNING id, user_id, image_url, created_at`,
                    [user_id, embeddingJson, imageUrl]
                );

                insertedEmbeddings.push(result.rows[0]);
                console.log(
                    `[Face Register Embeddings] Inserted embedding ${i + 1}/${
                        embeddings.length
                    } (ID: ${result.rows[0].id})`
                );
            }

            console.log(
                '[Face Register Embeddings] ✅ Successfully registered',
                insertedEmbeddings.length,
                'embeddings'
            );

            return res.status(200).json({
                message: 'Face embeddings registered successfully',
                user: {
                    id: user.id,
                    name: user.name,
                },
                embeddings_count: insertedEmbeddings.length,
                embeddings: insertedEmbeddings,
            });
        } catch (error) {
            console.error(
                '[Face Register Embeddings] ❌ Error:',
                error.message
            );
            console.error(error.stack);
            return res.status(500).json({
                error: 'Failed to register face embeddings',
                details: error.message,
            });
        }
    }
);

// ==================== QUALITY SCORING ENDPOINTS ====================

// Score embeddings for a user
router.post('/score-embeddings', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        const requestUserId = userId || req.user.userId;

        // Only admin can score other users' embeddings
        if (userId && req.user.role !== 'admin' && userId !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        console.log(
            `[QualityScore] Scoring embeddings for user ${requestUserId}`
        );

        const scores = await qualityService.scoreUserEmbeddings(requestUserId);

        if (scores.length === 0) {
            return res.status(404).json({
                error: 'No embeddings found',
                message: 'User has no registered face embeddings',
            });
        }

        res.json({
            success: true,
            userId: requestUserId,
            totalScored: scores.length,
            scores: scores.map((s) => ({
                embeddingId: s.embeddingId,
                qualityScore: s.qualityScore,
                qualityLevel: s.qualityLevel,
                consistencyScore: s.consistencyScore,
                distinctivenessScore: s.distinctivenessScore,
                recommendation: s.recommendation,
            })),
        });
    } catch (error) {
        console.error('[QualityScore] Error scoring embeddings:', error);
        res.status(500).json({
            error: 'Failed to score embeddings',
            message: error.message,
        });
    }
});

// Get quality metrics for a user
router.get('/quality/:userId', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.params;

        // Only admin or the user themselves can view quality metrics
        if (req.user.role !== 'admin' && parseInt(userId) !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const metrics = await qualityService.getUserQualityMetrics(
            parseInt(userId)
        );

        if (parseInt(metrics.total_embeddings) === 0) {
            return res.status(404).json({
                error: 'No embeddings found',
                message: 'User has no registered face embeddings',
            });
        }

        // Get quality level based on average
        let overallLevel;
        const avgQuality = parseFloat(metrics.avg_quality);
        if (avgQuality >= qualityService.QUALITY_THRESHOLDS.EXCELLENT) {
            overallLevel = 'EXCELLENT';
        } else if (avgQuality >= qualityService.QUALITY_THRESHOLDS.GOOD) {
            overallLevel = 'GOOD';
        } else if (avgQuality >= qualityService.QUALITY_THRESHOLDS.FAIR) {
            overallLevel = 'FAIR';
        } else if (avgQuality >= qualityService.QUALITY_THRESHOLDS.POOR) {
            overallLevel = 'POOR';
        } else {
            overallLevel = 'VERY_POOR';
        }

        res.json({
            userId: parseInt(userId),
            totalEmbeddings: parseInt(metrics.total_embeddings),
            activeEmbeddings: parseInt(metrics.active_embeddings),
            averageQuality: parseFloat(
                parseFloat(metrics.avg_quality).toFixed(2)
            ),
            maxQuality: parseFloat(parseFloat(metrics.max_quality).toFixed(2)),
            minQuality: parseFloat(parseFloat(metrics.min_quality).toFixed(2)),
            averageConsistency: parseFloat(
                parseFloat(metrics.avg_consistency).toFixed(2)
            ),
            averageDistinctiveness: parseFloat(
                parseFloat(metrics.avg_distinctiveness).toFixed(2)
            ),
            overallLevel,
            thresholds: qualityService.QUALITY_THRESHOLDS,
        });
    } catch (error) {
        console.error('[QualityScore] Error getting quality metrics:', error);
        res.status(500).json({
            error: 'Failed to get quality metrics',
            message: error.message,
        });
    }
});

module.exports = router;
