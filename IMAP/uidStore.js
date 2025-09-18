const fs = require('fs');
const path = require('path');
const { logInfo, logFail } = require('../Logs/logger');

// สร้างชื่อไฟล์ UID ที่ปลอดภัยตามชื่อ mailbox
function getUidStorePath(mailboxName) {
    const safeName = mailboxName.replace(/[^\w]/g, '_');
    return path.join(__dirname, `uidStore_${safeName}.json`);
}

// โหลด UID ล่าสุดจากไฟล์
function loadLastSeenUidFromFile(mailboxName) {
    const pathToFile = getUidStorePath(mailboxName);
    try {
        const data = fs.readFileSync(pathToFile, 'utf8');
        const parsed = JSON.parse(data);
        const uid = parsed.lastSeenUid || 0;
        logInfo(`📥 Loaded UID from file (${mailboxName}): ${uid}`);
        return uid;
    } catch {
        logInfo(`📥 UID file not found for ${mailboxName}. Starting fresh.`);
        return 0;
    }
}

// บันทึก UID ล่าสุดลงไฟล์ .tmp → .json (atomic)
function saveLastSeenUid(mailboxName, uid) {
    const tempPath = getUidStorePath(mailboxName) + '.tmp';
    const finalPath = getUidStorePath(mailboxName);
    try {
        fs.writeFileSync(tempPath, JSON.stringify({ lastSeenUid: uid }));
        fs.renameSync(tempPath, finalPath);
        logInfo(`💾 Saved UID (${mailboxName}): ${uid}`);
    } catch (err) {
        logFail(`❌ Failed to save UID for ${mailboxName}:`, err);
    }
}

module.exports = {
    getUidStorePath,
    loadLastSeenUidFromFile,
    saveLastSeenUid
};
