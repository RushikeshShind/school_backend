require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 5001;

process.on('uncaughtException', (err) => {
    console.error('\x1b[31m[CRASH] Uncaught Exception:\x1b[0m', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('\x1b[31m[CRASH] Unhandled Rejection:\x1b[0m', reason);
    process.exit(1);
});

const server = app.listen(PORT, () => {
    console.log(`\x1b[32m✓ Server running on http://localhost:${PORT}\x1b[0m`);
});

server.on('error', (err) => {
    console.error('\x1b[31m[SERVER ERROR]\x1b[0m', err);
});
