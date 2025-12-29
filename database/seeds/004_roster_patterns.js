/**
 * Seed: Default Roster Patterns
 * Source: Proven patterns from Juni 2025 (4 personil) and Oktober-Desember 2025 (5 personil)
 */

const { Pool } = require('pg');

async function seed(pool) {
    // Pattern for 4 personil (from Juni 2025 reference)
    const pattern4Personil = {
        name: 'Pattern 4 Personil - Balanced',
        description:
            'Proven pattern from Juni 2025 roster. Balanced OFF days with 7-day rotation cycle.',
        personil_count: 4,
        pattern_data: [
            [1, 3, 2, 3, 2, 2, 0], // Row 1: OFF day 7, 14, 21, 28
            [0, 1, 3, 2, 3, 3, 2], // Row 2: OFF day 1, 8, 15, 22, 29
            [2, 0, 1, 3, 3, 3, 3], // Row 3: OFF day 2, 9, 16, 23, 30
            [3, 2, 0, 1, 1, 1, 1], // Row 4: OFF day 3, 10, 17, 24
        ],
        is_default: true,
    };

    // Pattern for 5 personil (from Oktober-Desember 2025 reference)
    const pattern5Personil = {
        name: 'Pattern 5 Personil - Balanced',
        description:
            'Proven pattern from Oktober-Desember 2025 roster. Optimized for 5 personnel with staggered OFF days.',
        personil_count: 5,
        pattern_data: [
            [1, 3, 3, 3, 2, 2, 0], // Row 1: OFF day 7, 14, 21, 28
            [3, 3, 2, 2, 1, 0, 1], // Row 2: OFF day 6, 13, 20, 27
            [3, 2, 3, 2, 0, 1, 3], // Row 3: OFF day 5, 12, 19, 26
            [2, 0, 1, 1, 3, 3, 3], // Row 4: OFF day 2, 9, 16, 23, 30
            [0, 1, 2, 3, 3, 3, 2], // Row 5: OFF day 1, 8, 15, 22, 29
        ],
        is_default: true,
    };

    try {
        // Check if patterns already exist
        const existingCheck = await pool.query(
            'SELECT id FROM roster_patterns WHERE name IN ($1, $2)',
            [pattern4Personil.name, pattern5Personil.name]
        );

        if (existingCheck.rows.length > 0) {
            console.log('⚠ Default patterns already exist, skipping seed');
            return;
        }

        // Insert patterns
        await pool.query(
            `INSERT INTO roster_patterns (name, description, personil_count, pattern_data, is_default)
       VALUES ($1, $2, $3, $4, $5)`,
            [
                pattern4Personil.name,
                pattern4Personil.description,
                pattern4Personil.personil_count,
                JSON.stringify(pattern4Personil.pattern_data),
                pattern4Personil.is_default,
            ]
        );

        await pool.query(
            `INSERT INTO roster_patterns (name, description, personil_count, pattern_data, is_default)
       VALUES ($1, $2, $3, $4, $5)`,
            [
                pattern5Personil.name,
                pattern5Personil.description,
                pattern5Personil.personil_count,
                JSON.stringify(pattern5Personil.pattern_data),
                pattern5Personil.is_default,
            ]
        );

        console.log('✓ Seeded default roster patterns (4 and 5 personil)');
    } catch (error) {
        console.error('✗ Error seeding roster patterns:', error.message);
        throw error;
    }
}

module.exports = { seed };
