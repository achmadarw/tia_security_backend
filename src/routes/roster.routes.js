const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
    authenticateToken,
    requireRole,
} = require('../middleware/auth.middleware');
const pdfService = require('../services/pdf.service');

const AUTO_ASSIGN_TEMPLATES = {
    '5p-3s': {
        key: '5p-3s',
        name: '5 Personil - 3 Shift',
        patternLength: 7,
        activeShifts: [1, 2, 3],
        beforeOffShift: 2,
        afterOffShift: 1,
        shift1DailyPersonnel: 1,
        shift3DailyPersonnel: 2,
        dailyOffPersonnel: null,
        minOffDaysPerPatternRow: 1,
        maxOffDaysPerPatternRow: 1,
        preventShift3ToShift1: true,
    },
    '5p-2s': {
        key: '5p-2s',
        name: '5 Personil - 2 Shift',
        patternLength: 5,
        activeShifts: [1, 2],
        beforeOffShift: null,
        afterOffShift: null,
        shift1DailyPersonnel: 2,
        shift3DailyPersonnel: null,
        dailyOffPersonnel: 1,
        minOffDaysPerPatternRow: 1,
        maxOffDaysPerPatternRow: 1,
        preventShift3ToShift1: false,
    },
};

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

const shuffleArray = (items) => {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [
            shuffled[swapIndex],
            shuffled[index],
        ];
    }

    return shuffled;
};

const toShiftNumberPattern = (pattern, shiftNumberById) =>
    pattern.map((shiftId) =>
        shiftId === 0 ? 0 : shiftNumberById[Number(shiftId)] || null
    );

const createAutoAssignError = (message, statusCode = 400) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const createAutoAssignSnapshot = async (client, normalizedMonth, userId) => {
    const rosterResult = await client.query(
        `SELECT user_id,
                pattern_id,
                TO_CHAR(assignment_month, 'YYYY-MM-DD') as assignment_month,
                assigned_by,
                assigned_at,
                notes
         FROM roster_assignments
         WHERE DATE_TRUNC('month', assignment_month) = DATE_TRUNC('month', $1::date)
         ORDER BY user_id`,
        [normalizedMonth]
    );

    const shiftResult = await client.query(
        `SELECT user_id,
                shift_id,
                TO_CHAR(assignment_date, 'YYYY-MM-DD') as assignment_date,
                is_replacement,
                replaced_user_id,
                notes,
                created_by,
                created_at,
                updated_at
         FROM shift_assignments
         WHERE DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $1::date)
         ORDER BY assignment_date, user_id, shift_id`,
        [normalizedMonth]
    );

    const snapshotResult = await client.query(
        `INSERT INTO roster_auto_assign_snapshots
         (assignment_month, roster_assignments, shift_assignments, created_by)
         VALUES ($1, $2::jsonb, $3::jsonb, $4)
         RETURNING id`,
        [
            normalizedMonth,
            JSON.stringify(rosterResult.rows),
            JSON.stringify(shiftResult.rows),
            userId,
        ]
    );

    return {
        id: snapshotResult.rows[0].id,
        rosterAssignments: rosterResult.rowCount,
        shiftAssignments: shiftResult.rowCount,
    };
};

const hasShift3ToShift1Transition = (row) =>
    row.some(
        (shiftNumber, dayIndex) =>
            shiftNumber === 3 && row[(dayIndex + 1) % row.length] === 1
    );

const validateAutoPatternRows = (rows, template = AUTO_ASSIGN_TEMPLATES['5p-3s']) => {
    if (!Array.isArray(rows) || rows.length !== 5) {
        return {
            isValid: false,
            error: 'Pattern must contain exactly 5 personnel rows',
        };
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];

        if (!Array.isArray(row) || row.length !== template.patternLength) {
            return {
                isValid: false,
                error: `Pattern row ${rowIndex + 1} must contain ${template.patternLength} days`,
            };
        }

        const allowedValues = [0, ...template.activeShifts];

        if (!row.every((value) => allowedValues.includes(value))) {
            return {
                isValid: false,
                error: `Pattern row ${rowIndex + 1} contains invalid shift values`,
            };
        }

        const offDays = row
            .map((value, dayIndex) => (value === 0 ? dayIndex : null))
            .filter((dayIndex) => dayIndex !== null);

        if (
            offDays.length < template.minOffDaysPerPatternRow ||
            offDays.length > template.maxOffDaysPerPatternRow
        ) {
            const offDayError =
                template.minOffDaysPerPatternRow ===
                template.maxOffDaysPerPatternRow
                    ? `Pattern row ${rowIndex + 1} must have exactly ${template.minOffDaysPerPatternRow} OFF day`
                    : `Pattern row ${rowIndex + 1} must have between ${template.minOffDaysPerPatternRow} and ${template.maxOffDaysPerPatternRow} OFF days`;

            return {
                isValid: false,
                error: offDayError,
            };
        }

        for (const offDay of offDays) {
            const previousDay =
                (offDay + template.patternLength - 1) %
                template.patternLength;
            const nextDay = (offDay + 1) % template.patternLength;

            if (
                template.beforeOffShift !== null &&
                row[previousDay] !== template.beforeOffShift
            ) {
                return {
                    isValid: false,
                    error: `Pattern row ${rowIndex + 1} must have shift ${template.beforeOffShift} before OFF`,
                };
            }

            if (
                template.afterOffShift !== null &&
                row[nextDay] !== template.afterOffShift
            ) {
                return {
                    isValid: false,
                    error: `Pattern row ${rowIndex + 1} must have shift ${template.afterOffShift} after OFF`,
                };
            }
        }

        if (template.preventShift3ToShift1 && hasShift3ToShift1Transition(row)) {
            return {
                isValid: false,
                error: `Pattern row ${rowIndex + 1} must not have shift 3 followed by shift 1`,
            };
        }
    }

    for (let dayIndex = 0; dayIndex < template.patternLength; dayIndex++) {
        const offCount = rows.filter((row) => row[dayIndex] === 0).length;
        const shift1Count = rows.filter((row) => row[dayIndex] === 1).length;
        const shift3Count = rows.filter((row) => row[dayIndex] === 3).length;

        if (
            template.dailyOffPersonnel !== null &&
            offCount !== template.dailyOffPersonnel
        ) {
            return {
                isValid: false,
                error: `Day ${dayIndex + 1} must have exactly ${template.dailyOffPersonnel} personnel OFF`,
            };
        }

        if (shift1Count !== template.shift1DailyPersonnel) {
            return {
                isValid: false,
                error: `Day ${dayIndex + 1} must have exactly ${template.shift1DailyPersonnel} personnel on shift 1`,
            };
        }

        if (
            template.shift3DailyPersonnel !== null &&
            shift3Count !== template.shift3DailyPersonnel
        ) {
            return {
                isValid: false,
                error: `Day ${dayIndex + 1} must have exactly ${template.shift3DailyPersonnel} personnel on shift 3`,
            };
        }
    }

    return { isValid: true };
};

