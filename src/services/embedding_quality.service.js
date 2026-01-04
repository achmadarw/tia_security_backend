/**
 * Embedding Quality Scoring Service
 * Purpose: Evaluate quality of face embeddings based on consistency and distinctiveness
 *
 * Quality Metrics:
 * - Intra-class Consistency: How similar an embedding is to user's other embeddings (lower variance = higher quality)
 * - Inter-class Separation: How different an embedding is from other users' embeddings (higher distance = higher quality)
 * - Overall Quality Score: Weighted combination of consistency and distinctiveness
 */

const pool = require('../config/database');

// Quality thresholds
const QUALITY_THRESHOLDS = {
    EXCELLENT: 85.0, // Top tier quality
    GOOD: 70.0, // Acceptable quality
    FAIR: 55.0, // Marginal quality, may need re-capture
    POOR: 40.0, // Should be deactivated or re-captured
};

// Scoring weights
const SCORING_WEIGHTS = {
    consistency: 0.6, // 60% weight on consistency (more important)
    distinctiveness: 0.4, // 40% weight on distinctiveness
};

/**
 * Calculate Euclidean distance between two embeddings
 */
function calculateDistance(emb1, emb2) {
    if (emb1.length !== emb2.length) {
        throw new Error(
            `Embedding dimension mismatch: ${emb1.length} vs ${emb2.length}`
        );
    }

    let sum = 0;
    for (let i = 0; i < emb1.length; i++) {
        const diff = emb1[i] - emb2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

/**
 * Calculate intra-class consistency score
 * Measures how consistent this embedding is with user's other embeddings
 * Lower average distance = higher consistency
 *
 * @param {Array} embedding - The embedding to score
 * @param {Array} userEmbeddings - All other embeddings of the same user
 * @returns {Object} { score: 0-100, avgDistance, minDistance, maxDistance }
 */
function calculateIntraClassConsistency(embedding, userEmbeddings) {
    if (!userEmbeddings || userEmbeddings.length === 0) {
        // No other embeddings to compare with
        return {
            score: 50.0, // Neutral score
            avgDistance: null,
            minDistance: null,
            maxDistance: null,
            sampleSize: 0,
        };
    }

    const distances = userEmbeddings.map((otherEmb) =>
        calculateDistance(embedding, otherEmb)
    );

    const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
    const minDistance = Math.min(...distances);
    const maxDistance = Math.max(...distances);

    // Convert distance to score (0-100)
    // Assumption: distance range 0.0 to 2.0 for normalized embeddings
    // Lower distance = higher score
    // 0.0 distance = 100 score
    // 1.0 distance = 50 score
    // 2.0 distance = 0 score
    const score = Math.max(0, Math.min(100, 100 - avgDistance * 50));

    return {
        score: parseFloat(score.toFixed(2)),
        avgDistance: parseFloat(avgDistance.toFixed(4)),
        minDistance: parseFloat(minDistance.toFixed(4)),
        maxDistance: parseFloat(maxDistance.toFixed(4)),
        sampleSize: distances.length,
    };
}

/**
 * Calculate inter-class separation score
 * Measures how different this embedding is from other users' embeddings
 * Higher average distance = higher distinctiveness
 *
 * @param {Array} embedding - The embedding to score
 * @param {Array} otherUsersEmbeddings - Sample of embeddings from other users
 * @returns {Object} { score: 0-100, avgDistance, minDistance, closestUserId }
 */
function calculateInterClassSeparation(embedding, otherUsersEmbeddings) {
    if (!otherUsersEmbeddings || otherUsersEmbeddings.length === 0) {
        // No other users to compare with
        return {
            score: 50.0, // Neutral score
            avgDistance: null,
            minDistance: null,
            closestUserId: null,
            sampleSize: 0,
        };
    }

    const distances = otherUsersEmbeddings.map((item) => ({
        userId: item.user_id,
        distance: calculateDistance(embedding, item.embedding),
    }));

    const avgDistance =
        distances.reduce((sum, item) => sum + item.distance, 0) /
        distances.length;
    const closest = distances.reduce((min, item) =>
        item.distance < min.distance ? item : min
    );

    // Convert distance to score (0-100)
    // Higher distance = higher score (more distinctive)
    // 0.5 distance = 0 score (too similar to other users - security risk!)
    // 1.0 distance = 50 score
    // 1.5 distance = 100 score
    const score = Math.max(0, Math.min(100, (avgDistance - 0.5) * 100));

    return {
        score: parseFloat(score.toFixed(2)),
        avgDistance: parseFloat(avgDistance.toFixed(4)),
        minDistance: parseFloat(closest.distance.toFixed(4)),
        closestUserId: closest.userId,
        sampleSize: distances.length,
    };
}

/**
 * Calculate overall quality score for an embedding
 *
 * @param {Integer} userId - User ID
 * @param {Array} embedding - The embedding to score
 * @param {Integer} embeddingId - Optional: embedding ID (if already stored)
 * @returns {Object} Quality metrics and scores
 */
async function scoreEmbedding(userId, embedding, embeddingId = null) {
    console.log(`[QualityScore] Scoring embedding for user ${userId}`);

    try {
        // 1. Get user's other embeddings (for consistency)
        const userEmbeddingsResult = await pool.query(
            'SELECT id, embedding FROM user_embeddings WHERE user_id = $1 AND ($2::integer IS NULL OR id != $2) ORDER BY created_at DESC',
            [userId, embeddingId]
        );
        const userEmbeddings = userEmbeddingsResult.rows.map(
            (row) => row.embedding
        );

        // 2. Get sample of other users' embeddings (for distinctiveness)
        // Limit to 50 embeddings from other users for performance
        const otherUsersResult = await pool.query(
            `SELECT DISTINCT ON (user_id) user_id, embedding 
             FROM user_embeddings 
             WHERE user_id != $1 AND is_active = true 
             ORDER BY user_id, quality_score DESC NULLS LAST
             LIMIT 50`,
            [userId]
        );
        const otherUsersEmbeddings = otherUsersResult.rows;

        // 3. Calculate consistency score
        const consistencyMetrics = calculateIntraClassConsistency(
            embedding,
            userEmbeddings
        );
        console.log(
            `[QualityScore] Consistency: ${consistencyMetrics.score}% (${consistencyMetrics.sampleSize} samples)`
        );

        // 4. Calculate distinctiveness score
        const distinctivenessMetrics = calculateInterClassSeparation(
            embedding,
            otherUsersEmbeddings
        );
        console.log(
            `[QualityScore] Distinctiveness: ${distinctivenessMetrics.score}% (${distinctivenessMetrics.sampleSize} samples)`
        );

        // 5. Calculate overall quality score (weighted average)
        const qualityScore =
            consistencyMetrics.score * SCORING_WEIGHTS.consistency +
            distinctivenessMetrics.score * SCORING_WEIGHTS.distinctiveness;

        // 6. Determine quality level
        let qualityLevel;
        if (qualityScore >= QUALITY_THRESHOLDS.EXCELLENT) {
            qualityLevel = 'EXCELLENT';
        } else if (qualityScore >= QUALITY_THRESHOLDS.GOOD) {
            qualityLevel = 'GOOD';
        } else if (qualityScore >= QUALITY_THRESHOLDS.FAIR) {
            qualityLevel = 'FAIR';
        } else if (qualityScore >= QUALITY_THRESHOLDS.POOR) {
            qualityLevel = 'POOR';
        } else {
            qualityLevel = 'VERY_POOR';
        }

        console.log(
            `[QualityScore] Overall: ${qualityScore.toFixed(
                2
            )}% (${qualityLevel})`
        );

        const result = {
            userId,
            embeddingId,
            qualityScore: parseFloat(qualityScore.toFixed(2)),
            consistencyScore: consistencyMetrics.score,
            distinctivenessScore: distinctivenessMetrics.score,
            qualityLevel,
            details: {
                consistency: {
                    ...consistencyMetrics,
                },
                distinctiveness: {
                    ...distinctivenessMetrics,
                },
            },
            recommendation: getRecommendation(
                qualityLevel,
                consistencyMetrics,
                distinctivenessMetrics
            ),
        };

        return result;
    } catch (error) {
        console.error('[QualityScore] Error scoring embedding:', error);
        throw error;
    }
}

/**
 * Get recommendation based on quality metrics
 */
function getRecommendation(
    qualityLevel,
    consistencyMetrics,
    distinctivenessMetrics
) {
    if (qualityLevel === 'EXCELLENT') {
        return 'High quality embedding. Safe to use for authentication.';
    } else if (qualityLevel === 'GOOD') {
        return 'Good quality embedding. Suitable for authentication.';
    } else if (qualityLevel === 'FAIR') {
        if (consistencyMetrics.score < 60) {
            return 'Inconsistent with other embeddings. Consider re-capturing face photos.';
        } else if (distinctivenessMetrics.score < 60) {
            return 'Low distinctiveness. May cause false matches. Monitor closely.';
        }
        return 'Fair quality. Monitor for authentication issues.';
    } else if (qualityLevel === 'POOR') {
        return 'Poor quality. Recommend re-capturing face photos with better lighting and position.';
    } else {
        return 'Very poor quality. Should be deactivated and re-captured immediately.';
    }
}

/**
 * Score all embeddings for a user and update database
 *
 * @param {Integer} userId - User ID
 * @returns {Array} Array of quality scores for each embedding
 */
async function scoreUserEmbeddings(userId) {
    console.log(`[QualityScore] Scoring all embeddings for user ${userId}`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get all user embeddings
        const embeddingsResult = await client.query(
            'SELECT id, embedding FROM user_embeddings WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        if (embeddingsResult.rows.length === 0) {
            console.log('[QualityScore] No embeddings found for user');
            return [];
        }

        const scores = [];

        // Score each embedding
        for (const row of embeddingsResult.rows) {
            const score = await scoreEmbedding(userId, row.embedding, row.id);
            scores.push(score);

            // Update embedding with quality scores
            await client.query(
                `UPDATE user_embeddings 
                 SET quality_score = $1,
                     consistency_score = $2,
                     distinctiveness_score = $3,
                     is_active = $4,
                     updated_at = NOW()
                 WHERE id = $5`,
                [
                    score.qualityScore,
                    score.consistencyScore,
                    score.distinctivenessScore,
                    score.qualityScore >= QUALITY_THRESHOLDS.POOR, // Deactivate if too poor
                    row.id,
                ]
            );

            // Log to history
            await client.query(
                `INSERT INTO embedding_quality_history 
                 (user_id, embedding_id, quality_score, consistency_score, distinctiveness_score, calculation_method)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    userId,
                    row.id,
                    score.qualityScore,
                    score.consistencyScore,
                    score.distinctivenessScore,
                    'euclidean_v1',
                ]
            );
        }

        await client.query('COMMIT');

        console.log(
            `[QualityScore] Scored ${scores.length} embeddings for user ${userId}`
        );
        return scores;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[QualityScore] Error scoring user embeddings:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Get quality metrics for a user
 */
async function getUserQualityMetrics(userId) {
    const result = await pool.query(
        `SELECT 
            COUNT(*) as total_embeddings,
            COUNT(*) FILTER (WHERE is_active = true) as active_embeddings,
            AVG(quality_score) as avg_quality,
            MAX(quality_score) as max_quality,
            MIN(quality_score) as min_quality,
            AVG(consistency_score) as avg_consistency,
            AVG(distinctiveness_score) as avg_distinctiveness
         FROM user_embeddings
         WHERE user_id = $1`,
        [userId]
    );

    return result.rows[0];
}

module.exports = {
    scoreEmbedding,
    scoreUserEmbeddings,
    getUserQualityMetrics,
    calculateIntraClassConsistency,
    calculateInterClassSeparation,
    QUALITY_THRESHOLDS,
};
