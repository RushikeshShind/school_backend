const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
    console.log('Starting migration...');
    console.log(`Connecting to ${process.env.DB_HOST} on port ${process.env.DB_PORT || 3306}...`);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 3306,
        ssl: { rejectUnauthorized: false },
        multipleStatements: true // Important for running the whole file
    });

    console.log('Connected!');

    const schemaPath = path.join(__dirname, '../../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema...');
    
    try {
        await connection.query(schemaSql);
        console.log('Schema executed successfully!');
    } catch (error) {
        console.error('Error executing schema:', error);
    } finally {
        await connection.end();
    }
}

migrate();
