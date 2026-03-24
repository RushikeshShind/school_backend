const db = require('../config/db');
const { logActivity } = require('./activityLogController');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '../assets/AMIG.png');

// Convert empty strings to null, parse numeric fields
function cleanData(data) {
    const cleaned = {};
    for (const [key, val] of Object.entries(data)) {
        if (val === '' || val === undefined) {
            cleaned[key] = null;
        } else {
            cleaned[key] = val;
        }
    }
    return cleaned;
}

function buildInsertData(data) {
    return cleanData({
        college_id: data.college_id || 1,
        stream: data.stream,
        course: data.course,
        gender: data.gender,
        enquiry_date: data.enquiry_date || null,
        first_name: data.first_name,
        last_name: data.last_name,
        candidate_mobile: data.candidate_mobile,
        father_name: data.father_name,
        father_mobile: data.father_mobile,
        mother_name: data.mother_name,
        mother_mobile: data.mother_mobile,
        residential_address: data.residential_address,
        pincode: data.pincode,
        how_found: data.how_found,
        previous_school_name: data.previous_school_name,
        tenth_pass_percentage: data.tenth_pass_percentage || null,
        tenth_year_of_passing: data.tenth_year_of_passing,
        tenth_board: data.tenth_board,
        tenth_school_name_address: data.tenth_school_name_address,
        tenth_exam_center: data.tenth_exam_center,
        twelfth_pass_percentage: data.twelfth_pass_percentage || null,
        twelfth_year_of_passing: data.twelfth_year_of_passing,
        twelfth_board: data.twelfth_board,
        twelfth_school_name_address: data.twelfth_school_name_address,
        twelfth_exam_center: data.twelfth_exam_center,
        iti_pass_percentage: data.iti_pass_percentage || null,
        iti_year_of_passing: data.iti_year_of_passing,
        iti_board: data.iti_board,
        iti_school_name_address: data.iti_school_name_address,
        iti_exam_center: data.iti_exam_center,
        category: data.category || 'OPEN',
        email: data.email
    });
}

