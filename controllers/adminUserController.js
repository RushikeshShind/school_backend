const db = require('../config/db');
const { logActivity } = require('./activityLogController');

// List all college admins (Super Admin only)
exports.getAllAdmins = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const [admins] = await db.query(`
            SELECT ca.id, ca.system_user_id, ca.username, ca.role, ca.role_id, ca.is_active, ca.last_login_at, ca.last_logout_at, ca.created_at,
            COALESCE(c.name, 'Unknown College') as college_name,
            r.name as role_name
            FROM college_admins ca
            LEFT JOIN colleges c ON ca.college_id = c.id
            LEFT JOIN roles r ON ca.role_id = r.id
            ORDER BY ca.created_at DESC
        `);

        res.json({ success: true, data: admins });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Create a new college admin
exports.createAdmin = async (req, res) => {
    const { username, password, college_id, role, full_name } = req.body;

    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Check if username already exists
        const [existing] = await db.query('SELECT id FROM college_admins WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Generate system_user_id
        const system_user_id = `ADM${Date.now()}${Math.floor(Math.random() * 1000)}`;

        // In production, hash the password
        const password_hash = password; 

        // Use provided full_name or fallback to username to satisfy DB constraint
        const nameToUse = full_name || username;

        await db.query(
            'INSERT INTO college_admins (system_user_id, username, password_hash, college_id, role, full_name) VALUES (?, ?, ?, ?, ?, ?)',
            [system_user_id, username, password_hash, college_id, role || 'ADMIN', nameToUse]
        );

        // Log activity only if current user has system_user_id (for backward compatibility)
        if (req.user.system_user_id && req.user.username) {
            await logActivity(
                req.user.system_user_id,
                'SUPER_ADMIN',
                req.user.username,
                'CREATE_USER',
                `Created new admin user: ${username} (${system_user_id})`,
                req
            );
        }

        res.json({ success: true, message: 'Admin created successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Update admin status (Active/Inactive)
exports.toggleAdminStatus = async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Get admin details before toggle
        const [admin] = await db.query('SELECT system_user_id, username FROM college_admins WHERE id = ?', [id]);
        if (admin.length === 0) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        await db.query('UPDATE college_admins SET is_active = ? WHERE id = ?', [is_active, id]);

        // Log activity only if current user has system_user_id
        if (req.user.system_user_id && req.user.username) {
            await logActivity(
                req.user.system_user_id,
                'SUPER_ADMIN',
                req.user.username,
                'TOGGLE_USER_STATUS',
                `${is_active ? 'Activated' : 'Deactivated'} admin user: ${admin[0].username} (${admin[0].system_user_id})`,
                req
            );
        }

        res.json({ success: true, message: `Admin account ${is_active ? 'activated' : 'deactivated'}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Delete an admin
exports.deleteAdmin = async (req, res) => {
    const { id } = req.params;

    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Get admin details before deletion
        const [admin] = await db.query('SELECT system_user_id, username FROM college_admins WHERE id = ?', [id]);
        if (admin.length === 0) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        await db.query('DELETE FROM college_admins WHERE id = ?', [id]);

        // Log activity only if current user has system_user_id
        if (req.user.system_user_id && req.user.username) {
            await logActivity(
                req.user.system_user_id,
                'SUPER_ADMIN',
                req.user.username,
                'DELETE_USER',
                `Deleted admin user: ${admin[0].username} (${admin[0].system_user_id})`,
                req
            );
        }

        res.json({ success: true, message: 'Admin deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get list of colleges for the dropdown
exports.getColleges = async (req, res) => {
    try {
        const [colleges] = await db.query('SELECT id, name FROM colleges');
        res.json({ success: true, data: colleges });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get stats for a specific admin (inquiry count, recent inquiries)
exports.getAdminStats = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

        const { system_user_id } = req.params;

        // Total inquiries created by this user
        const [[countRow]] = await db.query(
            'SELECT COUNT(*) as total FROM inquiries WHERE created_by_user_id = ?',
            [system_user_id]
        );

        // Status breakdown
        const [statusBreakdown] = await db.query(
            'SELECT status, COUNT(*) as count FROM inquiries WHERE created_by_user_id = ? GROUP BY status',
            [system_user_id]
        );

        // Recent 5 inquiries
        const [recent] = await db.query(
            'SELECT id, candidate_name, candidate_mobile, status, created_at FROM inquiries WHERE created_by_user_id = ? ORDER BY created_at DESC LIMIT 5',
            [system_user_id]
        );

        res.json({
            success: true,
            data: {
                total_inquiries: countRow.total,
                status_breakdown: statusBreakdown,
                recent_inquiries: recent
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
