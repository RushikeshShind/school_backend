const db = require('../config/db');
const { logActivity } = require('./activityLogController');

exports.submitInquiry = async (req, res) => {
    try {
        const {
            college_id,
            candidate_name,
            candidate_mobile,
            candidate_email,
            parent_mobile,
            residential_address,
            twelfth_percentage,
            year_of_passing,
            twelfth_board,
            extra_details // New field for dynamic form data
        } = req.body;

        // Eligibility Logic
        let eligibility_status = 'PENDING';
        let status = 'NEW';

        if (!twelfth_percentage || twelfth_percentage < 35) {
            eligibility_status = 'NOT_ELIGIBLE';
            status = 'REJECTED';
        } else {
            eligibility_status = 'ELIGIBLE';
        }

        const [result] = await db.query(
            `INSERT INTO inquiries 
            (college_id, candidate_name, candidate_mobile, candidate_email, parent_mobile, residential_address, 
            twelfth_percentage, year_of_passing, twelfth_board, eligibility_status, status, extra_details) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [college_id, candidate_name, candidate_mobile, candidate_email, parent_mobile, residential_address,
                twelfth_percentage, year_of_passing, twelfth_board, eligibility_status, status, JSON.stringify(extra_details || {})]
        );

        res.status(201).json({
            success: true,
            message: 'Inquiry submitted successfully!',
            inquiry_id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.adminCreateInquiry = async (req, res) => {
    try {
        const {
            college_id, // For Super Admin
            candidate_name,
            candidate_mobile,
            candidate_email,
            parent_mobile,
            residential_address,
            twelfth_percentage,
            year_of_passing,
            twelfth_board,
            admin_notes,
            extra_details // New field
        } = req.body;

        const { system_user_id, role, username, college_id: user_college_id } = req.user;
        let final_college_id = college_id || user_college_id;

        // If regular ADMIN, they can't override their college_id
        if (role === 'ADMIN') {
            final_college_id = user_college_id;
        }

        if (!final_college_id) {
            return res.status(400).json({ success: false, message: 'College ID is required' });
        }

        // Eligibility Logic
        let eligibility_status = 'PENDING';
        let status = 'NEW';

        if (twelfth_percentage && twelfth_percentage < 35) {
            eligibility_status = 'NOT_ELIGIBLE';
            status = 'REJECTED';
        } else if (twelfth_percentage) {
            eligibility_status = 'ELIGIBLE';
        }

        const creatorName = req.user.full_name || req.user.username || username;

        const [result] = await db.query(
            `INSERT INTO inquiries
            (college_id, candidate_name, candidate_mobile, candidate_email, parent_mobile, residential_address,
            twelfth_percentage, year_of_passing, twelfth_board, eligibility_status, status, admin_notes, extra_details,
            created_by_user_id, created_by_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [final_college_id, candidate_name, candidate_mobile, candidate_email, parent_mobile, residential_address,
                twelfth_percentage, year_of_passing, twelfth_board, eligibility_status, status, admin_notes, JSON.stringify(extra_details || {}),
                system_user_id, creatorName]
        );

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'CREATE_INQUIRY',
            `Manually created inquiry for student: ${candidate_name} (ID: ${result.insertId})`,
            req
        );

        res.status(201).json({
            success: true,
            message: 'Inquiry created successfully by admin!',
            inquiry_id: result.insertId
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getAllInquiries = async (req, res) => {
    // Admin View
    try {
        // Assume middleware adds user info to req.user
        const { college_id, role } = req.user;

        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        let query = 'SELECT i.*, i.created_by_name, i.created_by_user_id FROM inquiries i';
        let params = [];

        if (role === 'ADMIN') {
            query += ' WHERE i.college_id = ?';
            params.push(college_id);
        }

        query += ' ORDER BY i.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getInquiryById = async (req, res) => {
    try {
        const { id } = req.params;
        const { college_id, role } = req.user;

        const [rows] = await db.query('SELECT * FROM inquiries WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Inquiry not found' });
        }

        const inquiry = rows[0];

        // Access check
        if (role === 'ADMIN' && inquiry.college_id !== college_id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        res.json({ success: true, data: inquiry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getOverviewStats = async (req, res) => {
    try {
        const { college_id, role } = req.user;
        let query = 'SELECT status, COUNT(*) as count FROM inquiries';
        let params = [];

        if (role !== 'SUPER_ADMIN') {
            query += ' WHERE college_id = ?';
            params.push(college_id);
        }

        query += ' GROUP BY status';
        const [rows] = await db.query(query, params);

        // Calculate totals for response summary
        const total_inquiries = rows.reduce((acc, curr) => acc + curr.count, 0);
        const total_admissions = rows
            .filter(r => r.status === 'ENROLLED' || r.status === 'ACCEPTED')
            .reduce((acc, curr) => acc + curr.count, 0);

        res.json({
            success: true,
            data: {
                total_inquiries,
                total_admissions,
                status_breakdown: rows
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Record fee collection
exports.recordFee = async (req, res) => {
    try {
        const { inquiry_id, amount, payment_mode, remarks, transaction_id } = req.body;
        const { system_user_id, role, username } = req.user;

        // Verify inquiry exists and belongs to the same college (if not super admin)
        const [inquiry] = await db.query('SELECT college_id, candidate_name FROM inquiries WHERE id = ?', [inquiry_id]);
        if (inquiry.length === 0) {
            return res.status(404).json({ message: 'Inquiry not found' });
        }

        if (role !== 'SUPER_ADMIN') {
            const [admin] = await db.query('SELECT college_id FROM college_admins WHERE system_user_id = ?', [system_user_id]);
            if (admin[0].college_id !== inquiry[0].college_id) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        await db.query(
            'INSERT INTO fees_collection (inquiry_id, amount, payment_mode, transaction_id, remarks) VALUES (?, ?, ?, ?, ?)',
            [inquiry_id, amount, payment_mode, transaction_id, remarks]
        );

        // Update inquiry status to ENROLLED if a significant payment is made (optional logic)
        // await db.query("UPDATE inquiries SET status = 'ENROLLED' WHERE id = ?", [inquiry_id]);

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'COLLECT_FEE',
            `Collected ₹${amount} from student: ${inquiry[0].candidate_name} (ID: ${inquiry_id})`,
            req
        );

        res.json({ success: true, message: 'Fee recorded successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Get fees for an inquiry
exports.getInquiryFees = async (req, res) => {
    try {
        const { id } = req.params;
        const [fees] = await db.query('SELECT * FROM fees_collection WHERE inquiry_id = ? ORDER BY payment_date DESC', [id]);
        res.json({ success: true, data: fees });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateInquiryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;
        const { system_user_id, username, role } = req.user;

        // Get inquiry details before update
        const [inquiry] = await db.query('SELECT * FROM inquiries WHERE id = ?', [id]);
        if (inquiry.length === 0) {
            return res.status(404).json({ success: false, message: 'Inquiry not found' });
        }

        const [result] = await db.query('UPDATE inquiries SET status = ?, admin_notes = ? WHERE id = ?', [status, admin_notes, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Inquiry not found' });
        }

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'UPDATE_INQUIRY',
            `Updated inquiry #${id} (${inquiry[0].candidate_name}) status to ${status}`,
            req
        );

        res.json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
