const RosterPattern = require('../models/roster-pattern.model');

class RosterPatternService {
    /**
     * Create new roster pattern
     */
    async createPattern(data) {
        try {
            const pattern = await RosterPattern.create(data);
            return {
                success: true,
                data: this.formatPattern(pattern),
            };
        } catch (error) {
            throw new Error(`Failed to create pattern: ${error.message}`);
        }
    }

    /**
     * Get all patterns with filters
     */
    async getAllPatterns(filters = {}) {
        try {
            const patterns = await RosterPattern.findAll(filters);
            return {
                success: true,
                data: patterns.map((p) => this.formatPattern(p)),
                count: patterns.length,
            };
        } catch (error) {
            throw new Error(`Failed to fetch patterns: ${error.message}`);
        }
    }

    /**
     * Get pattern by ID
     */
    async getPatternById(id) {
        try {
            const pattern = await RosterPattern.findById(id);

            if (!pattern) {
                throw new Error('Pattern not found');
            }

            return {
                success: true,
                data: this.formatPattern(pattern),
            };
        } catch (error) {
            throw new Error(`Failed to fetch pattern: ${error.message}`);
        }
    }

    /**
     * Update pattern
     */
    async updatePattern(id, data) {
        try {
            const pattern = await RosterPattern.update(id, data);

            if (!pattern) {
                throw new Error('Pattern not found');
            }

            return {
                success: true,
                data: this.formatPattern(pattern),
            };
        } catch (error) {
            throw new Error(`Failed to update pattern: ${error.message}`);
        }
    }

    /**
     * Delete pattern
     */
    async deletePattern(id) {
        try {
            const pattern = await RosterPattern.delete(id);

            if (!pattern) {
                throw new Error('Pattern not found');
            }

            return {
                success: true,
                message: 'Pattern deleted successfully',
            };
        } catch (error) {
            throw new Error(`Failed to delete pattern: ${error.message}`);
        }
    }

    /**
     * Validate pattern data
     */
    validatePattern(patternData, personilCount) {
        return RosterPattern.validatePatternData(patternData, personilCount);
    }

    /**
     * Get pattern statistics
     */
    getPatternStatistics(patternData) {
        return RosterPattern.getPatternStats(patternData);
    }

    /**
     * Record pattern usage (called when pattern is used in auto-generate)
     */
    async recordUsage(id) {
        try {
            await RosterPattern.incrementUsage(id);
            return { success: true };
        } catch (error) {
            // Don't throw error, just log it
            console.error('Failed to record pattern usage:', error.message);
            return { success: false };
        }
    }

    /**
     * Get default pattern for personil count
     */
    async getDefaultPattern(personilCount) {
        try {
            const pattern = await RosterPattern.getDefaultPattern(
                personilCount
            );

            if (!pattern) {
                return {
                    success: false,
                    message: `No default pattern found for ${personilCount} personil`,
                };
            }

            return {
                success: true,
                data: this.formatPattern(pattern),
            };
        } catch (error) {
            throw new Error(
                `Failed to fetch default pattern: ${error.message}`
            );
        }
    }

    /**
     * Format pattern for response (parse JSON pattern_data)
     */
    formatPattern(pattern) {
        return {
            ...pattern,
            pattern_data:
                typeof pattern.pattern_data === 'string'
                    ? JSON.parse(pattern.pattern_data)
                    : pattern.pattern_data,
            stats: RosterPattern.getPatternStats(
                typeof pattern.pattern_data === 'string'
                    ? JSON.parse(pattern.pattern_data)
                    : pattern.pattern_data
            ),
        };
    }
}

module.exports = new RosterPatternService();
