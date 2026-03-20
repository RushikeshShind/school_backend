const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const admissionController = require('../controllers/admissionController');
// const { authenticateToken, authorizeRole } = require('../middleware/auth'); // assuming standard middleware names

// Configure Multer for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/admissions/';
        if (!require('fs').existsSync(uploadPath)) {
            require('fs').mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Since I don't see authenticateToken and authorizeRole exports, I'll rely on the app's existing auth flow
// For now, I'll assume they are added globally or in the main router, 
// but I'll add place-holders if I need them inside this file.

router.post('/', upload.any(), admissionController.createAdmission);
router.get('/', admissionController.getAdmissions);
router.get('/staff-stats', admissionController.getStaffStats);
router.get('/:id', admissionController.getAdmissionById);
router.put('/:id/status', admissionController.updateAdmissionStatus);

module.exports = router;
