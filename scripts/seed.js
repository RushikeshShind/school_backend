const db = require('../config/db');

async function seed() {
    try {
        console.log('Seeding Database...');
        
        // 1. Create College
        const [collegeResult] = await db.query(
            `INSERT INTO colleges (name, project_name, address) 
             VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=name`,
            ['Arun Muchhala International College of Hotel Management', 'AMIG', 'College Address Here']
        );
        const collegeId = collegeResult.insertId || 1; // Assuming 1 if update.
        console.log('College Seeded with ID:', collegeId);

        // 2. Create Super Admin
        await db.query(`INSERT INTO super_admins (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE username=username`, ['superadmin', 'superadmin123']);
        console.log('Super Admin Seeded: superadmin / superadmin123');

        // 3. Create College Admin
        await db.query(
            `INSERT INTO college_admins (college_id, username, password_hash, role) 
             VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=username`,
            [collegeId, 'amig_admin', 'admin123', 'ADMIN']
        );
         console.log('College Admin Seeded: amig_admin / admin123');
         
         process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seed();
