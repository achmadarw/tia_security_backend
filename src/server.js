const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());

// CORS configuration with dynamic origin handling
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, Postman, etc.)
            if (!origin) return callback(null, true);

            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                console.log('CORS blocked origin:', origin);
                console.log('Allowed origins:', allowedOrigins);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    })
);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Explicit preflight handler for all routes
app.options('*', cors());

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'TIA Backend API is running',
        timestamp: new Date().toISOString(),
        cors_origins: allowedOrigins,
    });
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/reports', require('./routes/report.routes'));
app.use('/api/blocks', require('./routes/block.routes'));
app.use('/api/shifts', require('./routes/shift.routes'));
app.use('/api/shift-assignments', require('./routes/shift-assignments.routes'));
app.use('/api/face', require('./routes/face.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/audit', require('./routes/audit.routes'));

// TIA Security App Routes (Guards Only)
app.use('/api/security-app', require('./routes/security-app.routes'));

// New Pattern Library & Assignments API
app.use('/api/patterns', require('./routes/pattern.routes'));
app.use('/api/roster-assignments', require('./routes/assignment.routes'));
app.use('/api/roster', require('./routes/roster.routes'));

// Legacy roster patterns (keep for backward compatibility)
app.use('/api/roster-patterns', require('./routes/roster-pattern.routes'));

// One-time seed endpoint (REMOVE AFTER USE)
app.use('/api/seed', require('./routes/seed.routes'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 TIA Backend Server');
    console.log(`📡 Running on http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}\n`);
});

module.exports = app;