const getPreviousMonthInfo = (year, monthNum) => {
    const previousMonthDate = new Date(year, monthNum - 2, 1);
    const previousYear = previousMonthDate.getFullYear();
    const previousMonthNum = previousMonthDate.getMonth() + 1;

    return {
        previousMonth: formatDate(previousYear, previousMonthNum, 1),
        previousDays: new Date(previousYear, previousMonthNum, 0).getDate(),
    };
};

const getPreviousPatternRows = async ({
    client,
    users,
    previousMonth,
    shiftNumberById,
    template,
}) => {
    const userIds = users.map((user) => user.id);
    const previousResult = await client.query(
        `SELECT ra.user_id, p.pattern_data
         FROM roster_assignments ra
         JOIN patterns p ON p.id = ra.pattern_id
         WHERE DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', $1::date)
         AND ra.user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const previousByUser = new Map(
        previousResult.rows.map((row) => [row.user_id, row.pattern_data])
    );

    if (previousByUser.size !== users.length) {
        return {
            rows: null,
            error: `Previous month ${previousMonth} must have assignments for all 5 active security personnel`,
        };
    }

    const rows = [];

    for (const user of users) {
        const previousPattern = previousByUser.get(user.id);
        const shiftNumberPattern = previousPattern
            ? toShiftNumberPattern(previousPattern, shiftNumberById)
            : null;

        if (!shiftNumberPattern || shiftNumberPattern.includes(null)) {
            return {
                rows: null,
                error: `Previous month pattern for ${user.name} contains shifts that cannot be mapped to template shifts ${template.activeShifts.join(', ')}`,
            };
        }

        rows.push(shiftNumberPattern);
    }

    const validation = validateAutoPatternRows(rows, template);

    if (!validation.isValid) {
        return {
            rows: null,
            error: `Previous month ${previousMonth} has invalid pattern: ${validation.error}`,
        };
    }

    return { rows };
};

const getPreviousRawPatternRows = async ({
    client,
    users,
    previousMonth,
    shiftNumberById,
    template,
}) => {
    const userIds = users.map((user) => user.id);
    const previousResult = await client.query(
        `SELECT ra.user_id, p.pattern_data
         FROM roster_assignments ra
         JOIN patterns p ON p.id = ra.pattern_id
         WHERE DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', $1::date)
         AND ra.user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const previousByUser = new Map(
        previousResult.rows.map((row) => [row.user_id, row.pattern_data])
    );

    if (previousByUser.size !== users.length) {
        return {
            rows: null,
            error: `Previous month ${previousMonth} must have assignments for all 5 active security personnel`,
        };
    }

    const rows = [];

    for (const user of users) {
        const previousPattern = previousByUser.get(user.id);
        const shiftNumberPattern = previousPattern
            ? toShiftNumberPattern(previousPattern, shiftNumberById)
            : null;

        if (!shiftNumberPattern || shiftNumberPattern.includes(null)) {
            return {
                rows: null,
                error: `Previous month pattern for ${user.name} contains shifts that cannot be mapped to template shifts ${template.activeShifts.join(', ')}`,
            };
        }

        rows.push(shiftNumberPattern);
    }

    return { rows };
};

const arePatternsEqual = (firstPattern, secondPattern) =>
    firstPattern.length === secondPattern.length &&
    firstPattern.every((value, index) => value === secondPattern[index]);

const derangeUsers = (users, patternRows = null) => {
    if (users.length < 2) {
        return null;
    }

    const canUseUserForPattern = (user, patternIndex) => {
        if (user.originalIndex === patternIndex) {
            return false;
        }

        if (!patternRows) {
            return true;
        }

        return !arePatternsEqual(
            patternRows[patternIndex],
            patternRows[user.originalIndex]
        );
    };
    const indexedUsers = users.map((user, index) => ({
        ...user,
        originalIndex: index,
    }));

    for (let attempt = 0; attempt < 100; attempt++) {
        const shuffledUsers = shuffleArray(indexedUsers);

        if (
            shuffledUsers.every((user, index) =>
                canUseUserForPattern(user, index)
            )
        ) {
            return shuffledUsers.map(({ originalIndex, ...user }) => user);
        }
    }

    const assignedUsers = [];
    const usedUserIds = new Set();

    const assignNextPattern = (patternIndex) => {
        if (patternIndex === users.length) {
            return true;
        }

        for (const user of indexedUsers) {
            if (usedUserIds.has(user.id)) continue;
            if (!canUseUserForPattern(user, patternIndex)) continue;

            assignedUsers[patternIndex] = user;
            usedUserIds.add(user.id);

            if (assignNextPattern(patternIndex + 1)) {
                return true;
            }

            usedUserIds.delete(user.id);
            assignedUsers[patternIndex] = undefined;
        }

        return false;
    };

    if (!assignNextPattern(0)) {
        return null;
    }

    return assignedUsers.map(({ originalIndex, ...user }) => user);
};

const getPreviousLastDayStates = async ({
    client,
    users,
    previousMonth,
    previousLastDate,
    shiftNumberById,
    template,
}) => {
    const userIds = users.map((user) => user.id);
    const assignmentResult = await client.query(
        `SELECT ra.user_id, p.pattern_data
         FROM roster_assignments ra
         JOIN patterns p ON p.id = ra.pattern_id
         WHERE DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', $1::date)
         AND ra.user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const patternByUser = new Map(
        assignmentResult.rows.map((row) => [row.user_id, row.pattern_data])
    );

    if (patternByUser.size !== users.length) {
        return {
            states: null,
            error: `Previous month ${previousMonth} must have assignments for all 5 active security personnel`,
        };
    }

    const shiftResult = await client.query(
        `SELECT user_id, shift_id
         FROM shift_assignments
         WHERE assignment_date = $1
         AND user_id = ANY($2::int[])`,
        [previousLastDate, userIds]
    );

    const shiftsByUser = new Map();

    for (const row of shiftResult.rows) {
        if (shiftsByUser.has(row.user_id)) {
            return {
                states: null,
                error: `Previous month ${previousMonth} has more than one shift for a personnel on ${previousLastDate}`,
            };
        }
        shiftsByUser.set(row.user_id, row.shift_id);
    }

    const states = [];

    for (const user of users) {
        const previousPattern = patternByUser.get(user.id);
        const shiftNumberPattern = previousPattern
            ? toShiftNumberPattern(previousPattern, shiftNumberById)
            : null;

        if (!shiftNumberPattern || shiftNumberPattern.includes(null)) {
            return {
                states: null,
                error: `Previous month pattern for ${user.name} contains shifts that cannot be mapped to template shifts ${template.activeShifts.join(', ')}`,
            };
        }

        const lastDayPatternIndex =
            (Number(previousLastDate.slice(8, 10)) - 1) %
            shiftNumberPattern.length;
        const shiftId = shiftsByUser.get(user.id);

        if (!shiftId) {
            states.push(shiftNumberPattern[lastDayPatternIndex]);
            continue;
        }

        const shiftNumber = shiftNumberById[Number(shiftId)];

        if (!shiftNumber) {
            return {
                states: null,
                error: `Previous month last-day shift for ${user.name} cannot be mapped to template shifts ${template.activeShifts.join(', ')}`,
            };
        }

        states.push(shiftNumber);
    }

    return { states };
};

const getPreviousLastOffDays = async ({
    client,
    users,
    previousMonth,
    previousDays,
    shiftNumberById,
    template,
}) => {
    const userIds = users.map((user) => user.id);
    const assignmentResult = await client.query(
        `SELECT ra.user_id, p.pattern_data
         FROM roster_assignments ra
         JOIN patterns p ON p.id = ra.pattern_id
         WHERE DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', $1::date)
         AND ra.user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const patternByUser = new Map(
        assignmentResult.rows.map((row) => [row.user_id, row.pattern_data])
    );

    if (patternByUser.size !== users.length) {
        return {
            lastOffDays: null,
            error: `Previous month ${previousMonth} must have assignments for all 5 active security personnel`,
        };
    }

    const shiftResult = await client.query(
        `SELECT user_id, TO_CHAR(assignment_date, 'YYYY-MM-DD') as assignment_date
         FROM shift_assignments
         WHERE DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $1::date)
         AND user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const workedDaysByUser = new Map(users.map((user) => [user.id, new Set()]));

    for (const row of shiftResult.rows) {
        const day = Number(row.assignment_date.slice(8, 10));
        const workedDays = workedDaysByUser.get(row.user_id);

        if (!workedDays) continue;

        if (workedDays.has(day)) {
            return {
                lastOffDays: null,
                error: `Previous month ${previousMonth} has more than one shift for a personnel on ${row.assignment_date}`,
            };
        }

        workedDays.add(day);
    }

    const lastOffDays = [];

    for (const user of users) {
        const previousPattern = patternByUser.get(user.id);
        const shiftNumberPattern = previousPattern
            ? toShiftNumberPattern(previousPattern, shiftNumberById)
            : null;

        if (!shiftNumberPattern || shiftNumberPattern.includes(null)) {
            return {
                lastOffDays: null,
                error: `Previous month pattern for ${user.name} contains shifts that cannot be mapped to template shifts ${template.activeShifts.join(', ')}`,
            };
        }

        const workedDays = workedDaysByUser.get(user.id);
        let lastOffDay = null;

        for (let day = previousDays; day >= 1; day--) {
            const patternIndex = (day - 1) % shiftNumberPattern.length;
            const hasActualShift = workedDays.has(day);
            const shiftForDay = hasActualShift
                ? 'actual-work'
                : shiftNumberPattern[patternIndex];

            if (shiftForDay === 0) {
                lastOffDay = day;
                break;
            }
        }

        if (!lastOffDay) {
            return {
                lastOffDays: null,
                error: `Previous month ${previousMonth} has no OFF day for ${user.name}`,
            };
        }

        lastOffDays.push({
            user_id: user.id,
            user_name: user.name,
            last_off_day: lastOffDay,
        });
    }

    return { lastOffDays };
};

const getPreviousLastOffDaysRaw = async ({
    client,
    users,
    previousMonth,
    previousDays,
}) => {
    const userIds = users.map((user) => user.id);
    const assignmentResult = await client.query(
        `SELECT ra.user_id, p.pattern_data
         FROM roster_assignments ra
         JOIN patterns p ON p.id = ra.pattern_id
         WHERE DATE_TRUNC('month', ra.assignment_month) = DATE_TRUNC('month', $1::date)
         AND ra.user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const patternByUser = new Map(
        assignmentResult.rows.map((row) => [row.user_id, row.pattern_data])
    );

    if (patternByUser.size !== users.length) {
        return {
            lastOffDays: null,
            error: `Previous month ${previousMonth} must have assignments for all 5 active security personnel`,
        };
    }

    const shiftResult = await client.query(
        `SELECT user_id, TO_CHAR(assignment_date, 'YYYY-MM-DD') as assignment_date
         FROM shift_assignments
         WHERE DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $1::date)
         AND user_id = ANY($2::int[])`,
        [previousMonth, userIds]
    );

    const workedDaysByUser = new Map(users.map((user) => [user.id, new Set()]));

    for (const row of shiftResult.rows) {
        const day = Number(row.assignment_date.slice(8, 10));
        const workedDays = workedDaysByUser.get(row.user_id);

        if (!workedDays) continue;

        if (workedDays.has(day)) {
            return {
                lastOffDays: null,
                error: `Previous month ${previousMonth} has more than one shift for a personnel on ${row.assignment_date}`,
            };
        }

        workedDays.add(day);
    }

    const lastOffDays = [];

    for (const user of users) {
        const previousPattern = patternByUser.get(user.id);

        if (!Array.isArray(previousPattern) || previousPattern.length === 0) {
            return {
                lastOffDays: null,
                error: `Previous month pattern for ${user.name} is empty or invalid`,
            };
        }

        const workedDays = workedDaysByUser.get(user.id);
        let lastOffDay = null;

        for (let day = previousDays; day >= 1; day--) {
            const patternIndex = (day - 1) % previousPattern.length;
            const hasActualShift = workedDays.has(day);

            if (!hasActualShift && Number(previousPattern[patternIndex]) === 0) {
                lastOffDay = day;
                break;
            }
        }

        if (!lastOffDay) {
            return {
                lastOffDays: null,
                error: `Previous month ${previousMonth} has no OFF day for ${user.name}`,
            };
        }

        lastOffDays.push({
            user_id: user.id,
            user_name: user.name,
            last_off_day: lastOffDay,
        });
    }

    return { lastOffDays };
};

const getNextOffDayIndexes = (previousLastOffDays, previousDays) =>
    previousLastOffDays.map(({ last_off_day: lastOffDay }) => {
        const daysSinceLastOffAtMonthStart = previousDays - lastOffDay;
        const nextOffDay = 7 - (daysSinceLastOffAtMonthStart % 7);
        return nextOffDay - 1;
    });

const validateFirstOffDays = (rows, expectedOffDayIndexes, users) => {
    for (let userIndex = 0; userIndex < rows.length; userIndex++) {
        const actualOffDayIndex = rows[userIndex].findIndex(
            (shiftNumber) => shiftNumber === 0
        );
        const expectedOffDayIndex = expectedOffDayIndexes[userIndex];

        if (actualOffDayIndex !== expectedOffDayIndex) {
            return {
                isValid: false,
                error: `${users[userIndex].name} should be OFF on day ${
                    expectedOffDayIndex + 1
                }, but generated OFF is day ${actualOffDayIndex + 1}`,
            };
        }
    }

    return { isValid: true };
};

const validateBoundaryWithPreviousLastDay = (
    rows,
    previousLastDayStates,
    template = AUTO_ASSIGN_TEMPLATES['5p-3s']
) => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const previousShift = previousLastDayStates[rowIndex];
        const firstDayShift = rows[rowIndex][0];

        if (
            template.afterOffShift !== null &&
            previousShift === 0 &&
            firstDayShift !== template.afterOffShift
        ) {
            return {
                isValid: false,
                error: `Personnel row ${rowIndex + 1} was OFF on the previous month's last day, so day 1 must be shift ${template.afterOffShift}`,
            };
        }

        if (
            template.beforeOffShift !== null &&
            firstDayShift === 0 &&
            previousShift !== template.beforeOffShift
        ) {
            return {
                isValid: false,
                error: `Personnel row ${rowIndex + 1} is OFF on day 1, so the previous month's last day must be shift ${template.beforeOffShift}`,
            };
        }

        if (
            template.preventShift3ToShift1 &&
            previousShift === 3 &&
            firstDayShift === 1
        ) {
            return {
                isValid: false,
                error: `Personnel row ${rowIndex + 1} must not move from shift 3 on the previous month's last day to shift 1 on day 1`,
            };
        }
    }

    return { isValid: true };
};

const getShiftCountBalance = (counts, userIndex, shiftNumber) => {
    if (shiftNumber === 1 || shiftNumber === 2) {
        return Math.abs((counts[userIndex][1] + (shiftNumber === 1 ? 1 : 0)) -
            (counts[userIndex][2] + (shiftNumber === 2 ? 1 : 0)));
    }

    return counts[userIndex][3] + 1;
};

const getDayFillOptions = (rows, counts, dayIndex) => {
    const emptyUserIndexes = rows
        .map((row, userIndex) => ({ row, userIndex }))
        .filter(({ row }) => row[dayIndex] === null)
        .map(({ userIndex }) => userIndex);
    const existingShift1Count = rows.filter((row) => row[dayIndex] === 1).length;
    const existingShift3Count = rows.filter((row) => row[dayIndex] === 3).length;
    const neededShift1Count = 1 - existingShift1Count;
    const neededShift3Count = 2 - existingShift3Count;

    if (
        neededShift1Count < 0 ||
        neededShift1Count > emptyUserIndexes.length ||
        neededShift3Count < 0 ||
        neededShift3Count > emptyUserIndexes.length
    ) {
        return null;
    }

    const options = [];
    const candidateValues = [1, 2, 3];

    const canPlaceShift = (userIndex, shiftNumber) => {
        const previousDayIndex = (dayIndex + 6) % 7;
        const nextDayIndex = (dayIndex + 1) % 7;
        const previousShift = rows[userIndex][previousDayIndex];
        const nextShift = rows[userIndex][nextDayIndex];

        if (previousShift === 3 && shiftNumber === 1) {
            return false;
        }

        if (shiftNumber === 3 && nextShift === 1) {
            return false;
        }

        return true;
    };

    const buildOptions = (emptyIndex, assignment, shift1Count, shift3Count) => {
        if (emptyIndex === emptyUserIndexes.length) {
            if (shift1Count !== neededShift1Count) return;
            if (shift3Count !== neededShift3Count) return;

            const score = assignment.reduce(
                (total, { userIndex, shiftNumber }) =>
                    total + getShiftCountBalance(counts, userIndex, shiftNumber),
                0
            );

            options.push({ assignment, score });
            return;
        }

        const userIndex = emptyUserIndexes[emptyIndex];

        for (const shiftNumber of candidateValues) {
            const nextShift1Count =
                shift1Count + (shiftNumber === 1 ? 1 : 0);
            const nextShift3Count =
                shift3Count + (shiftNumber === 3 ? 1 : 0);
            const remainingSlots = emptyUserIndexes.length - emptyIndex - 1;

            if (nextShift1Count > neededShift1Count) continue;
            if (nextShift1Count + remainingSlots < neededShift1Count) continue;
            if (nextShift3Count > neededShift3Count) continue;
            if (nextShift3Count + remainingSlots < neededShift3Count) continue;
            if (!canPlaceShift(userIndex, shiftNumber)) continue;

            buildOptions(
                emptyIndex + 1,
                [...assignment, { userIndex, shiftNumber }],
                nextShift1Count,
                nextShift3Count
            );
        }
    };

    buildOptions(0, [], 0, 0);

    return options.sort((first, second) => first.score - second.score);
};

const fillRemainingShifts = (rows) => {
    const counts = Array.from({ length: 5 }, () => ({
        1: 0,
        2: 0,
        3: 0,
    }));

    const patternLength = rows[0]?.length || 0;

    for (let userIndex = 0; userIndex < 5; userIndex++) {
        for (let dayIndex = 0; dayIndex < patternLength; dayIndex++) {
            const shiftNumber = rows[userIndex][dayIndex];
            if (shiftNumber && counts[userIndex][shiftNumber] !== undefined) {
                counts[userIndex][shiftNumber]++;
            }
        }
    }

    const fillDay = (dayIndex) => {
        if (dayIndex === 7) {
            return rows.every((row) => !hasShift3ToShift1Transition(row));
        }

        const options = getDayFillOptions(rows, counts, dayIndex);

        if (!options || options.length === 0) {
            return false;
        }

        for (const { assignment } of options) {
            for (const { userIndex, shiftNumber } of assignment) {
                rows[userIndex][dayIndex] = shiftNumber;
                counts[userIndex][shiftNumber]++;
            }

            if (fillDay(dayIndex + 1)) {
                return true;
            }

            for (const { userIndex, shiftNumber } of assignment) {
                rows[userIndex][dayIndex] = null;
                counts[userIndex][shiftNumber]--;
            }
        }

        return false;
    };

    if (!fillDay(0)) {
        return {
            isValid: false,
            error: 'Unable to fill remaining shifts with exactly 1 personnel on shift 1 and without shift 3 followed by shift 1',
        };
    }

    return { isValid: true };
};

const fillRemainingTwoShiftRows = (rows) => {
    const counts = Array.from({ length: 5 }, () => ({
        1: 0,
        2: 0,
    }));

    for (let userIndex = 0; userIndex < 5; userIndex++) {
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const shiftNumber = rows[userIndex][dayIndex];
            if (shiftNumber && counts[userIndex][shiftNumber] !== undefined) {
                counts[userIndex][shiftNumber]++;
            }
        }
    }

    for (let dayIndex = 0; dayIndex < patternLength; dayIndex++) {
        const existingShift1Count = rows.filter(
            (row) => row[dayIndex] === 1
        ).length;
        const neededShift1Count = 2 - existingShift1Count;
        const candidates = rows
            .map((row, userIndex) => ({ row, userIndex }))
            .filter(({ row }) => row[dayIndex] === null)
            .sort((first, second) => {
                if (
                    counts[first.userIndex][1] !==
                    counts[second.userIndex][1]
                ) {
                    return (
                        counts[first.userIndex][1] -
                        counts[second.userIndex][1]
                    );
                }

                return first.userIndex - second.userIndex;
            });

        if (
            neededShift1Count < 0 ||
            neededShift1Count > candidates.length
        ) {
            return {
                isValid: false,
                error: `Day ${dayIndex + 1} cannot be filled with exactly 2 personnel on shift 1`,
            };
        }

        for (const { userIndex } of candidates.slice(0, neededShift1Count)) {
            rows[userIndex][dayIndex] = 1;
            counts[userIndex][1]++;
        }

        for (const { userIndex } of candidates.slice(neededShift1Count)) {
            rows[userIndex][dayIndex] = 2;
            counts[userIndex][2]++;
        }
    }

    return { isValid: true };
};

