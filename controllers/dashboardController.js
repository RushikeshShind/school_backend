const db = require('../config/db');

exports.getDashboardStats = async (req, res) => {
    const { role, college_id } = req.user;

    try {
        if (role === 'SUPER_ADMIN') {
            // Global Stats
            const [[{ count: totalInquiries }]] = await db.query('SELECT COUNT(*) as count FROM inquiries');
            const [statusCounts] = await db.query('SELECT status, COUNT(*) as count FROM inquiries GROUP BY status');
            const [collegeCounts] = await db.query('SELECT c.name, COUNT(i.id) as count FROM colleges c LEFT JOIN inquiries i ON c.id = i.college_id GROUP BY c.id');
            const [[{ count: totalAdmissions }]] = await db.query('SELECT COUNT(*) as count FROM admissions');

            res.json({
                success: true,
                data: {
                    total_inquiries: totalInquiries,
                    status_breakdown: statusCounts,
                    college_breakdown: collegeCounts,
                    total_admissions: totalAdmissions
                }
            });

        } else if (role === 'ADMIN') {
            // College Specific Stats
            const [[{ count: totalInquiries }]] = await db.query('SELECT COUNT(*) as count FROM inquiries WHERE college_id = ?', [college_id]);
            const [statusCounts] = await db.query('SELECT status, COUNT(*) as count FROM inquiries WHERE college_id = ? GROUP BY status', [college_id]);
            const [[{ count: totalAdmissions }]] = await db.query('SELECT COUNT(*) as count FROM admissions WHERE college_id = ?', [college_id]);

            res.json({
                success: true,
                data: {
                    total_inquiries: totalInquiries,
                    status_breakdown: statusCounts,
                    total_admissions: totalAdmissions
                }
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
