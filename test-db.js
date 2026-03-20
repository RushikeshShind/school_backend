const pool = require('./config/db');

async function testConnection() {
    try {
        const [rows] = await pool.query('SELECT 1');
        console.log('Database connection successful!');
        process.exit(0);
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}

testConnection();
