/**
 * Security App Routes
 * TIA Security App - Guards Only
 * Simple post-based login untuk security guards
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const {
    authMiddleware,
    flexibleAuthMiddleware,
    securityAppOnly,
} = require('../middleware/auth.middleware');

/**
 * POST /api/security-app/login
 * Login dengan kode pos + password
 *
 * Body:
 * {
 *   "pos_code": "pos1",
 *   "password": "pos1234"
 * }
 */
router.post('/login', async (req, res) => {
    try {
        const { pos_code, password } = req.body;

        // Validation
        if (!pos_code || !password) {
            return res.status(400).json({
                success: false,
                error: 'Kode pos dan password harus diisi',
            });
        }

        console.log(`[Security App Login] Attempt: ${pos_code}`);

        // 1. Check if pos exists
        const posResult = await pool.query(
            `SELECT id, code, name, password, location_description 
             FROM security_pos 
             WHERE code = $1 AND status = 'active'`,
            [pos_code],
        );

        if (posResult.rows.length === 0) {
            console.log(`[Security App Login] Pos not found: ${pos_code}`);
            return res.status(404).json({
                success: false,
                error: 'Kode pos tidak ditemukan atau tidak aktif',
            });
        }

        const pos = posResult.rows[0];

        // 2. Verify pos password
        const isPasswordValid = await bcrypt.compare(password, pos.password);

        if (!isPasswordValid) {
            console.log(
                `[Security App Login] Invalid password for pos: ${pos_code}`,
            );
            return res.status(401).json({
                success: false,
                error: 'Password pos salah',
            });
        }

        console.log(`[Security App Login] Pos authenticated: ${pos.name}`);

        // 3. Get roster (jadwal) for current month
        const currentDate = new Date();
        const currentMonth = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            1,
        );

        // Get today's date for shift assignment (WIB timezone - UTC+7)
        const wibDate = new Date(currentDate.getTime() + 7 * 60 * 60 * 1000);
        const today = wibDate.toISOString().split('T')[0];

        console.log(`currentMonth: ${currentMonth}`);
        console.log(`today: ${today}`);

        const rosterResult = await pool.query(
            `SELECT 
                ra.id as assignment_id,
                ra.user_id,
                ra.pattern_id,
                u.name as security_name,
                u.phone,
                u.email,
                u.role,
                u.app_access,
                p.name as pattern_name,
                p.pattern_data,
                sa.shift_id as today_shift_id,
                s.id as shift_id,
                s.code as shift_code,
                s.name as shift_name,
                s.start_time as shift_start_time,
                s.end_time as shift_end_time,
                -- Check if user has active check-in (checked in but not checked out yet)
                -- This handles night shifts that cross midnight
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM attendance checkin
                        WHERE checkin.user_id = ra.user_id 
                        AND checkin.type = 'check_in'
                        AND NOT EXISTS (
                            SELECT 1 FROM attendance checkout
                            WHERE checkout.user_id = ra.user_id
                            AND checkout.type = 'check_out'
                            AND checkout.timestamp > checkin.timestamp
                        )
                        ORDER BY checkin.timestamp DESC
                        LIMIT 1
                    ) THEN true 
                    ELSE false 
                END as is_active,
                -- Get latest check-in time if active
                (
                    SELECT checkin.timestamp 
                    FROM attendance checkin
                    WHERE checkin.user_id = ra.user_id 
                    AND checkin.type = 'check_in'
                    AND NOT EXISTS (
                        SELECT 1 FROM attendance checkout
                        WHERE checkout.user_id = ra.user_id
                        AND checkout.type = 'check_out'
                        AND checkout.timestamp > checkin.timestamp
                    )
                    ORDER BY checkin.timestamp DESC 
                    LIMIT 1
                ) as check_in_time
             FROM roster_assignments ra
             JOIN users u ON u.id = ra.user_id
             JOIN patterns p ON p.id = ra.pattern_id
             LEFT JOIN shift_assignments sa ON sa.user_id = ra.user_id 
                AND sa.assignment_date = $2
             LEFT JOIN shifts s ON s.id = sa.shift_id
             WHERE ra.assignment_month = $1
               AND u.app_access = 'security'
               AND u.status = 'active'
             ORDER BY u.name`,
            [currentMonth, today],
        );

        console.log(
            `[Security App Login] Roster query returned ${rosterResult.rows.length} rows`,
        );
        console.log(`currentMonth value: ${currentMonth}`);
        console.log(
            '[Security App Login] Roster data:',
            JSON.stringify(rosterResult.rows, null, 2),
        );

        if (rosterResult.rows.length === 0) {
            console.log(
                `[Security App Login] No roster for month ${
                    currentMonth.toISOString().split('T')[0]
                }`,
            );
            return res.status(404).json({
                success: false,
                error: `Tidak ada jadwal security untuk bulan ini`,
                pos_info: {
                    id: pos.id,
                    code: pos.code,
                    name: pos.name,
                    location_description: pos.location_description,
                },
            });
        }

        console.log(
            `[Security App Login] Found ${rosterResult.rows.length} security(ies) in roster`,
        );

        // 4. Generate temporary pos token (untuk select security step)
        // today already defined above for shift query
        const posToken = jwt.sign(
            {
                type: 'pos_access',
                pos_id: pos.id,
                pos_code: pos.code,
                pos_name: pos.name,
                date: today,
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }, // 15 minutes untuk pilih security
        );

        // 5. Return pos info + roster
        res.json({
            success: true,
            message: `Berhasil login ke ${pos.name}`,
            data: {
                pos: {
                    id: pos.id,
                    code: pos.code,
                    name: pos.name,
                    location_description: pos.location_description,
                },
                roster: rosterResult.rows.map((r) => ({
                    assignment_id: r.assignment_id,
                    user_id: r.user_id,
                    name: r.security_name,
                    phone: r.phone,
                    pattern: {
                        id: r.pattern_id,
                        name: r.pattern_name,
                    },
                    shift: r.shift_id
                        ? {
                              id: r.shift_id,
                              code: r.shift_code,
                              name: r.shift_name,
                              start_time: r.shift_start_time,
                              end_time: r.shift_end_time,
                          }
                        : null,
                    is_active: r.is_active,
                    check_in_time: r.check_in_time,
                })),
                pos_token: posToken, // Untuk step berikutnya
            },
        });
    } catch (error) {
        console.error('[Security App Login] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Terjadi kesalahan saat login',
            details: error.message,
        });
    }
});

