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
            twelfth_board
        } = req.body;

        // Eligibility Logic
        let eligibility_status = 'PENDING';
        let status = 'NEW';
        
        // Basic eligibility rule: Must have passed 12th (presence of percentage implies passed for now, OR we check a flag if provided)
        // User Requirement: "suppose he enter that he didnt given the 12th na then automatic reject"
        // We can infer this if twelfth_percentage is null/0 OR a specific field 'passed_12th' is false. 
        // Assuming the detailed academic form has these fields.
        // For now, let's assume if percentage is < passing marks (e.g. 35) or not provided, we reject.
        
        if (!twelfth_percentage || twelfth_percentage < 35) {
             eligibility_status = 'NOT_ELIGIBLE';
             status = 'REJECTED';
        } else {
            eligibility_status = 'ELIGIBLE';
        }

        const [result] = await db.query(
            `INSERT INTO inquiries 
            (college_id, candidate_name, candidate_mobile, candidate_email, parent_mobile, residential_address, 
            twelfth_percentage, year_of_passing, twelfth_board, eligibility_status, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [college_id, candidate_name, candidate_mobile, candidate_email, parent_mobile, residential_address, 
            twelfth_percentage, year_of_passing, twelfth_board, eligibility_status, status]
        );

        if (eligibility_status === 'NOT_ELIGIBLE') {
            return res.status(200).json({ 
                success: false, 
                message: 'Sorry, you are not eligible for admission as per the criteria.',
                inquiry_id: result.insertId
            });
        }

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

exports.getAllInquiries = async (req, res) => {
    // Admin View
    try {
        // Assume middleware adds user info to req.user
        const { college_id, role } = req.user; 
        
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        let query = 'SELECT * FROM inquiries';
        let params = [];

        if (role === 'ADMIN') {
            query += ' WHERE college_id = ?';
            params.push(college_id);
        }

        query += ' ORDER BY created_at DESC';

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
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
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
