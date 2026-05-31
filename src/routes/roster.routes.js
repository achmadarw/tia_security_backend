const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authenticateToken,
    requireRole,
} = require('../middleware/auth.middleware');
const pdfService = require('../services/pdf.service');

const AUTO_ASSIGN_5_PERSON_PATTERN = [
    [2, 0, 1, 1, 3, 3, 2],
    [3, 2, 0, 1, 2, 3, 3],
    [3, 3, 2, 2, 0, 1, 3],
    [2, 3, 3, 3, 2, 0, 1],
    [1, 2, 3, 3, 3, 2, 0],
];

const resolveShiftId = (shifts, shiftNumber) => {
    const shift = shifts.find(
        (item) =>
            item.code === String(shiftNumber) ||
            item.id === shiftNumber ||
            item.name.toLowerCase().includes(`shift ${shiftNumber}`)
    );

    return shift ? shift.id : null;
};

const formatDate = (year, monthNum, day) =>
    `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
    )}`;

/**
 * POST /api/roster/generate
 * Auto-generate monthly roster based on pattern assignments
 *
 * Body: {
 *   month: "2025-12-01",  // First day of month
 *   force: false          // Optional: overwrite existing assignments
 * }
 */
router.post(
    '/generate',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        const client = await pool.connect();

        try {
            const { month, force = false } = req.body;

            if (!month) {
                return res.status(400).json({
                    success: false,
                    error: 'Month is required (format: YYYY-MM-DD)',
                });
            }

            await client.query('BEGIN');

            // Parse month
            const monthDate = new Date(month);
            const year = monthDate.getFullYear();
            const monthNum = monthDate.getMonth() + 1;
            const daysInMonth = new Date(year, monthNum, 0).getDate();

            console.log(
                `Generating roster for ${year}-${monthNum} (${daysInMonth} days)`
            );

            // Get all assignments for this month
            const assignmentsResult = await client.query(
                `SELECT 
                ra.id as assignment_id,
                ra.user_id,
                ra.pattern_id,
                u.name as user_name,
                p.name as pattern_name,
                p.pattern_data
             FROM roster_assignments ra
             JOIN users u ON ra.user_id = u.id
             JOIN patterns p ON ra.pattern_id = p.id
             WHERE DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', $1::date)
             AND u.status = 'active'
             ORDER BY u.name ASC`,
                [month]
            );

            const assignments = assignmentsResult.rows;

            if (assignments.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'No pattern assignments found for this month. Please assign patterns first.',
                });
            }

            console.log(`Found ${assignments.length} pattern assignments`);

            // Get all active shifts for validation
            const shiftsResult = await client.query(
                'SELECT id, name FROM shifts WHERE is_active = true'
            );
            const shifts = shiftsResult.rows;

            if (shifts.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'No active shifts found. Please create shifts first.',
                });
            }

            // Create a map of shift IDs for quick lookup
            const shiftIdMap = {};
            shifts.forEach((shift) => {
                shiftIdMap[shift.id] = shift;
            });

            console.log(
                'Available shifts:',
                shifts.map((s) => `${s.id}: ${s.name}`).join(', ')
            );

            // Delete existing assignments for this month if force=true
            if (force) {
                const deleteResult = await client.query(
                    `DELETE FROM shift_assignments 
                 WHERE DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $1::date)`,
                    [month]
                );
                console.log(
                    `Deleted ${deleteResult.rowCount} existing shift assignments`
                );
            }

            // Generate shift assignments
            const shiftAssignments = [];
            let createdCount = 0;
            let skippedCount = 0;
            let errors = [];

            for (const assignment of assignments) {
                const { user_id, user_name, pattern_data } = assignment;
                const patternLength = pattern_data.length; // Should be 7

                console.log(
                    `Processing user: ${user_name}, pattern: ${pattern_data}`
                );

                // Delete existing shift assignments for this user in this month
                // This ensures pattern changes are properly reflected (e.g., old shifts that are now OFF get removed)
                const deleteUserResult = await client.query(
                    `DELETE FROM shift_assignments 
                     WHERE user_id = $1 
                     AND DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $2::date)`,
                    [user_id, month]
                );
                console.log(
                    `Deleted ${deleteUserResult.rowCount} existing assignments for user ${user_name}`
                );

                for (let day = 1; day <= daysInMonth; day++) {
                    if (day === 31) {
                        console.log(
                            `🔍 Processing day 31 for user ${user_name}`
                        );
                    }
                    // Calculate position in 7-day pattern (cyclic)
                    const patternIndex = (day - 1) % patternLength;
                    const shiftId = pattern_data[patternIndex];

                    // Skip OFF days (shift_id = 0) - don't insert to database
                    // Frontend will detect OFF from missing data + pattern
                    if (shiftId === 0) continue;

                    // Validate shift exists
                    const shift = shiftIdMap[shiftId];
                    if (!shift) {
                        console.warn(
                            `User ${user_name}: Shift ID ${shiftId} not found in active shifts`
                        );
                        skippedCount++;
                        errors.push({
                            user_id,
                            user_name,
                            date: `${year}-${String(monthNum).padStart(
                                2,
                                '0'
                            )}-${String(day).padStart(2, '0')}`,
                            error: `Shift ID ${shiftId} not found`,
                        });
                        continue;
                    }

                    // Format date manually to avoid timezone issues
                    const dateString = `${year}-${String(monthNum).padStart(
                        2,
                        '0'
                    )}-${String(day).padStart(2, '0')}`;

                    if (day === 31) {
                        console.log(
                            `🔍 Day 31: date=${dateString}, shiftId=${shiftId}, shift=${
                                shift ? shift.name : 'NOT FOUND'
                            }`
                        );
                    }

                    try {
                        // Insert new assignment (no need to check existing since we deleted all for this user)
                        const insertResult = await client.query(
                            `INSERT INTO shift_assignments 
                             (user_id, shift_id, assignment_date, is_replacement, created_by, created_at)
                             VALUES ($1, $2, $3, false, 1, NOW())
                             RETURNING id`,
                            [user_id, shiftId, dateString]
                        );

                        if (insertResult.rowCount > 0) {
                            createdCount++;
                            shiftAssignments.push({
                                user_id,
                                user_name,
                                shift_id: shiftId,
                                shift_name: shift.name,
                                date: dateString,
                            });
                        } else {
                            skippedCount++;
                        }
                    } catch (err) {
                        console.error(
                            `Failed to insert shift for user ${user_name} on ${dateString}:`,
                            err.message
                        );
                        skippedCount++;
                        errors.push({
                            user_id,
                            user_name,
                            date: dateString,
                            error: err.message,
                        });
                    }
                }
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Roster generated successfully',
                data: {
                    month: `${year}-${monthNum}`,
                    days: daysInMonth,
                    users: assignments.length,
                    created: createdCount,
                    skipped: skippedCount,
                    errors: errors.length > 0 ? errors : undefined,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error generating roster:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to generate roster',
                details: error.message,
            });
        } finally {
            client.release();
        }
    }
);