/**
 * POST /api/security-app/select-security
 * Pilih identity security dari roster dan start session
 *
 * Body:
 * {
 *   "pos_token": "eyJhbGc...",
 *   "user_id": 8,
 *   "assignment_id": 35
 * }
 */
router.post('/select-security', async (req, res) => {
    try {
        const { pos_token, user_id, assignment_id } = req.body;

        // Validation
        if (!pos_token || !user_id || !assignment_id) {
            return res.status(400).json({
                success: false,
                error: 'pos_token, user_id, dan assignment_id harus diisi',
            });
        }

        console.log(
            `[Select Security] user_id: ${user_id}, assignment: ${assignment_id}`,
        );

        // 1. Verify pos_token
        let posData;
        try {
            posData = jwt.verify(pos_token, process.env.JWT_SECRET);

            if (posData.type !== 'pos_access') {
                return res.status(401).json({
                    success: false,
                    error: 'Token tidak valid',
                });
            }
        } catch (err) {
            console.log('[Select Security] Invalid token:', err.message);
            return res.status(401).json({
                success: false,
                error: 'Token tidak valid atau sudah expired',
            });
        }

        console.log(`[Select Security] Pos verified: ${posData.pos_name}`);

        // 2. Verify user exists and is in shift assignments for today
        const userResult = await pool.query(
            `SELECT 
                sa.id as assignment_id,
                sa.user_id,
                sa.shift_id,
                u.name,
                u.phone,
                u.email,
                u.role,
                u.app_access,
                s.name as shift_name,
                s.start_time,
                s.end_time
             FROM shift_assignments sa
             JOIN users u ON u.id = sa.user_id
             JOIN shifts s ON s.id = sa.shift_id
             WHERE sa.id = $1
               AND sa.user_id = $2
               AND sa.assignment_date = CURRENT_DATE
               AND u.app_access = 'security'
               AND u.status = 'active'`,
            [assignment_id, user_id],
        );

        if (userResult.rows.length === 0) {
            console.log(
                `[Select Security] User ${user_id} not found in shift assignments`,
            );
            return res.status(404).json({
                success: false,
                error: 'Security tidak ditemukan dalam jadwal shift hari ini',
            });
        }

        const user = userResult.rows[0];
        console.log(`[Select Security] User verified: ${user.name}`);
        console.log(
            `[Select Security] Shift: ${user.shift_name} (${user.start_time} - ${user.end_time})`,
        );

        // 3. Check if user already has active session today at this pos
        const today = new Date().toISOString().split('T')[0];
        const existingSession = await pool.query(
            `SELECT id, session_start, status 
             FROM pos_sessions 
             WHERE user_id = $1 
               AND pos_id = $2
               AND DATE(session_start) = $3
               AND status = 'active'`,
            [user_id, posData.pos_id, today],
        );

        if (existingSession.rows.length > 0) {
            console.log(`[Select Security] User already has active session`);
            return res.status(400).json({
                success: false,
                error: 'Anda sudah memiliki sesi aktif hari ini di pos ini',
                session: existingSession.rows[0],
            });
        }

        // 4. Create pos_session
        const sessionResult = await pool.query(
            `INSERT INTO pos_sessions (
                pos_id,
                user_id,
                shift_assignment_id,
                session_start,
                status,
                notes
             ) VALUES ($1, $2, $3, NOW(), 'active', $4)
             RETURNING id, session_start`,
            [
                posData.pos_id,
                user_id,
                assignment_id,
                `Shift: ${user.shift_name} (${user.start_time}-${user.end_time})`,
            ],
        );

        const session = sessionResult.rows[0];
        console.log(`[Select Security] Session created: ${session.id}`);

        // 6. Generate full JWT token untuk authenticated session
        const accessToken = jwt.sign(
            {
                type: 'security_session',
                user_id: user_id,
                name: user.name,
                role: user.role,
                app_access: user.app_access,
                pos_id: posData.pos_id,
                pos_code: posData.pos_code,
                pos_name: posData.pos_name,
                session_id: session.id,
                assignment_id: assignment_id,
            },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }, // 12 hours untuk operational session
        );

        // 7. Return session data
        res.json({
            success: true,
            message: `Selamat datang, ${user.name}! Session dimulai.`,
            data: {
                user: {
                    id: user.user_id,
                    name: user.name,
                    phone: user.phone,
                    role: user.role,
                },
                pos: {
                    id: posData.pos_id,
                    code: posData.pos_code,
                    name: posData.pos_name,
                },
                session: {
                    id: session.id,
                    start_time: session.session_start,
                    status: 'active',
                    shift: currentShift,
                },
                pattern: {
                    id: user.pattern_id,
                    name: user.pattern_name,
                    current_shift: currentShift,
                },
                access_token: accessToken,
            },
        });
    } catch (error) {
        console.error('[Select Security] Error:', error);
        res.status(500).json({
            success: false,
            error: 'Terjadi kesalahan saat memilih security',
            details: error.message,
        });
    }
});

