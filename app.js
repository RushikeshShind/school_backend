const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
    origin: '*', // Allow all origins for debugging
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Live request logger
app.use((req, res, next) => {
    const start = Date.now();
    const now = new Date().toLocaleTimeString('en-IN', { hour12: false });
    res.on('finish', () => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        const color = status >= 500 ? '\x1b[31m'   // red
                    : status >= 400 ? '\x1b[33m'   // yellow
                    : status >= 300 ? '\x1b[36m'   // cyan
                    : '\x1b[32m';                  // green
        const reset = '\x1b[0m';
        const method = req.method.padEnd(7);
        console.log(`${color}[${now}] ${method} ${req.originalUrl} → ${status} (${ms}ms)${reset}`);
    });
    next();
});

// Serve static files (scanned documents)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', apiRoutes);

// Health Check
app.get('/', (req, res) => {
    res.send('Admission Module Backend is Running');
});

module.exports = app;
