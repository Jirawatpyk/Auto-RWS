require('dotenv').config();
const { ImapFlow } = require('imapflow');
const { logInfo, logSuccess, logFail, logProgress } = require('../Logs/logger');
const { notifyGoogleChat } = require('../Logs/notifier');
const { fetchNewEmails, initLastSeenUid } = require('./fetcher');

const MAILBOX = process.env.MAILBOX || 'Symfonie/Order';
const ALLOW_BACKFILL = process.env.ALLOW_BACKFILL === 'true';

// ✅ 1. เพิ่ม Configuration Constants (ปรับปรุงเล็กน้อย)
const CONFIG = {
  CONNECTION_TIMEOUT: 30000,    // 30 seconds
  IDLE_TIMEOUT: 300000,        // 5 minutes  
  KEEPALIVE_INTERVAL: 60000,   // 1 minute
  MAX_RETRIES: 5,
  INITIAL_RETRY_DELAY: 5000,   // 5 seconds
  MAX_RETRY_DELAY: 600000      // 10 minutes (เพิ่มจาก 10 นาที)
};

let client = null;
let callbackRef = null;
let isConnecting = false;
let alreadyHandled = false;
let reconnecting = false;
let retryCount = 0;
let isPaused = false;

// ✅ 2. เพิ่ม Connection Metrics (Optional)
let connectionStats = {
  startTime: Date.now(),
  totalConnections: 0,
  totalReconnects: 0,
  lastConnectionTime: null,
  totalUptime: 0
};

async function connectToImap(callback) {
    if (isConnecting) return;
    isConnecting = true;
    callbackRef = callback;

    const config = {
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        logger: false,
        // ✅ เพิ่ม timeout settings
        socketTimeout: CONFIG.CONNECTION_TIMEOUT,
        greetingTimeout: CONFIG.CONNECTION_TIMEOUT,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    };

    if (!config.auth.user || !config.auth.pass) {
        logFail('❌ Missing EMAIL_USER or EMAIL_PASS in .env');
        isConnecting = false;
        return;
    }

    client = new ImapFlow(config);

    try {
        // ✅ 3. เพิ่ม timing info
        const connectionStart = Date.now();
        logInfo('🔡 Connecting to IMAP...');
        
        await client.connect();
        alreadyHandled = false;
        
        const connectionTime = Date.now() - connectionStart;
        logSuccess(`🟢 IMAP connection established (${connectionTime}ms)`);
        
        // ✅ Update stats
        connectionStats.totalConnections++;
        connectionStats.lastConnectionTime = Date.now();
        if (retryCount > 0) {
            connectionStats.totalReconnects++;
        }
        retryCount = 0;

        await client.mailboxOpen(MAILBOX);
        logInfo(`📬 Mailbox "${MAILBOX}" opened`);
        await initLastSeenUid(client, MAILBOX, ALLOW_BACKFILL);
        
        // ✅ 4. เพิ่ม connection info ใน notification
        const uptime = connectionStats.lastConnectionTime - connectionStats.startTime;
        notifyGoogleChat(`🟢 [Auto RWS] System online (${connectionStats.totalConnections} connections, ${Math.round(uptime/1000/60)} min uptime)`);

        // Event handlers (ไม่เปลี่ยน - ดีอยู่แล้ว)
        client.on('exists', async () => {
            if (isPaused) return;
            logInfo('🔔 New mail detected');
            await fetchNewEmails(client, MAILBOX, callbackRef);
        });

        client.on('error', err => {
            if (alreadyHandled) return;
            alreadyHandled = true;
            // ✅ 5. เพิ่ม error context
            logFail(`❌ IMAP Error: ${err.message}`, {
                code: err.code,
                source: err.source || 'imap',
                retryCount: retryCount,
                uptime: Date.now() - connectionStats.startTime
            });
            notifyGoogleChat(`❌ [Auto RWS] IMAP Error: ${err.message} (retry ${retryCount}/${CONFIG.MAX_RETRIES})`);
            attemptReconnect();
        });

        client.on('close', () => {
            if (alreadyHandled) return;
            alreadyHandled = true;
            logFail('🔌 IMAP connection closed');
            attemptReconnect();
        });

        client.on('end', () => {
            if (alreadyHandled) return;
            alreadyHandled = true;
            logFail('🔴 IMAP connection ended by server');
            notifyGoogleChat('🔴 [Auto RWS] IMAP connection ended by server');
            attemptReconnect();
        });

    } catch (err) {
        // ✅ 6. เพิ่ม setup error context
        logFail(`❌ IMAP setup failed: ${err.message}`, {
            code: err.code,
            host: config.host,
            port: config.port,
            user: config.auth.user ? 'configured' : 'missing',
            retryCount: retryCount
        });
        notifyGoogleChat(`❌ [Auto RWS] IMAP setup failed: ${err.message} (attempt ${retryCount + 1})`);
        attemptReconnect();
    } finally {
        isConnecting = false;
    }
}