/**
 * GET /api/security-app/current-session
 * Get current active session info
 * Requires: authMiddleware + securityAppOnly
 */
router.get(
    '/current-session',
    authMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.user.user_id;

            console.log(`[Current Session] Checking for user: ${userId}`);

            // Get active session
            const sessionResult = await pool.query(
                `SELECT 
                ps.id,
                ps.pos_id,
                ps.user_id,
                ps.roster_assignment_id,
                ps.session_start,
                ps.status,
                ps.notes,
                sp.code as pos_code,
                sp.name as pos_name,
                u.name as user_name,
                ra.pattern_id,
                p.name as pattern_name
             FROM pos_sessions ps
             JOIN security_pos sp ON sp.id = ps.pos_id
             JOIN users u ON u.id = ps.user_id
             JOIN roster_assignments ra ON ra.id = ps.roster_assignment_id
             JOIN patterns p ON p.id = ra.pattern_id
             WHERE ps.user_id = $1
               AND ps.status = 'active'
               AND DATE(ps.session_start) = CURRENT_DATE
             ORDER BY ps.session_start DESC
             LIMIT 1`,
                [userId],
            );

            if (sessionResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tidak ada sesi aktif',
                });
            }

            const session = sessionResult.rows[0];

            res.json({
                success: true,
                data: {
                    session: {
                        id: session.id,
                        start_time: session.session_start,
                        status: session.status,
                        notes: session.notes,
                    },
                    user: {
                        id: session.user_id,
                        name: session.user_name,
                    },
                    pos: {
                        id: session.pos_id,
                        code: session.pos_code,
                        name: session.pos_name,
                    },
                    pattern: {
                        id: session.pattern_id,
                        name: session.pattern_name,
                    },
                },
            });
        } catch (error) {
            console.error('[Current Session] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat mengambil data sesi',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/end-session
 * End current active session (logout from pos)
 * Requires: authMiddleware + securityAppOnly
 */
router.post(
    '/end-session',
    authMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.user.user_id;
            const sessionId = req.user.session_id;

            console.log(`[End Session] User: ${userId}, Session: ${sessionId}`);

            // Update session to ended
            const result = await pool.query(
                `UPDATE pos_sessions 
             SET status = 'ended',
                 session_end = NOW(),
                 updated_at = NOW()
             WHERE id = $1 
               AND user_id = $2
               AND status = 'active'
             RETURNING id, session_start, session_end`,
                [sessionId, userId],
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Sesi tidak ditemukan atau sudah berakhir',
                });
            }

            const session = result.rows[0];
            const duration =
                new Date(session.session_end) - new Date(session.session_start);
            const hours = Math.floor(duration / (1000 * 60 * 60));
            const minutes = Math.floor(
                (duration % (1000 * 60 * 60)) / (1000 * 60),
            );

            console.log(
                `[End Session] Session ${sessionId} ended. Duration: ${hours}h ${minutes}m`,
            );

            res.json({
                success: true,
                message: 'Sesi berakhir. Terima kasih!',
                data: {
                    session_id: session.id,
                    start_time: session.session_start,
                    end_time: session.session_end,
                    duration: `${hours} jam ${minutes} menit`,
                },
            });
        } catch (error) {
            console.error('[End Session] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat mengakhiri sesi',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/check-in
 * Record attendance check-in
 * Requires: flexibleAuthMiddleware (support both access_token and pos_token)
 */
router.post(
    '/check-in',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.user.user_id;
            const posId = req.user.pos_id;
            const sessionId = req.user.session_id;
            const { latitude, longitude, notes } = req.body;

            console.log(`[Check-in] User: ${userId}, Session: ${sessionId}`);

            // Verify session is active
            const sessionCheck = await pool.query(
                `SELECT id, status FROM pos_sessions WHERE id = $1 AND user_id = $2 AND status = 'active'`,
                [sessionId, userId],
            );

            if (sessionCheck.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Sesi tidak aktif. Silakan login terlebih dahulu.',
                });
            }

            // Check if already checked in today
            const existingCheckIn = await pool.query(
                `SELECT id FROM attendance 
             WHERE user_id = $1 
               AND type = 'check_in'
               AND timestamp >= CURRENT_DATE
               AND timestamp < CURRENT_DATE + INTERVAL '1 day'`,
                [userId],
            );

            if (existingCheckIn.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Anda sudah melakukan check-in hari ini',
                });
            }

            // Create attendance record
            const attendanceResult = await pool.query(
                `INSERT INTO attendance (
                user_id,
                type,
                timestamp,
                location_lat,
                location_lng,
                pos_id,
                pos_session_id
             ) VALUES ($1, 'check_in', NOW(), $2, $3, $4, $5)
             RETURNING id, timestamp`,
                [userId, latitude, longitude, posId, sessionId],
            );

            const attendance = attendanceResult.rows[0];

            console.log(`[Check-in] Attendance created: ${attendance.id}`);

            res.json({
                success: true,
                message: 'Check-in berhasil!',
                data: {
                    attendance_id: attendance.id,
                    check_in_time: attendance.timestamp,
                },
            });
        } catch (error) {
            console.error('[Check-in] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat check-in',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/check-out
 * Record attendance check-out
 * Requires: flexibleAuthMiddleware (support both access_token and pos_token)
 */
router.post(
    '/check-out',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.user.user_id;
            const { latitude, longitude, notes } = req.body;

            console.log(`[Check-out] User: ${userId}`);

            // Find today's check-in record
            const posId = req.user.pos_id;
            const sessionId = req.user.session_id;

            const checkInResult = await pool.query(
                `SELECT id, timestamp as check_in_time 
             FROM attendance 
             WHERE user_id = $1 
               AND type = 'check_in'
               AND timestamp >= CURRENT_DATE
               AND timestamp < CURRENT_DATE + INTERVAL '1 day'
             ORDER BY timestamp DESC
             LIMIT 1`,
                [userId],
            );

            if (checkInResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tidak ada record check-in hari ini',
                });
            }

            const checkIn = checkInResult.rows[0];

            // Check if already checked out
            const existingCheckOut = await pool.query(
                `SELECT id FROM attendance 
             WHERE user_id = $1 
               AND type = 'check_out'
               AND timestamp >= CURRENT_DATE
               AND timestamp < CURRENT_DATE + INTERVAL '1 day'`,
                [userId],
            );

            if (existingCheckOut.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Anda sudah melakukan check-out hari ini',
                });
            }

            // Create check-out record
            const checkOutResult = await pool.query(
                `INSERT INTO attendance (
                user_id,
                type,
                timestamp,
                location_lat,
                location_lng,
                pos_id,
                pos_session_id
             ) VALUES ($1, 'check_out', NOW(), $2, $3, $4, $5)
             RETURNING id, timestamp as check_out_time`,
                [userId, latitude, longitude, posId, sessionId],
            );

            const checkOut = checkOutResult.rows[0];
            const duration =
                new Date(checkOut.check_out_time) -
                new Date(checkIn.check_in_time);
            const hours = Math.floor(duration / (1000 * 60 * 60));
            const minutes = Math.floor(
                (duration % (1000 * 60 * 60)) / (1000 * 60),
            );

            console.log(
                `[Check-out] Attendance created: ${checkOut.id}, Duration: ${hours}h ${minutes}m`,
            );

            res.json({
                success: true,
                message: 'Check-out berhasil!',
                data: {
                    attendance_id: checkOut.id,
                    check_in_time: checkIn.check_in_time,
                    check_out_time: checkOut.check_out_time,
                    duration: `${hours} jam ${minutes} menit`,
                },
            });
        } catch (error) {
            console.error('[Check-out] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat check-out',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/attendance-with-face
 * Record attendance with face recognition (auto-identify user)
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.post(
    '/attendance-with-face',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const { embedding, latitude, longitude, notes } = req.body;
            let type = req.body.type; // Use let so we can reassign for auto-switching

            console.log('[Attendance Face] === Request Debug ===');
            console.log(`[Attendance Face] Auth method: ${req.authMethod}`);
            console.log(`[Attendance Face] User object:`, req.user);
            console.log(`[Attendance Face] Headers:`, {
                'x-pos-token': req.headers['x-pos-token']
                    ? 'Present'
                    : 'Missing',
                authorization: req.headers.authorization
                    ? 'Present'
                    : 'Missing',
            });
            console.log(
                `[Attendance Face] Type: ${type}, Embedding length: ${embedding?.length}`,
            );
            console.log('[Attendance Face] === End Debug ===');

            if (!embedding || !Array.isArray(embedding)) {
                return res.status(400).json({
                    success: false,
                    error: 'Face embedding required',
                });
            }

            if (!['check_in', 'check_out'].includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid attendance type',
                });
            }

            // Get pos_id from auth (available from both pos_token and access_token)
            const posId = req.user.pos_id;

            // Find matching user by face embedding
            const embeddingString = JSON.stringify(embedding);

            // Get all active security users with embeddings scheduled today
            const usersResult = await pool.query(
                `SELECT DISTINCT u.id, u.name, ue.embedding, ue.created_at
                 FROM users u
                 INNER JOIN user_embeddings ue ON u.id = ue.user_id
                 INNER JOIN shift_assignments sa ON u.id = sa.user_id
                 WHERE u.role = 'security'
                   AND u.status = 'active'
                   AND u.app_access = 'security'
                   AND sa.assignment_date = CURRENT_DATE
                 ORDER BY ue.created_at DESC`,
                [],
            );

            if (usersResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tidak ada security terdaftar di pos ini',
                });
            }

            console.log(
                `[Attendance Face] Found ${usersResult.rows.length} security with embeddings at pos ${posId}`,
            );

            // Compare embedding with all registered faces
            let bestMatch = null;
            let highestSimilarity = 0;

            for (const user of usersResult.rows) {
                const storedEmbedding = user.embedding;
                const similarity = cosineSimilarity(embedding, storedEmbedding);

                console.log(
                    `[Attendance Face] User ${
                        user.name
                    }: similarity ${similarity.toFixed(4)}`,
                );

                if (similarity > highestSimilarity) {
                    highestSimilarity = similarity;
                    bestMatch = user;
                }
            }

            // Threshold for face recognition (80% confidence)
            const CONFIDENCE_THRESHOLD = 0.8;
            const confidence = highestSimilarity * 100;

            if (highestSimilarity < CONFIDENCE_THRESHOLD) {
                return res.status(400).json({
                    success: false,
                    error: 'Wajah tidak dikenali',
                    confidence: confidence.toFixed(1),
                    hint: 'Pastikan pencahayaan cukup dan wajah Anda sudah terdaftar',
                });
            }

            console.log(
                `[Attendance Face] Best match: ${
                    bestMatch.name
                } (${confidence.toFixed(1)}%)`,
            );

            const userId = bestMatch.id;

            // Get or create active session for this user at this pos
            console.log(
                `[Attendance Face] Checking active session for user ${userId} at pos ${posId}...`,
            );

            let sessionResult = await pool.query(
                `SELECT id FROM pos_sessions 
                 WHERE user_id = $1 AND pos_id = $2 AND status = 'active'
                 ORDER BY session_start DESC LIMIT 1`,
                [userId, posId],
            );

            console.log(
                `[Attendance Face] Active sessions found: ${sessionResult.rows.length}`,
            );

            let sessionId;

            if (sessionResult.rows.length === 0) {
                // No active session - create one automatically
                console.log(
                    `[Attendance Face] Creating new session for user ${userId} at pos ${posId}`,
                );

                // Get shift assignment for this user today
                const assignmentResult = await pool.query(
                    `SELECT id FROM shift_assignments 
                     WHERE user_id = $1 
                     AND assignment_date = CURRENT_DATE`,
                    [userId],
                );

                const assignmentId =
                    assignmentResult.rows.length > 0
                        ? assignmentResult.rows[0].id
                        : null;

                // Use ON CONFLICT to handle race condition
                const newSessionResult = await pool.query(
                    `INSERT INTO pos_sessions (
                        pos_id,
                        user_id,
                        shift_assignment_id,
                        session_start,
                        status,
                        notes
                     ) VALUES ($1, $2, $3, NOW(), 'active', 'Auto-created via face recognition')
                     ON CONFLICT ON CONSTRAINT idx_pos_sessions_active_unique 
                     DO UPDATE SET updated_at = NOW()
                     RETURNING id`,
                    [posId, userId, assignmentId],
                );

                sessionId = newSessionResult.rows[0].id;
                console.log(
                    `[Attendance Face] Session created/updated: ${sessionId}`,
                );
            } else {
                sessionId = sessionResult.rows[0].id;
                console.log(
                    `[Attendance Face] Using existing session: ${sessionId}`,
                );
            }

            // Auto-detect attendance type based on current status
            // Check if already checked in today
            const existingCheckIn = await pool.query(
                `SELECT id, timestamp as check_in_time FROM attendance 
                 WHERE user_id = $1 
                   AND type = 'check_in'
                   AND timestamp >= CURRENT_DATE
                   AND timestamp < CURRENT_DATE + INTERVAL '1 day'
                 ORDER BY timestamp DESC LIMIT 1`,
                [userId],
            );

            const alreadyCheckedIn = existingCheckIn.rows.length > 0;

            // Auto-switch: if already checked in, do check-out instead
            if (alreadyCheckedIn && type === 'check_in') {
                console.log(
                    `[Attendance Face] User ${userId} already checked in, auto-switching to check-out`,
                );
                type = 'check_out';
            }

            // Process attendance based on (possibly auto-adjusted) type
            if (type === 'check_in') {
                // This block only runs if NOT already checked in

                // Create check-in record
                const attendanceResult = await pool.query(
                    `INSERT INTO attendance (
                        user_id, type, timestamp, location_lat, location_lng,
                        pos_id, pos_session_id
                     ) VALUES ($1, 'check_in', NOW(), $2, $3, $4, $5)
                     RETURNING id, timestamp`,
                    [userId, latitude, longitude, posId, sessionId],
                );

                const attendance = attendanceResult.rows[0];

                res.json({
                    success: true,
                    message: 'Check-in berhasil!',
                    type: 'check_in',
                    confidence: parseFloat(confidence.toFixed(1)),
                    user_id: userId,
                    security_name: bestMatch.name,
                    data: {
                        attendance_id: attendance.id,
                        check_time: attendance.timestamp,
                        location: latitude && longitude ? 'GPS' : 'Unknown',
                    },
                });
            } else {
                // Check-out
                const checkInResult = await pool.query(
                    `SELECT id, timestamp as check_in_time 
                     FROM attendance 
                     WHERE user_id = $1 
                       AND type = 'check_in'
                       AND timestamp >= CURRENT_DATE
                       AND timestamp < CURRENT_DATE + INTERVAL '1 day'
                     ORDER BY timestamp DESC LIMIT 1`,
                    [userId],
                );

                if (checkInResult.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: 'Tidak ada record check-in hari ini',
                    });
                }

                // Check if already checked out
                const existingCheckOut = await pool.query(
                    `SELECT id FROM attendance 
                     WHERE user_id = $1 
                       AND type = 'check_out'
                       AND timestamp >= CURRENT_DATE
                       AND timestamp < CURRENT_DATE + INTERVAL '1 day'`,
                    [userId],
                );

                if (existingCheckOut.rows.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Anda sudah melakukan check-out hari ini',
                    });
                }

                // Create check-out record
                const checkOutResult = await pool.query(
                    `INSERT INTO attendance (
                        user_id, type, timestamp, location_lat, location_lng,
                        pos_id, pos_session_id
                     ) VALUES ($1, 'check_out', NOW(), $2, $3, $4, $5)
                     RETURNING id, timestamp as check_out_time`,
                    [userId, latitude, longitude, posId, sessionId],
                );

                const checkOut = checkOutResult.rows[0];
                const checkIn = checkInResult.rows[0];

                // Calculate duration
                const duration =
                    new Date(checkOut.check_out_time) -
                    new Date(checkIn.check_in_time);
                const hours = Math.floor(duration / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (duration % (1000 * 60 * 60)) / (1000 * 60),
                );

                res.json({
                    success: true,
                    message: 'Check-out berhasil!',
                    type: 'check_out',
                    confidence: parseFloat(confidence.toFixed(1)),
                    user_id: userId,
                    security_name: bestMatch.name,
                    data: {
                        attendance_id: checkOut.id,
                        check_in_time: checkIn.check_in_time,
                        check_out_time: checkOut.check_out_time,
                        check_time: checkOut.check_out_time,
                        duration: `${hours} jam ${minutes} menit`,
                        location: latitude && longitude ? 'GPS' : 'Unknown',
                    },
                });
            }
        } catch (error) {
            console.error('[Attendance Face] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat memproses attendance',
                details: error.message,
            });
        }
    },
);

