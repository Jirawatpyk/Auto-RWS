const { google } = require('googleapis');
const { auth } = require('../Google/auth');
const dayjs = require('dayjs');
const { logSuccess, logFail } = require('../Logs/logger');
const { DEFAULT_SHEET_KEY, jobLinks } = require('../Config/configs');

async function appendStatusToMainSheet({ url, status, reason, timestamp, sheetKey }) {
  const usedSheetKey = sheetKey || DEFAULT_SHEET_KEY;
  const config = jobLinks[usedSheetKey];
  
  if (!config) throw new Error(`❌ MainSheet config not found`);

  const range = `${config.tabName}!${config.LinksOrderColumn}:${config.TimestampColumn}`;
  const values = [[url, status, reason, timestamp || dayjs().format('YYYY-MM-DD HH:mm:ss')]];

  try {
    await google.sheets({ version: 'v4', auth }).spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    logSuccess(`📝 Append to ${usedSheetKey} successful.`);
  } catch (err) {
    logFail(`❌ Append failed: ${err.message}`, true);
  }
}

module.exports = {
  appendStatusToMainSheet
};