const createRowsFromDailyOffUserIndexes = (
    dailyOffUserIndexes,
    template = AUTO_ASSIGN_TEMPLATES['5p-2s']
) => {
    const rows = Array.from({ length: 5 }, () =>
        Array(template.patternLength).fill(null)
    );

    if (
        !Array.isArray(dailyOffUserIndexes) ||
        dailyOffUserIndexes.length !== template.patternLength
    ) {
        return {
            rows: null,
            error: `Daily OFF pattern must contain ${template.patternLength} days`,
        };
    }

    for (let dayIndex = 0; dayIndex < template.patternLength; dayIndex++) {
        const offUserIndex = dailyOffUserIndexes[dayIndex];

        if (offUserIndex < 0 || offUserIndex >= 5) {
            return {
                rows: null,
                error: `Day ${dayIndex + 1} has invalid OFF personnel index`,
            };
        }

        rows[offUserIndex][dayIndex] = 0;
        rows[(offUserIndex + 1) % 5][dayIndex] = 1;
        rows[(offUserIndex + 2) % 5][dayIndex] = 1;
        rows[(offUserIndex + 3) % 5][dayIndex] = 2;
        rows[(offUserIndex + 4) % 5][dayIndex] = 2;
    }

    const validation = validateAutoPatternRows(rows, template);

    if (!validation.isValid) {
        return { rows: null, error: validation.error };
    }

    return { rows };
};

