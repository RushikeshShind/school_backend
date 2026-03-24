const mysql = require('mysql2');
require('dotenv').config();

const fs = require('fs');

const sslConfig = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
};

// Use CA cert file if it exists, otherwise trust default system certs
if (process.env.DB_CA && fs.existsSync(process.env.DB_CA)) {
    sslConfig.ca = fs.readFileSync(process.env.DB_CA);
} else {
    // On platforms without /etc/ssl/cert.pem (e.g. Render), use default Node.js certs
    sslConfig.rejectUnauthorized = false;
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000,
    ssl: sslConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();
