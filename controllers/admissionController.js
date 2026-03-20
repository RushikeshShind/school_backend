const db = require('../config/db');
const { logActivity } = require('./activityLogController');
const path = require('path');
const fs = require('fs');

// Create Admission
exports.createAdmission = async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { system_user_id, role, username, college_id: user_college_id } = req.user;
        const admissionData = JSON.parse(req.body.data);
        const files = req.files;

        // Force college_id for regular admins
        const final_college_id = role === 'SUPER_ADMIN' ? admissionData.college_id : user_college_id;

        if (!final_college_id) {
            throw new Error('College ID is required');
        }

        // 1. Insert into admissions table
        const [result] = await connection.query(
            `INSERT INTO admissions SET ?, college_id = ?, created_by = ?`,
            [admissionData, final_college_id, system_user_id]
        );

        const admission_id = result.insertId;

        // 2. Handle files (if any)
        if (files && files.length > 0) {
            for (const file of files) {
                // Determine document type from fieldname or default
                const docType = file.fieldname.toUpperCase();
                await connection.query(
                    `INSERT INTO admission_documents (admission_id, document_type, file_path) VALUES (?, ?, ?)`,
                    [admission_id, docType, file.path]
                );
            }
        }

        await connection.commit();

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'CREATE_ADMISSION',
            `Started admission process for student: ${admissionData.candidate_name} (ID: ${admission_id})`,
            req
        );

        res.status(201).json({
            success: true,
            message: 'Admission processed successfully!',
            admission_id
        });

    } catch (error) {
        await connection.rollback();
        console.error('Admission error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    } finally {
        connection.release();
    }
};

// Get Admissions (Role-based filtering)
exports.getAdmissions = async (req, res) => {
    try {
        const { college_id, role } = req.user;
        let query = `
            SELECT a.*, c.name as college_name 
            FROM admissions a 
            JOIN colleges c ON a.college_id = c.id
        `;
        let params = [];

        if (role !== 'SUPER_ADMIN') {
            query += ' WHERE a.college_id = ?';
            params.push(college_id);
        }

        query += ' ORDER BY a.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Get Admission Details
exports.getAdmissionById = async (req, res) => {
    try {
        const { id } = req.params;
        const { college_id, role } = req.user;

        const [rows] = await db.query('SELECT * FROM admissions WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Admission not found' });
        }

        const admission = rows[0];

        // Access check
        if (role !== 'SUPER_ADMIN' && admission.college_id !== college_id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        // Get documents
        const [docs] = await db.query('SELECT * FROM admission_documents WHERE admission_id = ?', [id]);
        admission.documents = docs;

        res.json({ success: true, data: admission });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Update Admission Status
exports.updateAdmissionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_notes } = req.body;
        const { system_user_id, username, role } = req.user;

        const [admission] = await db.query('SELECT candidate_name, college_id FROM admissions WHERE id = ?', [id]);
        if (admission.length === 0) {
            return res.status(404).json({ message: 'Admission not found' });
        }

        // Role check
        if (role !== 'SUPER_ADMIN' && admission[0].college_id !== req.user.college_id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await db.query('UPDATE admissions SET status = ?, admin_notes = ? WHERE id = ?', [status, admin_notes, id]);

        // Log activity
        await logActivity(
            system_user_id,
            role,
            username,
            'UPDATE_ADMISSION_STATUS',
            `Updated admission status for ${admission[0].candidate_name} to ${status}`,
            req
        );

        res.json({ success: true, message: 'Admission status updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Staff Activity Stats for Super Admin
exports.getStaffStats = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const [rows] = await db.query(`
            SELECT 
                u.system_user_id,
                u.username,
                u.full_name,
                c.name as college_name,
                COUNT(DISTINCT a.id) as total_admissions,
                (SELECT COUNT(*) FROM activity_logs WHERE system_user_id = u.system_user_id AND action = 'UPDATE_INQUIRY') as inquiries_updated,
                (SELECT COUNT(*) FROM activity_logs WHERE system_user_id = u.system_user_id AND action = 'CREATE_INQUIRY') as inquiries_created
            FROM college_admins u
            JOIN colleges c ON u.college_id = c.id
            LEFT JOIN admissions a ON a.created_by = u.system_user_id
            GROUP BY u.system_user_id
        `);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
