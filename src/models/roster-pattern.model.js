const pool = require('../config/database');

class RosterPattern {
    /**
     * Validate pattern data structure
     * @param {Array<Array<number>>} patternData
     * @param {number} personilCount
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    static validatePatternData(patternData, personilCount) {
        const errors = [];

        // Check if pattern is array
        if (!Array.isArray(patternData)) {
            return { valid: false, errors: ['Pattern data must be an array'] };
        }

        // Check if pattern has correct number of rows
        if (patternData.length !== personilCount) {
            errors.push(
                `Pattern must have exactly ${personilCount} rows for ${personilCount} personil`
            );
        }

        // Validate each row
        patternData.forEach((row, rowIndex) => {
            // Check if row is array
            if (!Array.isArray(row)) {
                errors.push(`Row ${rowIndex + 1} must be an array`);
                return;
            }

            // Check if row has 7 days
            if (row.length !== 7) {
                errors.push(
                    `Row ${rowIndex + 1} must have exactly 7 days (found ${
                        row.length
                    })`
                );
            }

            // Check if all values are valid shift numbers (0-3)
            row.forEach((value, dayIndex) => {
                if (!Number.isInteger(value) || value < 0 || value > 3) {
                    errors.push(
                        `Row ${rowIndex + 1}, Day ${
                            dayIndex + 1
                        }: Invalid shift number ${value} (must be 0-3)`
                    );
                }
            });

            // Warning: Check if row has at least one OFF day (0)
            if (!row.includes(0)) {
                errors.push(
                    `Row ${
                        rowIndex + 1
                    }: No OFF day found (recommended to have at least one OFF day per week)`
                );
            }
        });

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Get pattern statistics
     * @param {Array<Array<number>>} patternData
     * @returns {Object} Pattern analytics
     */
    static getPatternStats(patternData) {
        const stats = {
            totalRows: patternData.length,
            offDayDistribution: [],
            shiftCoveragePerDay: Array(7).fill(0),
            workloadBalance: [],
        };

        patternData.forEach((row, rowIndex) => {
            const offDays = row.filter((day) => day === 0).length;
            stats.offDayDistribution.push({ row: rowIndex + 1, offDays });

            const workDays = row.length - offDays;
            stats.workloadBalance.push({ row: rowIndex + 1, workDays });

            // Count personnel on duty each day
            row.forEach((shift, dayIndex) => {
                if (shift !== 0) {
                    stats.shiftCoveragePerDay[dayIndex]++;
                }
            });
        });

        return stats;
    }

    /**
     * Create new roster pattern
     */
    static async create({
        name,
        description,
        personilCount,
        patternData,
        isDefault = false,
        createdBy,
    }) {
        // Validate pattern data
        const validation = this.validatePatternData(patternData, personilCount);
        if (!validation.valid) {
            throw new Error(
                `Pattern validation failed: ${validation.errors.join(', ')}`
            );
        }

        const query = `
      INSERT INTO roster_patterns (name, description, personil_count, pattern_data, is_default, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

        const values = [
            name,
            description,
            personilCount,
            JSON.stringify(patternData),
            isDefault,
            createdBy,
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Get all patterns with optional filters
     */
    static async findAll({ personilCount, isDefault, createdBy, search } = {}) {
        let query = 'SELECT * FROM roster_patterns WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (personilCount) {
            query += ` AND personil_count = $${paramIndex++}`;
            values.push(personilCount);
        }

        if (isDefault !== undefined) {
            query += ` AND is_default = $${paramIndex++}`;
            values.push(isDefault);
        }

        if (createdBy) {
            query += ` AND created_by = $${paramIndex++}`;
            values.push(createdBy);
        }

        if (search) {
            query += ` AND (name ILIKE $${paramIndex++} OR description ILIKE $${paramIndex++})`;
            values.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY is_default DESC, usage_count DESC, created_at DESC';

        const result = await pool.query(query, values);
        return result.rows;
    }

    /**
     * Get pattern by ID
     */
    static async findById(id) {
        const query = 'SELECT * FROM roster_patterns WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Update pattern
     */
    static async update(
        id,
        { name, description, personilCount, patternData, isDefault }
    ) {
        // Validate if pattern data is provided
        if (patternData && personilCount) {
            const validation = this.validatePatternData(
                patternData,
                personilCount
            );
            if (!validation.valid) {
                throw new Error(
                    `Pattern validation failed: ${validation.errors.join(', ')}`
                );
            }
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (name !== undefined) {
            updates.push(`name = $${paramIndex++}`);
            values.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            values.push(description);
        }
        if (personilCount !== undefined) {
            updates.push(`personil_count = $${paramIndex++}`);
            values.push(personilCount);
        }
        if (patternData !== undefined) {
            updates.push(`pattern_data = $${paramIndex++}`);
            values.push(JSON.stringify(patternData));
        }
        if (isDefault !== undefined) {
            updates.push(`is_default = $${paramIndex++}`);
            values.push(isDefault);
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        values.push(id);
        const query = `
      UPDATE roster_patterns 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

        const result = await pool.query(query, values);
        return result.rows[0];
    }

    /**
     * Delete pattern
     */
    static async delete(id) {
        const query = 'DELETE FROM roster_patterns WHERE id = $1 RETURNING *';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Increment usage count
     */
    static async incrementUsage(id) {
        const query = `
      UPDATE roster_patterns 
      SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Get default pattern for specific personil count
     */
    static async getDefaultPattern(personilCount) {
        const query = `
      SELECT * FROM roster_patterns 
      WHERE personil_count = $1 AND is_default = true
      LIMIT 1
    `;
        const result = await pool.query(query, [personilCount]);
        return result.rows[0];
    }
}

module.exports = RosterPattern;
