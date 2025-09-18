// Logs/logger.js
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { notifyGoogleChat } = require('./notifier');

// ========== 🔧 CONFIG ==========
const LOG_DIR = path.join(__dirname);
const LOG_FILE = path.join(LOG_DIR, 'system.log');
const MAX_DAYS = 7;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // 24 ชั่วโมง

// ========== ⏰ TIME ==========
const now = () => `[${new Date().toLocaleTimeString('en-GB')}]`;
const isoTime = () => new Date().toISOString();

// ========== 🧹 CLEANUP FUNCTION ==========
function cleanupLogFile(manual = false) {
  try {
    if (!fs.existsSync(LOG_FILE)) return;

    const stats = fs.statSync(LOG_FILE);
    const modified = new Date(stats.mtime);
    const nowTime = new Date();
    const ageMs = nowTime - modified;
    const daysOld = ageMs / (1000 * 60 * 60 * 24);

    if (daysOld > MAX_DAYS) {
      fs.unlinkSync(LOG_FILE);
      const tag = manual ? '🧹 Deleted old system.log (on start)' : '🧹 Deleted old system.log (interval)';
      console.log(`${chalk.gray(now())} ${chalk.magenta(tag)}`);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to clean system.log:`, err.message);
  }
}

// 🔁 เรียกตอนเริ่มต้นระบบ
cleanupLogFile(true);

// 🔁 ตั้งล้าง log ทุก 24 ชั่วโมง
setInterval(() => cleanupLogFile(false), CLEANUP_INTERVAL_MS);

// ========== 📝 CORE LOG WRITER ==========
function logToFile(level, msg) {
  const line = `[${isoTime()}] [${level.toUpperCase()}] ${msg}\n`;
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error(`❌ Failed to write log:`, err.message);
  });
}

// ========== 🔊 LOG INTERFACE ==========
function logSuccess(msg, notify = false) {
  const output = `${chalk.gray(now())} ${chalk.greenBright(msg)}`;
  console.log(output);
  logToFile('success', msg);
  if (notify) notifyGoogleChat(msg);
}

function logFail(msg, notify = false) {
  const output = `${chalk.gray(now())} ${chalk.red(msg)}`;
  console.log(output);
  logToFile('error', msg);
  if (notify) notifyGoogleChat(msg);
}

function logInfo(msg) {
  const output = `${chalk.gray(now())} ${chalk.cyan(msg)}`;
  console.log(output);
  logToFile('info', msg);
}

function logProgress(msg) {
  const output = `${chalk.gray(now())} ${chalk.yellow(msg)}`;
  console.log(output);
  logToFile('progress', msg);
}

function logBanner() {
  const border = chalk.cyan('═══════════════════════════════════════════════════');
  console.log(border);
  console.log(chalk.green.bold('🚀 Auto RWS System is now running'));
  console.log(border);
  logToFile('info', '🚀 Auto RWS System started');
}

// ========== EXPORT ==========
module.exports = {
  logSuccess,
  logFail,
  logInfo,
  logProgress,
  logBanner
};