const generateDailyOffUserIndexes = (lastOffUserIndex = null) => {
    const startIndex =
        lastOffUserIndex === null
            ? Math.floor(Math.random() * 5)
            : (lastOffUserIndex + 1) % 5;

    return Array.from({ length: 5 }, (_, dayIndex) => (startIndex + dayIndex) % 5);
};

const createRowsFromOffDayIndexes = (
    offDayIndexes,
    previousLastDayStates = null,
    template = AUTO_ASSIGN_TEMPLATES['5p-3s']
) => {
    const rows = Array.from({ length: 5 }, () => Array(7).fill(null));

    for (let userIndex = 0; userIndex < 5; userIndex++) {
        const offDay = offDayIndexes[userIndex];
        const previousShift = previousLastDayStates?.[userIndex];

        if (offDay < 0 || offDay > 6) {
            return {
                rows: null,
                error: `Personnel row ${userIndex + 1} has invalid OFF day index`,
            };
        }

        if (
            template.beforeOffShift !== null &&
            offDay === 0 &&
            previousShift !== undefined &&
            previousShift !== template.beforeOffShift
        ) {
            return {
                rows: null,
                error: `Personnel row ${userIndex + 1} is OFF on day 1, so the previous month's last day must be shift ${template.beforeOffShift}`,
            };
        }

        const forcedDays = [[offDay, 0]];

        if (template.beforeOffShift !== null) {
            forcedDays.push([(offDay + 6) % 7, template.beforeOffShift]);
        }

        if (template.afterOffShift !== null) {
            forcedDays.push([(offDay + 1) % 7, template.afterOffShift]);
        }

        for (const [dayIndex, shiftNumber] of forcedDays) {
            if (
                rows[userIndex][dayIndex] !== null &&
                rows[userIndex][dayIndex] !== shiftNumber
            ) {
                return {
                    rows: null,
                    error: `Personnel row ${userIndex + 1} has conflicting OFF rule assignments`,
                };
            }
            rows[userIndex][dayIndex] = shiftNumber;
        }

        if (template.afterOffShift !== null && previousShift === 0) {
            if (
                rows[userIndex][0] !== null &&
                rows[userIndex][0] !== template.afterOffShift
            ) {
                return {
                    rows: null,
                    error: `Personnel row ${userIndex + 1} was OFF on the previous month's last day, so day 1 must be shift ${template.afterOffShift}`,
                };
            }
            rows[userIndex][0] = template.afterOffShift;
        }
    }

    const fillResult =
        template.key === '5p-2s'
            ? fillRemainingTwoShiftRows(rows)
            : fillRemainingShifts(rows);

    if (!fillResult.isValid) {
        return { rows: null, error: fillResult.error };
    }

    const validation = validateAutoPatternRows(rows, template);

    if (!validation.isValid) {
        return { rows: null, error: validation.error };
    }

    if (previousLastDayStates) {
        const boundaryValidation = validateBoundaryWithPreviousLastDay(
            rows,
            previousLastDayStates,
            template
        );

        if (!boundaryValidation.isValid) {
            return { rows: null, error: boundaryValidation.error };
        }
    }

    return { rows };
};