// Submit JC Enquiry (Public)
exports.submitJcEnquiry = async (req, res) => {
    try {
        const insertData = buildInsertData(req.body);
        const [result] = await db.query(`INSERT INTO jc_enquiries SET ?`, [insertData]);

        res.status(201).json({
            success: true,
            message: 'Enquiry submitted successfully!',
            enquiry_id: result.insertId
        });
    } catch (error) {
        console.error('JC Enquiry submit error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// Admin Create JC Enquiry
exports.adminCreateJcEnquiry = async (req, res) => {
    try {
        const data = req.body;
        const { system_user_id, role, username, college_id: user_college_id } = req.user;
        const final_college_id = role === 'SUPER_ADMIN' ? (data.college_id || user_college_id) : user_college_id;

        if (!final_college_id) {
            return res.status(400).json({ success: false, message: 'College ID is required' });
        }

        const creatorName = req.user.full_name || req.user.username || username;
        const insertData = buildInsertData(data);
        insertData.college_id = final_college_id;
        insertData.created_by_user_id = system_user_id;
        insertData.created_by_name = creatorName;

        const [result] = await db.query(`INSERT INTO jc_enquiries SET ?`, [insertData]);

        await logActivity(system_user_id, role, username, 'CREATE_JC_ENQUIRY',
            `Created JC enquiry for: ${data.first_name} ${data.last_name} (ID: ${result.insertId})`, req);

        res.status(201).json({
            success: true,
            message: 'JC Enquiry created successfully!',
            enquiry_id: result.insertId
        });
    } catch (error) {
        console.error('Admin JC Enquiry error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server Error' });
    }
};

// Get All JC Enquiries
exports.getAllJcEnquiries = async (req, res) => {
    try {
        const { college_id, role } = req.user;
        if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        let query = 'SELECT * FROM jc_enquiries';
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

// Get JC Enquiry by ID
exports.getJcEnquiryById = async (req, res) => {
    try {
        const { id } = req.params;
        const { college_id, role } = req.user;

        const [rows] = await db.query('SELECT * FROM jc_enquiries WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        const enquiry = rows[0];
        if (role === 'ADMIN' && enquiry.college_id !== college_id) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        res.json({ success: true, data: enquiry });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Generate PDF for a JC Enquiry
exports.generateJcEnquiryPdf = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT * FROM jc_enquiries WHERE id = ?', [id]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Enquiry not found' });
        }

        const d = rows[0];
        const doc = new PDFDocument({ size: 'A4', margin: 30 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=JC_Enquiry_${d.first_name}_${d.last_name}_${d.id}.pdf`);
        res.setHeader('X-Frame-Options', 'ALLOWALL');
        res.removeHeader('Content-Security-Policy');
        doc.pipe(res);

        const pageW = doc.page.width;
        const marginL = 30;
        const marginR = 30;
        const contentW = pageW - marginL - marginR;

        // Orange top bar
        doc.rect(0, 0, pageW, 8).fill('#E65100');

        // Logo
        let logoY = 20;
        if (fs.existsSync(LOGO_PATH)) {
            doc.image(LOGO_PATH, marginL, logoY, { width: 60 });
        }

        // Header text
        doc.fontSize(9).fillColor('#333').text("Sai Shiva Educational Trust's", marginL + 70, logoY + 2, { width: contentW - 70, align: 'center' });
        doc.fontSize(16).fillColor('#B71C1C').font('Helvetica-Bold')
            .text('AARAV MUCHHALA JUNIOR COLLEGE', marginL + 70, logoY + 14, { width: contentW - 70, align: 'center' });
        doc.fontSize(11).fillColor('#B71C1C')
            .text('OF ARTS, COMMERCE & SCIENCE', marginL + 70, logoY + 34, { width: contentW - 70, align: 'center' });
        doc.fontSize(7).fillColor('#555').font('Helvetica')
            .text('Email:aaravmuchhalacollege@gmail.com phone no. 25971199 / 25973939 Mobile no. 9222220033', marginL + 70, logoY + 48, { width: contentW - 70, align: 'center' });
        doc.fontSize(8).fillColor('#333').font('Helvetica-Bold')
            .text('AFFILIATED TO UNIVERSITY OF MUMBAI, MAHARASHTRA', marginL + 70, logoY + 60, { width: contentW - 70, align: 'center' });

        // Title
        let y = logoY + 80;
        doc.fontSize(14).fillColor('#000').font('Helvetica-Bold')
            .text('ADMISSION ENQUIRY FORM', marginL, y, { width: contentW, align: 'center' });
        y += 20;
        doc.fontSize(8).fillColor('#555').font('Helvetica')
            .text('ALL FIELDS SHOULD BE FILLED IN CAPITAL LETTERS ONLY', marginL, y, { width: contentW, align: 'center' });
        y += 18;

        // Helper functions
        const drawRow = (label, value, x, rowY, w, h) => {
            doc.rect(x, rowY, w, h).stroke('#999');
            doc.fontSize(8).fillColor('#333').font('Helvetica-Bold').text(label, x + 5, rowY + 4, { width: w - 10 });
            doc.fontSize(9).fillColor('#000').font('Helvetica').text(value || '', x + 5, rowY + 14, { width: w - 10 });
        };

        const drawRowInline = (label, value, x, rowY, w, h) => {
            doc.rect(x, rowY, w, h).stroke('#999');
            doc.fontSize(8).fillColor('#333').font('Helvetica-Bold').text(label, x + 5, rowY + 6);
            const labelW = doc.widthOfString(label, { fontSize: 8 }) + 10;
            doc.fontSize(9).fillColor('#000').font('Helvetica').text(value || '', x + 5 + labelW, rowY + 6, { width: w - labelW - 10 });
        };

        const rH = 26;

        // Stream checkboxes
        const streams = ['SCIENCE', 'COMMERCE', 'ARTS'];
        const streamBoxW = contentW / 3;
        streams.forEach((s, i) => {
            const bx = marginL + i * streamBoxW;
            doc.rect(bx, y, streamBoxW, rH).stroke('#999');
            const checked = d.stream === s;
            doc.rect(bx + 10, y + 7, 12, 12).stroke('#333');
            if (checked) {
                doc.fontSize(10).fillColor('#000').font('Helvetica-Bold').text('X', bx + 12, y + 8);
            }
            doc.fontSize(9).fillColor('#333').font('Helvetica-Bold').text(s, bx + 28, y + 8);
        });
        y += rH;

        // Gender + Date row
        const halfW = contentW / 2;
        doc.rect(marginL, y, halfW, rH).stroke('#999');
        doc.fontSize(8).fillColor('#333').font('Helvetica-Bold').text('Gender :', marginL + 5, y + 8);
        // M box
        const gx = marginL + 55;
        doc.rect(gx, y + 6, 14, 14).stroke('#333');
        if (d.gender === 'M') doc.fontSize(9).font('Helvetica-Bold').text('X', gx + 3, y + 7);
        doc.fontSize(9).font('Helvetica-Bold').text('M', gx + 18, y + 8);
        // F box
        doc.rect(gx + 35, y + 6, 14, 14).stroke('#333');
        if (d.gender === 'F') doc.fontSize(9).font('Helvetica-Bold').text('X', gx + 38, y + 7);
        doc.fontSize(9).font('Helvetica-Bold').text('F', gx + 53, y + 8);

        doc.rect(marginL + halfW, y, halfW, rH).stroke('#999');
        const dateStr = d.enquiry_date ? new Date(d.enquiry_date).toLocaleDateString('en-IN') : '';
        drawRowInline('Date:', dateStr, marginL + halfW, y, halfW, rH);
        y += rH;

        // Course
        drawRowInline('Course you wish to Enroll for:', `${d.stream || ''} - ${d.course || ''}`, marginL, y, contentW, rH);
        y += rH;

        // Candidate Name + Mobile
        const col1W = contentW * 0.7;
        const col2W = contentW * 0.3;
        drawRowInline("Candidate's Name:", `${(d.first_name || '').toUpperCase()} ${(d.last_name || '').toUpperCase()}`, marginL, y, col1W, rH);
        drawRowInline('Mobile No.:', d.candidate_mobile || '', marginL + col1W, y, col2W, rH);
        y += rH;

        // Father + Mobile
        drawRowInline("Father's Name:", (d.father_name || '').toUpperCase(), marginL, y, col1W, rH);
        drawRowInline('Mobile No.:', d.father_mobile || '', marginL + col1W, y, col2W, rH);
        y += rH;

        // Mother + Mobile
        drawRowInline("Mother's Name:", (d.mother_name || '').toUpperCase(), marginL, y, col1W, rH);
        drawRowInline('Mobile No.:', d.mother_mobile || '', marginL + col1W, y, col2W, rH);
        y += rH;

        // Residential Address
        drawRowInline('Residential Address:', (d.residential_address || '').toUpperCase(), marginL, y, contentW, 30);
        y += 30;

        // Pincode
        drawRowInline('Pincode:', d.pincode || '', marginL + contentW * 0.6, y - 0, contentW * 0.4, rH);
        doc.rect(marginL, y, contentW * 0.6, rH).stroke('#999');
        y += rH;

        // How found
        drawRowInline('How did you find out about this college:', d.how_found || '', marginL, y, contentW, rH);
        y += rH;

        // Previous school
        drawRowInline('Name of the School:', (d.previous_school_name || '').toUpperCase(), marginL, y, contentW, rH);
        y += rH;

        // Marks Table Header
        const colWidths = [70, 55, 60, 70, 130, 150];
        const headers = ['Exam\nPassed', 'Pass\n%', 'Year of\nPassing', 'Board', 'School Name\n& Address', 'Exam Center Name\nand Address'];
        let tx = marginL;
        const headerH = 30;
        headers.forEach((h, i) => {
            doc.rect(tx, y, colWidths[i], headerH).stroke('#999');
            doc.fontSize(7).fillColor('#333').font('Helvetica-Bold').text(h, tx + 3, y + 4, { width: colWidths[i] - 6, align: 'center' });
            tx += colWidths[i];
        });
        y += headerH;

        // Marks rows
        const marksRows = [
            { label: '10th', pct: d.tenth_pass_percentage, yr: d.tenth_year_of_passing, board: d.tenth_board, school: d.tenth_school_name_address, center: d.tenth_exam_center },
            { label: '12th\n(Arts/Comm/Sci)', pct: d.twelfth_pass_percentage, yr: d.twelfth_year_of_passing, board: d.twelfth_board, school: d.twelfth_school_name_address, center: d.twelfth_exam_center },
            { label: 'ITI', pct: d.iti_pass_percentage, yr: d.iti_year_of_passing, board: d.iti_board, school: d.iti_school_name_address, center: d.iti_exam_center },
        ];

        marksRows.forEach(row => {
            tx = marginL;
            const rowH = 28;
            const vals = [row.label, row.pct ? String(row.pct) + '%' : '', row.yr || '', row.board || '', (row.school || '').toUpperCase(), (row.center || '').toUpperCase()];
            vals.forEach((v, i) => {
                doc.rect(tx, y, colWidths[i], rowH).stroke('#999');
                doc.fontSize(7).fillColor('#000').font('Helvetica').text(v, tx + 3, y + 5, { width: colWidths[i] - 6, align: 'center' });
                tx += colWidths[i];
            });
            y += rowH;
        });

        // Category
        y += 5;
        const catStr = `CATEGORY : ${d.category || 'OPEN'}`;
        doc.rect(marginL, y, contentW, rH).stroke('#999');
        doc.fontSize(9).fillColor('#000').font('Helvetica-Bold').text(catStr, marginL + 5, y + 8, { width: contentW - 10 });
        y += rH;

        // Email
        drawRowInline('Email id:', d.email || '', marginL, y, contentW, rH);
        y += rH + 30;

        // Signatures
        doc.fontSize(9).fillColor('#333').font('Helvetica')
            .text('Signature of\nParents/Guardian', marginL + 20, y, { width: 150, align: 'center' })
            .text('Signature of the\nCandidate', marginL + contentW - 170, y, { width: 150, align: 'center' });

        // Orange bottom bar
        doc.rect(0, doc.page.height - 8, pageW, 8).fill('#E65100');

        doc.end();
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ success: false, message: 'Error generating PDF' });
    }
};
