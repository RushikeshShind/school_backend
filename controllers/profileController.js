const db = require('../config/db');
const { logActivity } = require('./activityLogController');
const axios = require('axios');

// Get user profile
exports.getProfile = async (req, res) => {
    try {
        const { id, role } = req.user;
        const table = role === 'SUPER_ADMIN' ? 'super_admins' : 'college_admins';
        
        let query = `SELECT id, system_user_id, username, full_name, dob, phone, photo_url, created_at, last_login_at, last_logout_at FROM ${table} WHERE id = ?`;
        const [rows] = await db.query(query, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        const user = rows[0];

        // If admin, also get college info
        if (role === 'ADMIN') {
            const [college] = await db.query('SELECT id, name, project_name FROM colleges WHERE id = (SELECT college_id FROM college_admins WHERE id = ?)', [id]);
            if (college.length > 0) {
                user.college = college[0];
            }
        }

        res.json({ success: true, data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Send OTP for profile update verification
exports.sendProfileOTP = async (req, res) => {
    try {
        const { phone } = req.body;
        let { system_user_id } = req.user;

        // Fallback for old tokens
        if (!system_user_id) {
            const table = req.user.role === 'SUPER_ADMIN' ? 'super_admins' : 'college_admins';
            const [user] = await db.query(`SELECT system_user_id FROM ${table} WHERE id = ?`, [req.user.id]);
            if (user.length > 0) system_user_id = user[0].system_user_id;
        }

        if (!system_user_id) {
            return res.status(400).json({ message: 'Session error: system_user_id missing. Please re-login.' });
        }

        if (!phone || phone.length !== 10) {
            return res.status(400).json({ message: 'Invalid phone number' });
        }

        // Generate local OTP (6 digits)
        const mockOTP = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP in database temporarily (expires in 5 minutes)
        await db.query(
            'INSERT INTO otp_verification (system_user_id, phone, otp, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE otp = ?, phone = ?, expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)',
            [system_user_id, phone, mockOTP, mockOTP, phone]
        );

        res.json({ 
            success: true, 
            message: 'OTP generated successfully',
            data: {
                message: 'OTP sent on your mobile for verification.',
                otp: mockOTP,
                mobile_no: phone
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Update user profile with OTP verification
exports.updateProfile = async (req, res) => {
    try {
        const { id, role, username } = req.user;
        let { system_user_id } = req.user;
        const { full_name, dob, phone, photo_url, otp } = req.body;
        const table = role === 'SUPER_ADMIN' ? 'super_admins' : 'college_admins';

        // Fallback for old tokens
        if (!system_user_id) {
            const [user] = await db.query(`SELECT system_user_id FROM ${table} WHERE id = ?`, [id]);
            if (user.length > 0) system_user_id = user[0].system_user_id;
        }

        if (!system_user_id) {
            return res.status(400).json({ message: 'Session error: system_user_id missing.' });
        }

        // Verify OTP
        const [otpRows] = await db.query(
            'SELECT * FROM otp_verification WHERE system_user_id = ? AND otp = ? AND expires_at > NOW()',
            [system_user_id, otp]
        );

        if (otpRows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Handle empty date strictly - convert to NULL
        const dobValue = (dob && String(dob).trim() !== '') ? dob : null;
        const photoValue = (photo_url && String(photo_url).trim() !== '') ? photo_url : null;

        const [result] = await db.query(
            `UPDATE ${table} SET full_name = ?, dob = ?, phone = ?, photo_url = ? WHERE id = ?`,
            [full_name, dobValue, phone, photoValue, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete used OTP
        await db.query('DELETE FROM otp_verification WHERE system_user_id = ?', [system_user_id]);

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'UPDATE_PROFILE',
            `Updated profile information`,
            req
        );

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Change password
exports.changePassword = async (req, res) => {
    try {
        const { id, role, system_user_id, username } = req.user;
        const { old_password, new_password } = req.body;
        const table = role === 'SUPER_ADMIN' ? 'super_admins' : 'college_admins';

        // In production, verify old password first
        // const [user] = await db.query(`SELECT password_hash FROM ${table} WHERE id = ?`, [id]);
        // if (!bcrypt.compareSync(old_password, user[0].password_hash)) {
        //     return res.status(401).json({ message: 'Incorrect old password' });
        // }

        // For now, just update (in production, hash the password)
        const [result] = await db.query(
            `UPDATE ${table} SET password_hash = ? WHERE id = ?`,
            [new_password, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'CHANGE_PASSWORD',
            `Changed password`,
            req
        );

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