/**
 * POST /api/roster/auto-assign
 * Generate a 5-person monthly roster using the agreed 7-day rule:
 * 1 OFF per 7 days, pre-OFF = shift 2, post-OFF = shift 1,
 * exactly 2 people on shift 3 daily, remaining slots balanced on shift 1/2.
 */
router.post(
    '/auto-assign',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        const client = await pool.connect();

        try {
            const { month } = req.body;

            if (!month) {
                return res.status(400).json({
                    success: false,
                    error: 'Month is required (format: YYYY-MM-DD)',
                });
            }

            const monthDate = new Date(month);
            const year = monthDate.getFullYear();
            const monthNum = monthDate.getMonth() + 1;
            const daysInMonth = new Date(year, monthNum, 0).getDate();
            const normalizedMonth = formatDate(year, monthNum, 1);

            await client.query('BEGIN');

            const usersResult = await client.query(`
                SELECT id, name
                FROM users
                WHERE role = 'security' AND status = 'active'
                ORDER BY created_at DESC
            `);

            const users = usersResult.rows;

            if (users.length !== 5) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: `Auto Assign rule requires exactly 5 active security personnel. Found ${users.length}.`,
                });
            }

            const shiftsResult = await client.query(`
                SELECT id, name, code
                FROM shifts
                WHERE is_active = true
                ORDER BY start_time
            `);

            const shifts = shiftsResult.rows;
            const shiftMap = {
                1: resolveShiftId(shifts, 1),
                2: resolveShiftId(shifts, 2),
                3: resolveShiftId(shifts, 3),
            };

            const missingShifts = Object.entries(shiftMap)
                .filter(([, shiftId]) => !shiftId)
                .map(([shiftNumber]) => shiftNumber);

            if (missingShifts.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: `Auto Assign requires active shifts 1, 2, and 3. Missing: ${missingShifts.join(
                        ', '
                    )}`,
                });
            }

            const patternRows = AUTO_ASSIGN_5_PERSON_PATTERN.map((row) =>
                row.map((shiftNumber) =>
                    shiftNumber === 0 ? 0 : shiftMap[shiftNumber]
                )
            );

            const patternIds = [];

            for (let index = 0; index < patternRows.length; index++) {
                const patternData = patternRows[index];
                const patternName = `Auto 5P Rule - Pattern ${index + 1}`;

                const existingPattern = await client.query(
                    'SELECT id FROM patterns WHERE name = $1 LIMIT 1',
                    [patternName]
                );

                const patternResult =
                    existingPattern.rows.length > 0
                        ? await client.query(
                              `UPDATE patterns
                               SET description = $1,
                                   pattern_data = $2,
                                   is_active = true,
                                   updated_at = NOW()
                               WHERE id = $3
                               RETURNING id`,
                              [
                                  'Auto-generated 5-person pattern: 1 OFF per 7 days, pre-OFF shift 2, post-OFF shift 1, 2 people on shift 3 daily.',
                                  patternData,
                                  existingPattern.rows[0].id,
                              ]
                          )
                        : await client.query(
                              `INSERT INTO patterns (name, description, pattern_data, is_active, created_by)
                               VALUES ($1, $2, $3, true, $4)
                               RETURNING id`,
                              [
                                  patternName,
                                  'Auto-generated 5-person pattern: 1 OFF per 7 days, pre-OFF shift 2, post-OFF shift 1, 2 people on shift 3 daily.',
                                  patternData,
                                  req.user.userId,
                              ]
                          );

                patternIds.push(patternResult.rows[0].id);
            }

            const deleteShiftsResult = await client.query(
                `DELETE FROM shift_assignments
                 WHERE DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $1::date)`,
                [normalizedMonth]
            );

            const rosterAssignments = [];
            for (let index = 0; index < users.length; index++) {
                const assignmentResult = await client.query(
                    `INSERT INTO roster_assignments (user_id, pattern_id, assignment_month, assigned_by)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, assignment_month)
                     DO UPDATE SET pattern_id = EXCLUDED.pattern_id, assigned_by = EXCLUDED.assigned_by
                     RETURNING *`,
                    [
                        users[index].id,
                        patternIds[index],
                        normalizedMonth,
                        req.user.userId,
                    ]
                );

                rosterAssignments.push({
                    ...assignmentResult.rows[0],
                    user_name: users[index].name,
                });
            }

            let createdCount = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(year, monthNum, day);
                const patternIndex = (day - 1) % 7;

                for (let userIndex = 0; userIndex < users.length; userIndex++) {
                    const shiftId = patternRows[userIndex][patternIndex];

                    if (shiftId === 0) continue;

                    await client.query(
                        `INSERT INTO shift_assignments
                         (user_id, shift_id, assignment_date, is_replacement, created_by, created_at, updated_at)
                         VALUES ($1, $2, $3, false, $4, NOW(), NOW())`,
                        [
                            users[userIndex].id,
                            shiftId,
                            dateString,
                            req.user.userId,
                        ]
                    );
                    createdCount++;
                }
            }

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Auto roster generated successfully',
                data: {
                    month: normalizedMonth,
                    days: daysInMonth,
                    users: users.length,
                    patterns: patternIds.length,
                    deleted: deleteShiftsResult.rowCount,
                    created: createdCount,
                    assignments: rosterAssignments,
                    rule: {
                        off_per_7_days: 1,
                        before_off_shift: 2,
                        after_off_shift: 1,
                        shift_3_daily_personnel: 2,
                    },
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error auto-assigning roster:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to auto-assign roster',
                details: error.message,
            });
        } finally {
            client.release();
        }
    }
);

