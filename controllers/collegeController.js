const db = require('../config/db');
const { logActivity } = require('./activityLogController');

// List all colleges with stats
exports.getAllColleges = async (req, res) => {
    try {
        const [colleges] = await db.query(`
            SELECT 
                c.*,
                (SELECT COUNT(*) FROM inquiries WHERE college_id = c.id) as total_inquiries,
                (SELECT COUNT(*) FROM college_admins WHERE college_id = c.id) as active_admins,
                (SELECT SUM(amount) FROM fees_collection fc JOIN inquiries i ON fc.inquiry_id = i.id WHERE i.college_id = c.id) as total_fees_collected
            FROM colleges c 
            ORDER BY c.created_at DESC
        `);
        
        // Map stats into a consistent object
        const formattedColleges = colleges.map(c => ({
            ...c,
            stats: {
                total_inquiries: c.total_inquiries || 0,
                active_admins: c.active_admins || 0,
                total_fees_collected: c.total_fees_collected || 0
            }
        }));

        res.json({ success: true, data: formattedColleges });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get single college detailed stats
exports.getCollegeDetails = async (req, res) => {
    try {
        const { id } = req.params;
        
        // College basic info
        const [colleges] = await db.query('SELECT * FROM colleges WHERE id = ?', [id]);
        if (colleges.length === 0) {
            return res.status(404).json({ message: 'College not found' });
        }
        
        const college = colleges[0];

        // Inquiry stats
        const [inquiryStats] = await db.query(`
            SELECT 
                status, 
                COUNT(*) as count 
            FROM inquiries 
            WHERE college_id = ? 
            GROUP BY status
        `, [id]);

        // Fees collection stats (Assuming a fees_collection table exists or we need to create it)
        const [feesStats] = await db.query(`
            SELECT 
                SUM(amount) as total_collected,
                COUNT(DISTINCT inquiry_id) as paid_students
            FROM fees_collection fc
            JOIN inquiries i ON fc.inquiry_id = i.id
            WHERE i.college_id = ?
        `, [id]);

        // Recent activity for this college
        const [recentActivity] = await db.query(`
            SELECT al.* 
            FROM activity_logs al
            JOIN college_admins ca ON al.system_user_id = ca.system_user_id
            WHERE ca.college_id = ?
            ORDER BY al.created_at DESC
            LIMIT 10
        `, [id]);

        res.json({
            success: true,
            data: {
                college,
                stats: {
                    inquiries: inquiryStats,
                    fees: feesStats[0] || { total_collected: 0, paid_students: 0 }
                },
                activity: recentActivity
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Create a new college (Super Admin only)
exports.createCollege = async (req, res) => {
    const { name, project_name, address } = req.body;

    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const [result] = await db.query(
            'INSERT INTO colleges (name, project_name, address) VALUES (?, ?, ?)',
            [name, project_name, address]
        );

        // Log activity
        await logActivity(
            req.user.system_user_id,
            'SUPER_ADMIN',
            req.user.username,
            'CREATE_COLLEGE',
            `Created new college: ${name} (${project_name})`,
            req
        );

        res.json({ success: true, message: 'College created successfully', college_id: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Update college
exports.updateCollege = async (req, res) => {
    const { id } = req.params;
    const { name, project_name, address } = req.body;

    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const [result] = await db.query(
            'UPDATE colleges SET name = ?, project_name = ?, address = ? WHERE id = ?',
            [name, project_name, address, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'College not found' });
        }

        // Log activity
        await logActivity(
            req.user.system_user_id,
            'SUPER_ADMIN',
            req.user.username,
            'UPDATE_COLLEGE',
            `Updated college: ${name}`,
            req
        );

        res.json({ success: true, message: 'College updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Delete college
exports.deleteCollege = async (req, res) => {
    const { id } = req.params;

    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Get college name before deletion
        const [college] = await db.query('SELECT name FROM colleges WHERE id = ?', [id]);
        if (college.length === 0) {
            return res.status(404).json({ message: 'College not found' });
        }

        await db.query('DELETE FROM colleges WHERE id = ?', [id]);

        // Log activity
        await logActivity(
            req.user.system_user_id,
            'SUPER_ADMIN',
            req.user.username,
            'DELETE_COLLEGE',
            `Deleted college: ${college[0].name}`,
            req
        );

        res.json({ success: true, message: 'College deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
