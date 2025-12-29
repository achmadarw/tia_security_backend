const express = require('express');
const router = express.Router();
const rosterPatternService = require('../services/roster-pattern.service');
const { authMiddleware } = require('../middleware/auth.middleware');

// Apply authentication to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/roster-patterns
 * @desc    Get all roster patterns with optional filters
 * @access  Private (authenticated users)
 * @query   personil_count - Filter by personil count
 * @query   is_default - Filter by default status (true/false)
 * @query   search - Search in name and description
 */
router.get('/', async (req, res) => {
    try {
        const filters = {
            personilCount: req.query.personil_count
                ? parseInt(req.query.personil_count)
                : undefined,
            isDefault:
                req.query.is_default === 'true'
                    ? true
                    : req.query.is_default === 'false'
                    ? false
                    : undefined,
            search: req.query.search,
        };

        const result = await rosterPatternService.getAllPatterns(filters);

        res.json({
            success: true,
            data: result.data,
            count: result.count,
        });
    } catch (error) {
        console.error('Error fetching patterns:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch patterns',
        });
    }
});

/**
 * @route   GET /api/roster-patterns/default/:personil_count
 * @desc    Get default pattern for specific personil count
 * @access  Private
 */
router.get('/default/:personil_count', async (req, res) => {
    try {
        const personilCount = parseInt(req.params.personil_count);

        if (isNaN(personilCount) || personilCount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid personil count',
            });
        }

        const result = await rosterPatternService.getDefaultPattern(
            personilCount
        );

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (error) {
        console.error('Error fetching default pattern:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch default pattern',
        });
    }
});

/**
 * @route   GET /api/roster-patterns/:id
 * @desc    Get pattern by ID
 * @access  Private
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pattern ID',
            });
        }

        const result = await rosterPatternService.getPatternById(id);
        res.json(result);
    } catch (error) {
        console.error('Error fetching pattern:', error);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message,
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to fetch pattern',
        });
    }
});

/**
 * @route   POST /api/roster-patterns
 * @desc    Create new roster pattern
 * @access  Private (admin only)
 * @body    name, description, personil_count, pattern_data, is_default
 */
router.post('/', async (req, res) => {
    try {
        // Only admins can create patterns
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can create patterns',
            });
        }

        const { name, description, personil_count, pattern_data, is_default } =
            req.body;

        // Validation
        if (!name || !personil_count || !pattern_data) {
            return res.status(400).json({
                success: false,
                message: 'Name, personil_count, and pattern_data are required',
            });
        }

        // Validate pattern structure
        const validation = rosterPatternService.validatePattern(
            pattern_data,
            personil_count
        );
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: 'Pattern validation failed',
                errors: validation.errors,
            });
        }

        const result = await rosterPatternService.createPattern({
            name,
            description,
            personilCount: personil_count,
            patternData: pattern_data,
            isDefault: is_default || false,
            createdBy: req.user.id,
        });

        res.status(201).json(result);
    } catch (error) {
        console.error('Error creating pattern:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create pattern',
        });
    }
});

/**
 * @route   PUT /api/roster-patterns/:id
 * @desc    Update roster pattern
 * @access  Private (admin only)
 */
router.put('/:id', async (req, res) => {
    try {
        // Only admins can update patterns
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can update patterns',
            });
        }

        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pattern ID',
            });
        }

        const { name, description, personil_count, pattern_data, is_default } =
            req.body;

        // Validate pattern structure if provided
        if (pattern_data && personil_count) {
            const validation = rosterPatternService.validatePattern(
                pattern_data,
                personil_count
            );
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    message: 'Pattern validation failed',
                    errors: validation.errors,
                });
            }
        }

        const result = await rosterPatternService.updatePattern(id, {
            name,
            description,
            personilCount: personil_count,
            patternData: pattern_data,
            isDefault: is_default,
        });

        res.json(result);
    } catch (error) {
        console.error('Error updating pattern:', error);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message,
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update pattern',
        });
    }
});

/**
 * @route   DELETE /api/roster-patterns/:id
 * @desc    Delete roster pattern
 * @access  Private (admin only)
 */
router.delete('/:id', async (req, res) => {
    try {
        // Only admins can delete patterns
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can delete patterns',
            });
        }

        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pattern ID',
            });
        }

        const result = await rosterPatternService.deletePattern(id);
        res.json(result);
    } catch (error) {
        console.error('Error deleting pattern:', error);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message,
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete pattern',
        });
    }
});

/**
 * @route   POST /api/roster-patterns/:id/use
 * @desc    Record pattern usage (increment usage count)
 * @access  Private
 */
router.post('/:id/use', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pattern ID',
            });
        }

        await rosterPatternService.recordUsage(id);

        res.json({
            success: true,
            message: 'Pattern usage recorded',
        });
    } catch (error) {
        console.error('Error recording pattern usage:', error);
        // Don't return error, just log it
        res.json({
            success: true,
            message: 'Pattern usage recorded (with warning)',
        });
    }
});

/**
 * @route   POST /api/roster-patterns/validate
 * @desc    Validate pattern data without saving
 * @access  Private
 */
router.post('/validate', async (req, res) => {
    try {
        const { pattern_data, personil_count } = req.body;

        if (!pattern_data || !personil_count) {
            return res.status(400).json({
                success: false,
                message: 'pattern_data and personil_count are required',
            });
        }

        const validation = rosterPatternService.validatePattern(
            pattern_data,
            personil_count
        );
        const stats = rosterPatternService.getPatternStatistics(pattern_data);

        res.json({
            success: true,
            valid: validation.valid,
            errors: validation.errors,
            stats,
        });
    } catch (error) {
        console.error('Error validating pattern:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to validate pattern',
        });
    }
});

module.exports = router;