// Helper function: Cosine similarity
function cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (normA * normB);
}

/**
 * ========================================
 * PATROL ROUTES
 * ========================================
 */

/**
 * POST /api/security-app/patrol/start
 * Start new patrol session dengan GPS tracking
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.post(
    '/patrol/start',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const { user_id, start_lat, start_lng, post_session_id } = req.body;

            // Validation
            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: 'user_id harus diisi',
                });
            }

            if (!start_lat || !start_lng) {
                return res.status(400).json({
                    success: false,
                    error: 'Lokasi GPS (start_lat, start_lng) harus diisi',
                });
            }

            const userId = parseInt(user_id);
            console.log(
                `[Patrol Start] User ${userId} requesting patrol start`,
            );

            // VALIDASI: User harus sudah check-in (sedang bertugas)
            // Cek dari attendance table - user sudah check-in tapi belum check-out
            // Support night shifts that cross midnight
            const activeAttendanceResult = await pool.query(
                `SELECT 
                    a.id as attendance_id,
                    a.pos_session_id,
                    a.timestamp as check_in_time,
                    u.name as user_name,
                    p.name as pos_name,
                    p.id as pos_id
                 FROM attendance a
                 JOIN users u ON u.id = a.user_id
                 LEFT JOIN pos_sessions ps ON ps.id = a.pos_session_id
                 LEFT JOIN security_pos p ON p.id = ps.pos_id
                 WHERE a.user_id = $1 
                   AND a.type = 'check_in'
                   AND NOT EXISTS (
                       SELECT 1 FROM attendance checkout
                       WHERE checkout.user_id = a.user_id 
                         AND checkout.type = 'check_out'
                         AND checkout.timestamp > a.timestamp
                   )
                 ORDER BY a.timestamp DESC 
                 LIMIT 1`,
                [userId],
            );

            if (activeAttendanceResult.rows.length === 0) {
                console.log(
                    `[Patrol Start] User ${userId} belum check-in atau sudah check-out`,
                );
                return res.status(403).json({
                    success: false,
                    error: 'Anda belum check-in atau sudah check-out. Silakan check-in terlebih dahulu untuk memulai patroli.',
                });
            }

            const activeAttendance = activeAttendanceResult.rows[0];
            console.log(
                `[Patrol Start] User ${activeAttendance.user_name} verified as on-duty (checked in at ${activeAttendance.check_in_time})`,
            );

            // If using pos_token, verify it's for the same pos
            if (
                req.user.pos_id &&
                activeAttendance.pos_id &&
                req.user.pos_id !== activeAttendance.pos_id
            ) {
                return res.status(403).json({
                    success: false,
                    error: 'Token pos tidak sesuai dengan pos check-in Anda.',
                });
            }

            console.log(`[Patrol Start] User ${userId} starting patrol`);

            // Check if user already has active patrol
            const activePatrolCheck = await pool.query(
                `SELECT id FROM patrol_sessions 
             WHERE user_id = $1 AND status = 'active'
             LIMIT 1`,
                [userId],
            );

            if (activePatrolCheck.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Anda masih memiliki patroli aktif. Selesaikan patroli sebelumnya terlebih dahulu.',
                });
            }

            // Create new patrol session
            const patrolResult = await pool.query(
                `INSERT INTO patrol_sessions (
                user_id, post_session_id, start_lat, start_lng, status
             ) VALUES ($1, $2, $3, $4, 'active')
             RETURNING id, start_time`,
                [userId, post_session_id || null, start_lat, start_lng],
            );

            const patrolSessionId = patrolResult.rows[0].id;
            const startTime = patrolResult.rows[0].start_time;

            // Get all blocks for geofencing
            const blocksResult = await pool.query(
                `SELECT id, name, location_lat as latitude, location_lng as longitude
             FROM blocks
             WHERE status = 'active'
             ORDER BY name`,
            );

            console.log(
                `[Patrol Start] Session ${patrolSessionId} created for user ${userId}`,
            );

            res.json({
                success: true,
                message: 'Patroli dimulai',
                data: {
                    patrol_session_id: patrolSessionId,
                    user_id: userId,
                    start_time: startTime,
                    blocks: blocksResult.rows.map((block) => ({
                        id: block.id,
                        name: block.name,
                        latitude: parseFloat(block.latitude),
                        longitude: parseFloat(block.longitude),
                        radius: 50, // Default 50 meter radius
                    })),
                },
            });
        } catch (error) {
            console.error('[Patrol Start] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat memulai patroli',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/patrol/complete
 * Complete active patrol session
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.post(
    '/patrol/complete',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.userId;
            const { end_lat, end_lng, notes } = req.body;

            // Validation
            if (!end_lat || !end_lng) {
                return res.status(400).json({
                    success: false,
                    error: 'Lokasi GPS (end_lat, end_lng) harus diisi',
                });
            }

            console.log(`[Patrol Complete] User ${userId} completing patrol`);

            // Get active patrol session
            const patrolResult = await pool.query(
                `SELECT id, start_time 
             FROM patrol_sessions 
             WHERE user_id = $1 AND status = 'active'
             LIMIT 1`,
                [userId],
            );

            if (patrolResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tidak ada patroli aktif',
                });
            }

            const patrolSession = patrolResult.rows[0];
            const patrolSessionId = patrolSession.id;
            const startTime = new Date(patrolSession.start_time);
            const endTime = new Date();
            const durationSeconds = Math.floor((endTime - startTime) / 1000);

            // Get statistics
            const checkpointsCount = await pool.query(
                `SELECT COUNT(*) as count FROM patrol_checkpoints WHERE patrol_session_id = $1`,
                [patrolSessionId],
            );

            const trackPointsCount = await pool.query(
                `SELECT COUNT(*) as count FROM patrol_track_points WHERE patrol_session_id = $1`,
                [patrolSessionId],
            );

            // Update patrol session
            await pool.query(
                `UPDATE patrol_sessions 
             SET status = 'completed',
                 end_time = NOW(),
                 end_lat = $1,
                 end_lng = $2,
                 notes = $3,
                 total_duration_seconds = $4,
                 total_checkpoints = $5,
                 total_track_points = $6,
                 updated_at = NOW()
             WHERE id = $7`,
                [
                    end_lat,
                    end_lng,
                    notes || null,
                    durationSeconds,
                    checkpointsCount.rows[0].count,
                    trackPointsCount.rows[0].count,
                    patrolSessionId,
                ],
            );

            console.log(
                `[Patrol Complete] Session ${patrolSessionId} completed`,
            );

            res.json({
                success: true,
                message: 'Patroli selesai',
                statistics: {
                    total_duration_seconds: durationSeconds,
                    total_checkpoints: parseInt(checkpointsCount.rows[0].count),
                    total_track_points: parseInt(
                        trackPointsCount.rows[0].count,
                    ),
                },
            });
        } catch (error) {
            console.error('[Patrol Complete] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat menyelesaikan patroli',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/patrol/sync-tracks
 * Sync GPS track points (offline support)
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.post(
    '/patrol/sync-tracks',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.userId;
            const { track_points } = req.body;

            if (
                !track_points ||
                !Array.isArray(track_points) ||
                track_points.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'track_points harus berupa array dan tidak boleh kosong',
                });
            }

            // Get active patrol session
            const patrolResult = await pool.query(
                `SELECT id FROM patrol_sessions 
             WHERE user_id = $1 AND status = 'active'
             LIMIT 1`,
                [userId],
            );

            if (patrolResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tidak ada patroli aktif',
                });
            }

            const patrolSessionId = patrolResult.rows[0].id;

            // Batch insert track points
            const values = track_points
                .map((point, index) => {
                    const offset = index * 6;
                    return `($1, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
                })
                .join(', ');

            const params = [patrolSessionId];
            track_points.forEach((point) => {
                params.push(
                    point.latitude,
                    point.longitude,
                    point.accuracy || null,
                    point.speed || null,
                    point.timestamp,
                );
            });

            await pool.query(
                `INSERT INTO patrol_track_points 
                (patrol_session_id, latitude, longitude, accuracy, speed, timestamp)
             VALUES ${values}`,
                params,
            );

            console.log(
                `[Patrol Sync Tracks] Synced ${track_points.length} track points for session ${patrolSessionId}`,
            );

            res.json({
                success: true,
                message: 'Track points berhasil disinkronkan',
                synced_count: track_points.length,
            });
        } catch (error) {
            console.error('[Patrol Sync Tracks] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat menyinkronkan track points',
                details: error.message,
            });
        }
    },
);

/**
 * POST /api/security-app/patrol/sync-checkpoints
 * Sync patrol checkpoints (offline support)
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.post(
    '/patrol/sync-checkpoints',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.userId;
            const { checkpoints } = req.body;

            if (
                !checkpoints ||
                !Array.isArray(checkpoints) ||
                checkpoints.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: 'checkpoints harus berupa array dan tidak boleh kosong',
                });
            }

            // Get active patrol session
            const patrolResult = await pool.query(
                `SELECT id FROM patrol_sessions 
             WHERE user_id = $1 AND status = 'active'
             LIMIT 1`,
                [userId],
            );

            if (patrolResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Tidak ada patroli aktif',
                });
            }

            const patrolSessionId = patrolResult.rows[0].id;

            // Insert checkpoints one by one (to handle conflicts)
            let syncedCount = 0;
            for (const checkpoint of checkpoints) {
                try {
                    await pool.query(
                        `INSERT INTO patrol_checkpoints 
                        (patrol_session_id, block_id, block_name, latitude, longitude, 
                         entered_at, exited_at, dwell_seconds)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [
                            patrolSessionId,
                            checkpoint.block_id || null,
                            checkpoint.block_name,
                            checkpoint.latitude,
                            checkpoint.longitude,
                            checkpoint.entered_at,
                            checkpoint.exited_at || null,
                            checkpoint.dwell_seconds || 0,
                        ],
                    );
                    syncedCount++;
                } catch (insertError) {
                    console.error(
                        `[Patrol Sync Checkpoints] Error inserting checkpoint:`,
                        insertError,
                    );
                    // Continue with next checkpoint
                }
            }

            console.log(
                `[Patrol Sync Checkpoints] Synced ${syncedCount}/${checkpoints.length} checkpoints for session ${patrolSessionId}`,
            );

            res.json({
                success: true,
                message: 'Checkpoints berhasil disinkronkan',
                synced_count: syncedCount,
                total_count: checkpoints.length,
            });
        } catch (error) {
            console.error('[Patrol Sync Checkpoints] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat menyinkronkan checkpoints',
                details: error.message,
            });
        }
    },
);

/**
 * GET /api/security-app/patrol/history
 * Get patrol history for current user
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.get(
    '/patrol/history',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.userId;
            const { limit = 20, offset = 0 } = req.query;

            const patrolHistory = await pool.query(
                `SELECT 
                id,
                start_time,
                end_time,
                status,
                total_duration_seconds,
                total_checkpoints,
                total_track_points,
                notes
             FROM patrol_sessions
             WHERE user_id = $1
             ORDER BY start_time DESC
             LIMIT $2 OFFSET $3`,
                [userId, limit, offset],
            );

            res.json({
                success: true,
                patrols: patrolHistory.rows,
            });
        } catch (error) {
            console.error('[Patrol History] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat mengambil riwayat patroli',
                details: error.message,
            });
        }
    },
);

/**
 * GET /api/security-app/patrol/current
 * Get current active patrol session
 * Requires: flexibleAuthMiddleware (support pos_token or access_token)
 */
router.get(
    '/patrol/current',
    flexibleAuthMiddleware,
    securityAppOnly,
    async (req, res) => {
        try {
            const userId = req.userId;

            const patrolResult = await pool.query(
                `SELECT 
                id,
                start_time,
                start_lat,
                start_lng,
                status
             FROM patrol_sessions
             WHERE user_id = $1 AND status = 'active'
             LIMIT 1`,
                [userId],
            );

            if (patrolResult.rows.length === 0) {
                return res.json({
                    success: true,
                    has_active_patrol: false,
                });
            }

            const patrol = patrolResult.rows[0];

            // Get checkpoints
            const checkpoints = await pool.query(
                `SELECT * FROM patrol_checkpoints 
             WHERE patrol_session_id = $1
             ORDER BY entered_at`,
                [patrol.id],
            );

            res.json({
                success: true,
                has_active_patrol: true,
                patrol: {
                    ...patrol,
                    checkpoints: checkpoints.rows,
                },
            });
        } catch (error) {
            console.error('[Patrol Current] Error:', error);
            res.status(500).json({
                success: false,
                error: 'Terjadi kesalahan saat mengambil patroli aktif',
                details: error.message,
            });
        }
    },
);

module.exports = router;