/**
 * GET /api/roster/shift-assignments
 * Get shift assignments for a specific month
 * Query params: ?month=2025-12-01&user_id=5
 */
router.get('/shift-assignments', authenticateToken, async (req, res) => {
    try {
        const { month, user_id } = req.query;

        if (!month) {
            return res.status(400).json({
                success: false,
                error: 'Month is required (format: YYYY-MM-DD)',
            });
        }

        let query = `
            SELECT 
                sa.id,
                sa.user_id,
                sa.shift_id,
                TO_CHAR(sa.assignment_date, 'YYYY-MM-DD') as assignment_date,
                sa.is_replacement,
                sa.replaced_user_id,
                sa.notes,
                u.name as user_name,
                s.name as shift_name,
                s.code as shift_code,
                s.color as shift_color,
                ra.pattern_id,
                p.pattern_data
            FROM shift_assignments sa
            JOIN users u ON sa.user_id = u.id
            JOIN shifts s ON sa.shift_id = s.id
            LEFT JOIN roster_assignments ra ON ra.user_id = sa.user_id 
                AND DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', sa.assignment_date)
            LEFT JOIN patterns p ON ra.pattern_id = p.id
            WHERE DATE_TRUNC('month', sa.assignment_date) = DATE_TRUNC('month', $1::date)
        `;

        const params = [month];

        if (user_id) {
            params.push(user_id);
            query += ` AND sa.user_id = $${params.length}`;
        }

        query += ' ORDER BY sa.assignment_date, u.name';

        const result = await pool.query(query, params);

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length,
        });
    } catch (error) {
        console.error('Get shift assignments error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get shift assignments',
            details: error.message,
        });
    }
});

