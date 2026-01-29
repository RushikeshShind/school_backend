const db = require('../config/db');

async function checkStatus() {
    try {
        console.log('--- Checking Database Status ---');
        
        // Check Connection
        const [rows] = await db.query('SELECT 1');
        console.log('✅ Database Connection Successful');

        // Check Colleges
        const [colleges] = await db.query('SELECT * FROM colleges');
        console.log(`\n🏫 Colleges Found: ${colleges.length}`);
        colleges.forEach(c => console.log(`   - ID: ${c.id} | Name: ${c.project_name} | Full Name: ${c.name}`));

        // Check Super Admins
        const [superAdmins] = await db.query('SELECT * FROM super_admins');
        console.log(`\n👤 Super Admins Found: ${superAdmins.length}`);
        superAdmins.forEach(a => console.log(`   - Username: ${a.username}`));

        // Check College Admins
        const [collegeAdmins] = await db.query('SELECT * FROM college_admins');
        console.log(`\n🎓 College Admins Found: ${collegeAdmins.length}`);
        collegeAdmins.forEach(a => console.log(`   - Username: ${a.username} | College ID: ${a.college_id}`));
        
        // Check Inquiries
        const [inquiries] = await db.query('SELECT * FROM inquiries');
        console.log(`\n📄 Inquiries Found: ${inquiries.length}`);

        console.log('\n--- End of Output ---');
        process.exit(0);

    } catch (err) {
        console.error('❌ Database Check Failed:', err.message);
        console.error('Hint: Make sure XAMPP/MySQL is running and .env password is correct.');
        process.exit(1);
    }
}

checkStatus();
