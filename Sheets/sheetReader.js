const { google } = require('googleapis');
const { auth } = require('../Google/auth');
const { logInfo, logFail, logProgress } = require('../Logs/logger');
const { jobLinks } = require('../Config/configs');

const skippedRows = new Set(); // ✅ เก็บแถวที่เคย log แล้ว

async function readLinksFromSheet(sheetKey) {
  const config = jobLinks[sheetKey];
  if (!config) throw new Error(`❌ ไม่พบ config ของชีต ${sheetKey}`);

  const sheets = google.sheets({ version: 'v4', auth });
  const startRow = config.StartRow || 2;
  const range = `${config.tabName}!A${startRow}:Z`;

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.sheetId,
      range
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      logProgress(`⚠️ ไม่พบลิงก์ในชีต ${config.tabName}`);
      return [];
    }

    const linkIndex = columnLetterToIndex(config.LinksColumn);
    const timeIndex = config.ReceviedDate ? columnLetterToIndex(config.ReceviedDate) : null;

    const tasks = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linkCell = row[linkIndex];
      const timestampCell = timeIndex !== null ? row[timeIndex] : null;
      const rowNum = i + startRow;

      	// ข้ามถ้าไม่มีลิงก์
  	if (!linkCell || linkCell.trim() === '') continue;
        //  ข้ามถ้าไม่มี timestamp
  	if (!timestampCell || timestampCell.trim() === '') continue;

    	 tasks.push({
        url: linkCell.trim(),
        rowNumber: rowNum,
        timestamp: timestampCell ? timestampCell.trim() : ''
      });
    }

    //logInfo(`📦 รวม tasks ที่ใช้ได้: ${tasks.length}`);
    return tasks;
  } catch (err) {
    logFail(`❌ อ่านชีตล้มเหลว: ${config.tabName}`, err.message, true);
    return [];
  }
}

function columnLetterToIndex(letter) {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

module.exports = {
  readLinksFromSheet
};
