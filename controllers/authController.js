const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { logActivity } = require('./activityLogController');

exports.login = async (req, res) => {
    const { username, password, role } = req.body; // role: 'SUPER_ADMIN' or 'ADMIN'

    try {
        if (role === 'SUPER_ADMIN') {
            const [rows] = await db.query('SELECT * FROM super_admins WHERE username = ?', [username]);
            if (rows.length === 0) return res.status(401).json({ message: 'Invalid Credentials' });
            
            const admin = rows[0];
            // Mock hash check for demo: if (password !== admin.password_hash) ...

            // Update last login
            await db.query('UPDATE super_admins SET last_login_at = NOW() WHERE id = ?', [admin.id]);

            // Log activity
            await logActivity(admin.system_user_id, 'SUPER_ADMIN', admin.username, 'LOGIN', `Super Admin logged in`, req);

            const token = jwt.sign({ 
                id: admin.id, 
                system_user_id: admin.system_user_id,
                role: 'SUPER_ADMIN',
                username: admin.username,
                full_name: admin.full_name
            }, process.env.JWT_SECRET, { expiresIn: '1d' });
            
            return res.json({ 
                success: true, 
                token, 
                role: 'SUPER_ADMIN',
                system_user_id: admin.system_user_id,
                username: admin.username,
                full_name: admin.full_name,
                photo_url: admin.photo_url
            });

        } else if (role === 'ADMIN') {
            const [rows] = await db.query('SELECT * FROM college_admins WHERE username = ?', [username]);
            if (rows.length === 0) return res.status(401).json({ message: 'Invalid Credentials' });

            const admin = rows[0];
            
            // Check if account is active
            if (admin.is_active === 0) {
                return res.status(403).json({ message: 'Access Denied: Your account has been deactivated. Please contact Super Admin.' });
            }

            // Mock hash check

            // Update last login
            await db.query('UPDATE college_admins SET last_login_at = NOW() WHERE id = ?', [admin.id]);

            // Log activity
            await logActivity(admin.system_user_id, 'ADMIN', admin.username, 'LOGIN', `Admin logged in from college ID: ${admin.college_id}`, req);

            const token = jwt.sign({ 
                id: admin.id, 
                system_user_id: admin.system_user_id,
                role: 'ADMIN', 
                college_id: admin.college_id,
                username: admin.username,
                full_name: admin.full_name
            }, process.env.JWT_SECRET, { expiresIn: '1d' });
            
            return res.json({ 
                success: true, 
                token, 
                role: 'ADMIN', 
                college_id: admin.college_id,
                system_user_id: admin.system_user_id,
                username: admin.username,
                full_name: admin.full_name,
                photo_url: admin.photo_url
            });
        } else {
            return res.status(400).json({ message: 'Invalid Role' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.logout = async (req, res) => {
    try {
        const { id, role, system_user_id, username } = req.user;
        const table = role === 'SUPER_ADMIN' ? 'super_admins' : 'college_admins';
        
        await db.query(`UPDATE ${table} SET last_logout_at = NOW() WHERE id = ?`, [id]);
        
        // Log activity only if system_user_id exists (for backward compatibility with old tokens)
        if (system_user_id && username) {
            await logActivity(system_user_id, role, username, 'LOGOUT', `User logged out`, req);
        }
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
