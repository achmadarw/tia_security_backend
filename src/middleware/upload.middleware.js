const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
['faces', 'photos', 'reports'].forEach((dir) => {
    const fullPath = path.join(uploadDir, dir);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
});

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = 'photos';
        // Use originalUrl or baseUrl to get the full path including /api/face
        const fullPath = req.originalUrl || req.baseUrl || req.path;
        if (fullPath.includes('face')) folder = 'faces';
        if (fullPath.includes('report')) folder = 'reports';

        cb(null, path.join(uploadDir, folder));
    },
    filename: (req, file, cb) => {
        // Check if filename already has descriptive format (from mobile app)
        // Format: face_<USER_ID>_<POSE_VARIATION>_<TIMESTAMP>.jpg
        if (file.originalname.startsWith('face_')) {
            // Use the descriptive name from mobile app
            cb(null, file.originalname);
        } else {
            // Fallback to UUID for other sources
            const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        }
    },
});

// File filter
const fileFilter = (req, file, cb) => {
    console.log('[Upload] File check:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
    });

    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(
        path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    // Allow if extension is valid (even if mimetype is missing/wrong)
    if (extname) {
        console.log('[Upload] File accepted:', file.originalname);
        return cb(null, true);
    }

    // Also check mimetype as fallback
    if (mimetype) {
        console.log('[Upload] File accepted (by mimetype):', file.originalname);
        return cb(null, true);
    }

    console.log('[Upload] File rejected:', file.originalname);
    cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    },
});

module.exports = upload;
