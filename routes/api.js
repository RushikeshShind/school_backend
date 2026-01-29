const router = require('express').Router();
const authController = require('../controllers/authController');
const inquiryController = require('../controllers/inquiryController');
const dashboardController = require('../controllers/dashboardController');
const adminUserController = require('../controllers/adminUserController');
const activityLogController = require('../controllers/activityLogController');
const collegeController = require('../controllers/collegeController');
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

// Public Routes
router.post('/login', authController.login);
router.post('/inquiry', inquiryController.submitInquiry);

// Protected Routes
router.post('/logout', authMiddleware, authController.logout);
// Inquiry Routes
router.get('/inquiries', authMiddleware, inquiryController.getAllInquiries);
router.get('/inquiries/:id', authMiddleware, inquiryController.getInquiryById);
router.post('/inquiries/:id/record-fee', authMiddleware, inquiryController.recordFee);
router.get('/inquiries/:id/fees', authMiddleware, inquiryController.getInquiryFees);
router.put('/inquiries/:id/status', authMiddleware, inquiryController.updateInquiryStatus);
router.get('/dashboard-stats', authMiddleware, inquiryController.getOverviewStats);

// Profile Routes
router.get('/profile', authMiddleware, profileController.getProfile); // This route was not in the provided edit block, but was in the original 'Profile Routes'
router.post('/profile/send-otp', authMiddleware, profileController.sendProfileOTP);
router.put('/profile', authMiddleware, profileController.updateProfile);
router.put('/profile/password', authMiddleware, profileController.changePassword);

// Super Admin Only: User Management
router.get('/admins', authMiddleware, adminUserController.getAllAdmins);
router.post('/admins', authMiddleware, adminUserController.createAdmin);
router.put('/admins/:id/status', authMiddleware, adminUserController.toggleAdminStatus);
router.delete('/admins/:id', authMiddleware, adminUserController.deleteAdmin);
router.get('/colleges', authMiddleware, adminUserController.getColleges);

// Super Admin Only: College Management
router.get('/colleges/all', authMiddleware, collegeController.getAllColleges);
router.get('/colleges/:id/details', authMiddleware, collegeController.getCollegeDetails);
router.post('/colleges', authMiddleware, collegeController.createCollege);
router.put('/colleges/:id', authMiddleware, collegeController.updateCollege);
router.delete('/colleges/:id', authMiddleware, collegeController.deleteCollege);

// Super Admin Only: Activity Logs
router.get('/activity-logs', authMiddleware, activityLogController.getActivityLogs);
router.get('/activity-logs/summary', authMiddleware, activityLogController.getActivitySummary);
router.get('/activity-logs/user/:system_user_id', authMiddleware, activityLogController.getUserActivityLogs);

module.exports = router;