const generateRandomAutoPattern = (
    previousLastDayStates = null,
    forcedOffDayIndexes = null,
    template = AUTO_ASSIGN_TEMPLATES['5p-3s']
) => {
    if (template.key === '5p-2s') {
        const result = createRowsFromDailyOffUserIndexes(
            generateDailyOffUserIndexes(),
            template
        );

        if (result.rows) return result.rows;

        throw createAutoAssignError(
            `Unable to create a valid ${template.name} pattern`
        );
    }

    for (let attempt = 0; attempt < 500; attempt++) {
        const offDays =
            forcedOffDayIndexes || shuffleArray([0, 1, 2, 3, 4, 5, 6]).slice(0, 5);
        const result = createRowsFromOffDayIndexes(
            offDays,
            previousLastDayStates,
            template
        );

        if (result.rows) return result.rows;

        if (forcedOffDayIndexes) break;
    }

    if (previousLastDayStates) {
        throw createAutoAssignError(
            'Unable to create a valid pattern that continues from the previous month last-day schedule'
        );
    }

    throw createAutoAssignError(
        `Unable to create a valid ${template.name} pattern`
    );
};

const buildPatternRowsForMode = async ({
    client,
    mode,
    template,
    users,
    year,
    monthNum,
    shiftNumberById,
}) => {
    if (mode === 'random-pattern') {
        return {
            users,
            patternRows: generateRandomAutoPattern(null, null, template),
            source: 'random-pattern',
        };
    }

    const { previousMonth, previousDays } = getPreviousMonthInfo(year, monthNum);

    if (mode === 'random-personnel') {
        const previousPatterns = await getPreviousPatternRows({
            client,
            users,
            previousMonth,
            shiftNumberById,
            template,
        });

        if (!previousPatterns.rows) {
            throw createAutoAssignError(
                `Random Personnel requires a valid previous month pattern. ${previousPatterns.error}`
            );
        }

        return {
            users: shuffleArray(users),
            patternRows: previousPatterns.rows,
            source: 'random-personnel-previous',
            previousMonth,
        };
    }

    if (mode === 'random-personnel-raw') {
        const previousPatterns = await getPreviousRawPatternRows({
            client,
            users,
            previousMonth,
            shiftNumberById,
            template,
        });

        if (!previousPatterns.rows) {
            throw createAutoAssignError(
                `Random Personnel Raw requires previous month patterns. ${previousPatterns.error}`
            );
        }

        const derangedUsers = derangeUsers(users, previousPatterns.rows);

        if (!derangedUsers) {
            throw createAutoAssignError(
                'Random Personnel Raw cannot shuffle previous month patterns without giving at least one personnel the same previous pattern.'
            );
        }

        return {
            users: derangedUsers,
            patternRows: previousPatterns.rows,
            source: 'random-personnel-raw-previous',
            previousMonth,
        };
    }

    if (mode === 'continue-previous') {
        const previousLastDate = formatDate(
            Number(previousMonth.slice(0, 4)),
            Number(previousMonth.slice(5, 7)),
            previousDays
        );

        if (template.key === '5p-2s') {
            const previousLastOff = await getPreviousLastOffDaysRaw({
                client,
                users,
                previousMonth,
                previousDays,
            });

            if (!previousLastOff.lastOffDays) {
                throw createAutoAssignError(
                    `Continue Previous Month requires the previous month last OFF day. ${previousLastOff.error}`
                );
            }

            const previousLastOffDay = Math.max(
                ...previousLastOff.lastOffDays.map((item) => item.last_off_day)
            );
            const lastOffUserIndex = users.findIndex((user) =>
                previousLastOff.lastOffDays.some(
                    (item) =>
                        item.user_id === user.id &&
                        item.last_off_day === previousLastOffDay
                )
            );

            if (lastOffUserIndex < 0) {
                throw createAutoAssignError(
                    'Continue Previous Month cannot find the last OFF personnel from the previous month.'
                );
            }

            const dailyOffUserIndexes =
                generateDailyOffUserIndexes(lastOffUserIndex);
            const continuedPattern = createRowsFromDailyOffUserIndexes(
                dailyOffUserIndexes,
                template
            );

            if (!continuedPattern.rows) {
                throw createAutoAssignError(
                    `Continue Previous Month cannot create a valid roster from the previous month daily OFF continuity. ${continuedPattern.error}`
                );
            }

            return {
                users,
                patternRows: continuedPattern.rows,
                source: 'continue-previous-daily-off',
                previousMonth,
                previousLastDate,
                previousLastOffDays: previousLastOff.lastOffDays.map(
                    (item) => item.last_off_day
                ),
                previousLastOffByUser: previousLastOff.lastOffDays,
                nextOffDays: dailyOffUserIndexes.map(
                    (userIndex) => userIndex + 1
                ),
            };
        }

        const previousLastDay = await getPreviousLastDayStates({
            client,
            users,
            previousMonth,
            previousLastDate,
            shiftNumberById,
            template,
        });
        const previousLastOff = await getPreviousLastOffDays({
            client,
            users,
            previousMonth,
            previousDays,
            shiftNumberById,
            template,
        });

        if (!previousLastDay.states) {
            throw createAutoAssignError(
                `Continue Previous Month requires the previous month last-day schedule. ${previousLastDay.error}`
            );
        }

        if (!previousLastOff.lastOffDays) {
            throw createAutoAssignError(
                `Continue Previous Month requires the previous month last OFF day. ${previousLastOff.error}`
            );
        }

        const forcedOffDayIndexes = getNextOffDayIndexes(
            previousLastOff.lastOffDays,
            previousDays
        );
        const continuedPattern = createRowsFromOffDayIndexes(
            forcedOffDayIndexes,
            previousLastDay.states,
            template
        );

        if (!continuedPattern.rows) {
            throw createAutoAssignError(
                `Continue Previous Month cannot create a valid roster from the previous month continuity rules. ${continuedPattern.error}`
            );
        }

        const firstOffValidation = validateFirstOffDays(
            continuedPattern.rows,
            forcedOffDayIndexes,
            users
        );

        if (!firstOffValidation.isValid) {
            throw createAutoAssignError(
                `Continue Previous Month generated an invalid OFF continuity. ${firstOffValidation.error}`
            );
        }

        return {
            users,
            patternRows: continuedPattern.rows,
            source: 'continue-previous-last-day',
            previousMonth,
            previousLastDate,
            previousLastOffDays: previousLastOff.lastOffDays.map(
                (item) => item.last_off_day
            ),
            previousLastOffByUser: previousLastOff.lastOffDays,
            nextOffDays: forcedOffDayIndexes.map((dayIndex) => dayIndex + 1),
        };
    }

    return {
        users,
        patternRows: generateRandomAutoPattern(null, null, template),
        source: 'fixed-pattern',
    };
};

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
                const patternLength = pattern_data.length;

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
 * Generate a 5-person monthly roster using the selected roster template.
 * 5p-3s uses a 7-day rule, 5p-2s uses a 5-day rotating pattern.
 */
