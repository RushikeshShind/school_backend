const mysql = require('mysql2/promise');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function setup() {
    console.log('Starting Database Setup...');
    
    // 1. Connect without database selected to create it
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    try {
        // 2. Read Schema
        const schemaPath = path.join(__dirname, '../../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // 3. Split and Execute (Basic splitter, might need refinement for complex SQL)
        // Adjusting schema to ensure it works statement by statement
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            await connection.query(statement);
        }
        console.log('Schema applied successfully.');

        // 4. Seed Data
        // Re-connect with database selected or just use the seed logic here
        await connection.query('USE admission_db');
        
        console.log('Seeding Data...');
        // College
        const [collegeResult] = await connection.query(
            `INSERT INTO colleges (name, project_name, address) 
             VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=name`,
            ['Arun Muchhala International College of Hotel Management', 'AMIG', 'College Address Here']
        );
        const collegeId = collegeResult.insertId || (await connection.query('SELECT id FROM colleges WHERE project_name="AMIG"'))[0][0].id;

        // Super Admin
        await connection.query(`INSERT INTO super_admins (username, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE username=username`, ['superadmin', 'superadmin123']);
        
        // College Admin
        await connection.query(
            `INSERT INTO college_admins (college_id, username, password_hash, role) 
             VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE username=username`,
            [collegeId, 'amig_admin', 'admin123', 'ADMIN']
        );
        
        console.log('Database Setup & Seeding Complete!');
        console.log('-------------------------------------------');
        console.log('Super Admin Credentials: superadmin / superadmin123');
        console.log('College Admin Credentials: amig_admin / admin123');
        console.log('College ID:', collegeId);
        
    } catch (err) {
        console.error('Setup Failed:', err);
    } finally {
        await connection.end();
    }
}

setup();
