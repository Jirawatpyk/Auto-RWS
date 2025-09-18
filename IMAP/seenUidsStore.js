const fs = require('fs');
const path = require('path');
const { logInfo, logFail } = require('../Logs/logger');

function getSeenUidsPath(mailboxName) {
  const safeName = mailboxName.replace(/[^\w]/g, '_');
  return path.join(__dirname, `seenUids_${safeName}.json`);
}

// โหลด UID ที่เคยเห็นทั้งหมด
function loadSeenUids(mailboxName) {
  const pathToFile = getSeenUidsPath(mailboxName);
  try {
    const data = fs.readFileSync(pathToFile, 'utf8');
    const uids = JSON.parse(data);
    logInfo(`📂 Loaded seen UIDs for ${mailboxName}: ${uids.length} items`);
    return new Set(uids);
  } catch {
    logInfo(`📂 No seen UID file for ${mailboxName}. Starting fresh.`);
    return new Set();
  }
}

// บันทึก UID ทั้งหมด (แบบ overwrite ทั้ง set)
function saveSeenUids(mailboxName, seenSet) {
  const pathToFile = getSeenUidsPath(mailboxName);
  try {
    const uidArray = [...seenSet];
    const limitedUids = uidArray.slice(-1000);
    fs.writeFileSync(pathToFile, JSON.stringify([...seenSet]));
    logInfo(`💾 Saved seen UIDs for ${mailboxName}: ${seenSet.size} items`);
  } catch (err) {
    logFail(`❌ Failed to save seen UIDs for ${mailboxName}:`, err);
  }
}

module.exports = {
  loadSeenUids,
  saveSeenUids
};