/**
 * POST /api/roster/export-pdf
 * Generate PDF from roster data using Puppeteer
 *
 * Body: {
 *   month: "December 2025",
 *   daysInMonth: 31,
 *   dayNames: ["S", "M", "T", ...],
 *   users: [{ name: "John", shifts: [...] }]
 * }
 */
router.post('/export-pdf', async (req, res) => {
    try {
        const { month, daysInMonth, dayNames, users } = req.body;

        console.log('📄 PDF Export Request:', {
            month,
            daysInMonth,
            userCount: users?.length,
        });

        // Log first user's data for debugging
        if (users && users.length > 0) {
            console.log('Sample user data:', {
                name: users[0].name,
                shiftsCount: users[0].shifts?.length,
                firstShifts: users[0].shifts?.slice(0, 5),
            });
        }

        // Validate request data
        const validation = pdfService.validateRosterData(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: 'Invalid roster data',
                details: validation.errors,
            });
        }

        console.log(`Generating PDF for ${month} with ${users.length} users`);

        // Fetch active shifts for schedule info (including color)
        const shiftsResult = await pool.query(`
            SELECT id, name, code, start_time, end_time, description, color
            FROM shifts
            WHERE is_active = true
            ORDER BY start_time
        `);

        // Generate PDF
        const pdfBuffer = await pdfService.generateRosterPDF({
            month,
            daysInMonth,
            dayNames,
            users,
            shifts: shiftsResult.rows,
        });

        console.log(`PDF Buffer generated: ${pdfBuffer.length} bytes`);

        // Verify buffer is valid
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('Generated PDF buffer is empty');
        }

        // Set response headers for PDF download
        const fileName = `Roster-${month.replace(/\s+/g, '-')}.pdf`;

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
            'Content-Length': pdfBuffer.length,
        });

        // Send PDF buffer
        res.end(pdfBuffer);

        console.log(`✅ PDF sent successfully: ${fileName}`);
    } catch (error) {
        console.error('❌ PDF Export Error:', error);

        // Don't send JSON if headers already sent
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Failed to generate PDF',
                details: error.message,
            });
        }
    }
});

module.exports = router;
