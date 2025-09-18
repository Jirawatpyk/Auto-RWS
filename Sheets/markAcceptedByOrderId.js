const { google } = require('googleapis');
const { auth } = require('../Google/auth');
const { logInfo, logFail, logProgress } = require('../Logs/logger');
const config = require('../Config/configs');

// ✅ markAcceptedByOrderId: เขียน 'Accepted' ลงชีต PM_Tracking ตาม orderId
module.exports = async function markAcceptedByOrderId(orderId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const { sheetId: spreadsheetId, tabName, orderIdColumn, statusColumn, pmNameColumn } = config.jobLinks.TrackingSheet;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tabName}!${orderIdColumn}5:${orderIdColumn}`, // เริ่มอ่านที่แถว 5
      majorDimension: 'ROWS' // บังคับให้อ่านเป็นแถว
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => {
      const sheetValue = (row && row[0]) ? String(row[0]).trim() : '';
      return sheetValue === String(orderId).trim();
    });

    if (rowIndex === -1) {
      logProgress(`❌ Order ID ${orderId} not found in sheet ${tabName}`);
      return false;
    }

	const realRow = rowIndex + 5;
	const targetRange = `${tabName}!${statusColumn}${realRow}`;
	const pmNameRange = `${tabName}!${pmNameColumn}${realRow}`;
	
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: targetRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Accepted']],
      }
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: pmNameRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['DTP']],
      },
    });

    logInfo(`✅ Updated status to "Accepted" and PM Name to "DTP" at ${tabName}!${statusColumn}${realRow} & ${pmNameColumn}${realRow}`);

    return true;
  } catch (err) {
    logFail(`❌ Google Sheets API error: ${err.message}`);
    return false;
  }
};

// ✅ ฟังก์ชันหน่วงเวลา
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ✅ ฟังก์ชัน retry (3 ครั้ง, ดีเลย์ 1 นาที)
async function markAcceptedWithRetry(orderId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const found = await module.exports(orderId);
    if (found) return true;

    logProgress(`⏳ Retry ${attempt}/${retries} – Order ID ${orderId} not yet found, waiting 1 min for Google Sheet sync...`);
    await delay(60000);
  }
  logFail(`❌ Failed to mark Accepted for Order ID: ${orderId} after ${retries} retries`,true);
  return false;
}

module.exports.markAcceptedWithRetry = markAcceptedWithRetry;