function attemptReconnect(delayMs = CONFIG.INITIAL_RETRY_DELAY) {
    if (reconnecting) return;

    if (retryCount >= CONFIG.MAX_RETRIES) {
        const nextRetryMinutes = CONFIG.MAX_RETRY_DELAY / 60000;
        logFail(`🛑 Max retries reached. Will try again in ${nextRetryMinutes} minutes.`);
        notifyGoogleChat(`⚠️ [Auto RWS] IMAP failed ${CONFIG.MAX_RETRIES} times. Will retry after ${nextRetryMinutes} minutes.`);
        
        setTimeout(() => {
            retryCount = 0;
            reconnecting = false;
            connectToImap(callbackRef);
        }, CONFIG.MAX_RETRY_DELAY);
        return;
    }

    retryCount++;
    reconnecting = true;
    
    // ✅ 7. เพิ่ม exponential backoff ที่ดีขึ้น
    const exponentialDelay = Math.min(
        delayMs * Math.pow(1.5, retryCount - 1), 
        CONFIG.MAX_RETRY_DELAY
    );
    
    logInfo(`🔄 Reconnecting to IMAP in ${exponentialDelay / 1000}s (attempt ${retryCount}/${CONFIG.MAX_RETRIES})`);
    notifyGoogleChat(`🔴 [Auto RWS] IMAP disconnected. Attempting reconnect (${retryCount}/${CONFIG.MAX_RETRIES}) in ${Math.round(exponentialDelay/1000)}s...`);
    
    setTimeout(() => {
        reconnecting = false;
        connectToImap(callbackRef);
    }, exponentialDelay);
}

// ✅ 8. เพิ่ม Health Check function (ใหม่ - สำหรับ integration กับ fetcher)
async function checkConnection() {
    try {
        if (!client || client.destroyed) {
            return { healthy: false, error: 'No client connection' };
        }
        
        await client.noop();
        return { 
            healthy: true, 
            uptime: Date.now() - connectionStats.lastConnectionTime 
        };
    } catch (error) {
        return { 
            healthy: false, 
            error: error.message 
        };
    }
}

// ✅ 9. เพิ่ม Stats function (ใหม่ - สำหรับ monitoring)
function getConnectionStats() {
    return {
        ...connectionStats,
        currentUptime: Date.now() - connectionStats.lastConnectionTime,
        totalUptime: Date.now() - connectionStats.startTime,
        currentRetryCount: retryCount,
        isPaused: isPaused,
        isConnecting: isConnecting,
        isReconnecting: reconnecting,
        isHealthy: client && !client.destroyed
    };
}

// Existing functions (ไม่เปลี่ยน - ดีอยู่แล้ว)
function pauseImap() {
    isPaused = true;
    logInfo("⏸️ IMAP paused by user");
}

function resumeImap() {
    isPaused = false;
    logInfo("▶️ IMAP resumed by user");
}

function isImapPaused() {
    return isPaused;
}

module.exports = {
    startListeningEmails: connectToImap,
    pauseImap,
    resumeImap,
    isImapPaused,
    // ✅ เพิ่ม functions ใหม่
    checkConnection,        // สำหรับ health check
    getConnectionStats      // สำหรับ monitoring
};