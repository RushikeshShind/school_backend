const db = require('../config/db');

// Helper function to log activities
exports.logActivity = async (systemUserId, userType, username, action, description = null, req = null) => {
    try {
        const ipAddress = req ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress || null) : null;
        const userAgent = req ? (req.headers['user-agent'] || null) : null;

        await db.query(
            `INSERT INTO activity_logs (system_user_id, user_type, username, action, description, ip_address, user_agent) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [systemUserId, userType, username, action, description, ipAddress, userAgent]
        );
    } catch (error) {
        console.error('Activity logging failed:', error);
        // Don't throw error - logging failure should not break the main flow
    }
};

// Get all activity logs (Super Admin only)
exports.getActivityLogs = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { date, system_user_id, action, limit = 100 } = req.query;

        let query = 'SELECT * FROM activity_logs WHERE 1=1';
        const params = [];

        if (date) {
            query += ' AND DATE(created_at) = ?';
            params.push(date);
        }

        if (system_user_id) {
            query += ' AND system_user_id = ?';
            params.push(system_user_id);
        }

        if (action) {
            query += ' AND action = ?';
            params.push(action);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const [logs] = await db.query(query, params);
        res.json({ success: true, data: logs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get activity summary by date
exports.getActivitySummary = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { start_date, end_date } = req.query;

        let query = `
            SELECT 
                DATE(created_at) as date,
                action,
                COUNT(*) as count
            FROM activity_logs
        `;

        const params = [];

        if (start_date && end_date) {
            query += ' WHERE DATE(created_at) BETWEEN ? AND ?';
            params.push(start_date, end_date);
        } else if (start_date) {
            query += ' WHERE DATE(created_at) >= ?';
            params.push(start_date);
        }

        query += ' GROUP BY DATE(created_at), action ORDER BY date DESC, action';

        const [summary] = await db.query(query, params);
        res.json({ success: true, data: summary });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get user-specific activity logs
exports.getUserActivityLogs = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const { system_user_id } = req.params;
        const { limit = 50 } = req.query;

        const [logs] = await db.query(
            'SELECT * FROM activity_logs WHERE system_user_id = ? ORDER BY created_at DESC LIMIT ?',
            [system_user_id, parseInt(limit)]
        );

        res.json({ success: true, data: logs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