router.post(
    '/auto-assign',
    authenticateToken,
    requireRole(['admin', 'manager']),
    async (req, res) => {
        const client = await pool.connect();

        try {
            const {
                month,
                mode = 'continue-previous',
                template: templateKey = '5p-3s',
            } = req.body;
            const allowedModes = [
                'random-pattern',
                'random-personnel',
                'random-personnel-raw',
                'continue-previous',
            ];
            const template = AUTO_ASSIGN_TEMPLATES[templateKey];

            if (!month) {
                return res.status(400).json({
                    success: false,
                    error: 'Month is required (format: YYYY-MM-DD)',
                });
            }

            if (!allowedModes.includes(mode)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid auto assign mode. Allowed modes: ${allowedModes.join(
                        ', '
                    )}`,
                });
            }

            if (!template) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid auto assign template. Allowed templates: ${Object.keys(
                        AUTO_ASSIGN_TEMPLATES
                    ).join(', ')}`,
                });
            }

            const monthDate = new Date(month);
            const year = monthDate.getFullYear();
            const monthNum = monthDate.getMonth() + 1;
            const daysInMonth = new Date(year, monthNum, 0).getDate();
            const normalizedMonth = formatDate(year, monthNum, 1);

            await client.query('BEGIN');
            const undoSnapshot = await createAutoAssignSnapshot(
                client,
                normalizedMonth,
                req.user.userId
            );

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
            const shiftMap = Object.fromEntries(
                template.activeShifts.map((shiftNumber) => [
                    shiftNumber,
                    resolveShiftId(shifts, shiftNumber),
                ])
            );
            const shiftNumberById = Object.fromEntries(
                Object.entries(shiftMap).map(([shiftNumber, shiftId]) => [
                    shiftId,
                    Number(shiftNumber),
                ])
            );

            const missingShifts = Object.entries(shiftMap)
                .filter(([, shiftId]) => !shiftId)
                .map(([shiftNumber]) => shiftNumber);

            if (missingShifts.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: `${template.name} requires active shifts ${template.activeShifts.join(
                        ', '
                    )}. Missing: ${missingShifts.join(
                        ', '
                    )}`,
                });
            }

            const autoRoster = await buildPatternRowsForMode({
                client,
                mode,
                template,
                users,
                year,
                monthNum,
                shiftNumberById,
            });

            const assignedUsers = autoRoster.users;
            const patternRows = autoRoster.patternRows.map((row) =>
                row.map((shiftNumber) =>
                    shiftNumber === 0 ? 0 : shiftMap[shiftNumber]
                )
            );

            const patternIds = [];

            for (let index = 0; index < patternRows.length; index++) {
                const patternData = patternRows[index];
                const patternName = `Auto ${template.key} ${normalizedMonth} ${mode} - Pattern ${
                    index + 1
                }`;
                const description = `Auto-generated ${mode} ${template.name} pattern for ${normalizedMonth}.`;

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
                                  description,
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
                                  description,
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
            for (let index = 0; index < assignedUsers.length; index++) {
                const assignmentResult = await client.query(
                    `INSERT INTO roster_assignments (user_id, pattern_id, assignment_month, assigned_by)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, assignment_month)
                     DO UPDATE SET pattern_id = EXCLUDED.pattern_id, assigned_by = EXCLUDED.assigned_by
                    RETURNING *`,
                    [
                        assignedUsers[index].id,
                        patternIds[index],
                        normalizedMonth,
                        req.user.userId,
                    ]
                );

                rosterAssignments.push({
                    ...assignmentResult.rows[0],
                    user_name: assignedUsers[index].name,
                });
            }

            let createdCount = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateString = formatDate(year, monthNum, day);

                for (let userIndex = 0; userIndex < assignedUsers.length; userIndex++) {
                    const patternIndex =
                        (day - 1) % patternRows[userIndex].length;
                    const shiftId = patternRows[userIndex][patternIndex];

                    if (shiftId === 0) continue;

                    await client.query(
                        `INSERT INTO shift_assignments
                         (user_id, shift_id, assignment_date, is_replacement, created_by, created_at, updated_at)
                         VALUES ($1, $2, $3, false, $4, NOW(), NOW())`,
                        [
                            assignedUsers[userIndex].id,
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
                    mode,
                    template: template.key,
                    template_name: template.name,
                    source: autoRoster.source,
                    previous_month: autoRoster.previousMonth,
                    previous_last_date: autoRoster.previousLastDate,
                    previous_last_off_days: autoRoster.previousLastOffDays,
                    previous_last_off_by_user: autoRoster.previousLastOffByUser,
                    next_off_days: autoRoster.nextOffDays,
                    days: daysInMonth,
                    users: assignedUsers.length,
                    patterns: patternIds.length,
                    deleted: deleteShiftsResult.rowCount,
                    created: createdCount,
                    undo_snapshot_id: undoSnapshot.id,
                    assignments: rosterAssignments,
                    rule: {
                        off_per_7_days: 1,
                        before_off_shift: template.beforeOffShift,
                        after_off_shift: template.afterOffShift,
                        shift_1_daily_personnel:
                            template.shift1DailyPersonnel,
                        shift_3_daily_personnel:
                            template.shift3DailyPersonnel,
                        daily_off_personnel: template.dailyOffPersonnel,
                        min_off_days_per_pattern_row:
                            template.minOffDaysPerPatternRow,
                        max_off_days_per_pattern_row:
                            template.maxOffDaysPerPatternRow,
                        active_shifts: template.activeShifts,
                        pattern_length: template.patternLength,
                        prevent_shift_3_to_shift_1:
                            template.preventShift3ToShift1,
                    },
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error auto-assigning roster:', error);
            res.status(error.statusCode || 500).json({
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
 * POST /api/roster/auto-assign/undo
 * Restore the latest Auto Assign snapshot for a month.
 */
router.post(
    '/auto-assign/undo',
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
            const normalizedMonth = formatDate(
                monthDate.getFullYear(),
                monthDate.getMonth() + 1,
                1
            );

            await client.query('BEGIN');

            const snapshotResult = await client.query(
                `SELECT id, roster_assignments, shift_assignments
                 FROM roster_auto_assign_snapshots
                 WHERE DATE_TRUNC('month', assignment_month) = DATE_TRUNC('month', $1::date)
                 AND restored_at IS NULL
                 ORDER BY created_at DESC
                 LIMIT 1
                 FOR UPDATE`,
                [normalizedMonth]
            );

            if (snapshotResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'No undo snapshot is available for this month',
                });
            }

            const snapshot = snapshotResult.rows[0];
            const rosterAssignments = Array.isArray(snapshot.roster_assignments)
                ? snapshot.roster_assignments
                : JSON.parse(snapshot.roster_assignments || '[]');
            const shiftAssignments = Array.isArray(snapshot.shift_assignments)
                ? snapshot.shift_assignments
                : JSON.parse(snapshot.shift_assignments || '[]');

            const deleteShiftsResult = await client.query(
                `DELETE FROM shift_assignments
                 WHERE DATE_TRUNC('month', assignment_date) = DATE_TRUNC('month', $1::date)`,
                [normalizedMonth]
            );

            const deleteAssignmentsResult = await client.query(
                `DELETE FROM roster_assignments
                 WHERE DATE_TRUNC('month', assignment_month) = DATE_TRUNC('month', $1::date)`,
                [normalizedMonth]
            );

            for (const assignment of rosterAssignments) {
                await client.query(
                    `INSERT INTO roster_assignments
                     (user_id, pattern_id, assignment_month, assigned_by, assigned_at, notes)
                     VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, NOW()), $6)
                     ON CONFLICT (user_id, assignment_month)
                     DO UPDATE SET
                        pattern_id = EXCLUDED.pattern_id,
                        assigned_by = EXCLUDED.assigned_by,
                        assigned_at = EXCLUDED.assigned_at,
                        notes = EXCLUDED.notes`,
                    [
                        assignment.user_id,
                        assignment.pattern_id,
                        normalizedMonth,
                        assignment.assigned_by,
                        assignment.assigned_at,
                        assignment.notes,
                    ]
                );
            }

            for (const shiftAssignment of shiftAssignments) {
                await client.query(
                    `INSERT INTO shift_assignments
                     (user_id, shift_id, assignment_date, is_replacement, replaced_user_id, notes, created_by, created_at, updated_at)
                     VALUES ($1, $2, $3, COALESCE($4, false), $5, $6, $7, COALESCE($8::timestamp, NOW()), COALESCE($9::timestamp, NOW()))
                     ON CONFLICT (user_id, assignment_date, shift_id)
                     DO UPDATE SET
                        is_replacement = EXCLUDED.is_replacement,
                        replaced_user_id = EXCLUDED.replaced_user_id,
                        notes = EXCLUDED.notes,
                        created_by = EXCLUDED.created_by,
                        updated_at = EXCLUDED.updated_at`,
                    [
                        shiftAssignment.user_id,
                        shiftAssignment.shift_id,
                        shiftAssignment.assignment_date,
                        shiftAssignment.is_replacement,
                        shiftAssignment.replaced_user_id,
                        shiftAssignment.notes,
                        shiftAssignment.created_by,
                        shiftAssignment.created_at,
                        shiftAssignment.updated_at,
                    ]
                );
            }

            await client.query(
                `UPDATE roster_auto_assign_snapshots
                 SET restored_at = NOW(), restored_by = $1
                 WHERE id = $2`,
                [req.user.userId, snapshot.id]
            );

            await client.query('COMMIT');

            res.json({
                success: true,
                message: 'Auto assign undo completed successfully',
                data: {
                    month: normalizedMonth,
                    snapshot_id: snapshot.id,
                    deleted_assignments: deleteAssignmentsResult.rowCount,
                    deleted_shifts: deleteShiftsResult.rowCount,
                    restored_assignments: rosterAssignments.length,
                    restored_shifts: shiftAssignments.length,
                },
            });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error undoing auto-assign roster:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: 'Failed to undo auto-assign roster',
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
        const { month, daysInMonth, dayNames, users, template, shiftTimes } =
            req.body;

        console.log('📄 PDF Export Request:', {
            month,
            daysInMonth,
            userCount: users?.length,
            template,
            shiftTimes,
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
            template,
            shiftTimes,
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
