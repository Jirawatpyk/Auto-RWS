require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const cron = require('node-cron');
const { logSuccess, logFail, logInfo, logProgress } = require('../Logs/logger');

const TRACKING_SHEET_ID = process.env.SHEET_ID_Tracking;
const CHAT_WEBHOOK = process.env.GOOGLE_CHAT_Moravia;
const CREDENTIALS = require('../credentials.json');
const acceptedTasksPath = path.join(__dirname, 'acceptedTasks.json');
const assignmentTabName = 'Assignment';

function appendAcceptedTask(task) {
  let data = [];
  if (fs.existsSync(acceptedTasksPath)) {
    try {
      const raw = fs.readFileSync(acceptedTasksPath);
      data = JSON.parse(raw);
    } catch (err) {
      console.error('❌ Failed to parse acceptedTasks.json:', err);
    }
  }
  data.push(task);
  try {
    fs.writeFileSync(acceptedTasksPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Failed to write acceptedTasks.json:', err);
  }
}

async function loadAndFilterTasks() {
  if (!fs.existsSync(acceptedTasksPath)) return [];

  const raw = fs.readFileSync(acceptedTasksPath);
  const allTasks = JSON.parse(raw);

  const doc = new GoogleSpreadsheet(TRACKING_SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: CREDENTIALS.client_email,
    private_key: CREDENTIALS.private_key.replace(/\\n/g, '\n'),
  });
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[assignmentTabName];

  const rows = await sheet.getRows({ headerRow: 5, offset: 0 });

  // ✅ Map index สำหรับอ่านง่าย
  const COL = {
    workflowName: 5,     // 'F'
    projectStatus: 11    // 'L'
  };

  // ✅ Optional chaining & readable
  const activeTasks = allTasks.filter(task => {
    const row = rows.find(r => r._rawData[COL.workflowName] === task.workflowName);
    const status = row?._rawData[COL.projectStatus]?.toLowerCase();
    return status !== 'completed';
  });

  fs.writeFileSync(acceptedTasksPath, JSON.stringify(activeTasks, null, 2));
  return {
    activeTasks,
    completedCount: allTasks.length - activeTasks.length
    };
}

async function readStatusMapFromSheet() {
  const doc = new GoogleSpreadsheet(TRACKING_SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: CREDENTIALS.client_email,
    private_key: CREDENTIALS.private_key.replace(/\\n/g, '\n'),
  });
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[assignmentTabName];
  const rows = await sheet.getRows({ headerRow: 5, offset: 0 });

  const COL = {
    workflowName: 5,     // 'F'
    projectStatus: 11    // 'L'
  };

  const map = {};
  for (const row of rows) {
    const workflowName = row._rawData[COL.workflowName]?.trim();
    const status = row._rawData[COL.projectStatus]?.trim().toLowerCase();
    if (workflowName) {
      map[workflowName] = status;
    }
  }

  return map;
}

function summarizeTasks(tasks) {
  const now = dayjs();
  const today = now.startOf('day');
  const tomorrow = today.add(1, 'day');
  const parsed = tasks.map(task => ({ ...task, due: dayjs(task.plannedEndDate) }));

  const todayTasks = parsed.filter(t => t.due.isSame(today, 'day'));
  const tomorrowTasks = parsed.filter(t => t.due.isSame(tomorrow, 'day'));
  const afterTasks = parsed.filter(t => t.due.isAfter(tomorrow, 'day'));
  const alerts = parsed.filter(t => t.due.diff(now, 'minute') <= 15 && t.due.diff(now, 'minute') > 0);

  const sumWords = list => list.reduce((sum, t) => sum + (t.amountWords || 0), 0);

  return {
    totalOrders: parsed.length,
    totalWords: sumWords(parsed),
    todayOrders: todayTasks.length,
    todayWords: sumWords(todayTasks),
    tomorrowOrders: tomorrowTasks.length,
    tomorrowWords: sumWords(tomorrowTasks),
    afterOrders: afterTasks.length,
    afterWords: sumWords(afterTasks),
    alerts,
    tasks: parsed
  };
}

function formatReport(summary) {
  const now = dayjs().format('YYYY-MM-DD HH:mm');

  const lines = [
    `📊 *RWS Task Report* _(as of ${now})_`,
    `- In Progress: ${summary.totalOrders} orders (${summary.totalWords} words)`
  ];

  // ✅ แสดงชื่อ workflowName ใต้ In Progress
  summary.tasks.forEach(t => {
    lines.push(`         • ${t.workflowName}`);
  });

  if (summary.completedCount > 0) {
  lines.push(`- Completed Today: ${summary.completedCount} orders`);
    }

  lines.push(
    `- Due Today: ${summary.todayOrders} orders (${summary.todayWords} words)`,
    `- Due Tomorrow: ${summary.tomorrowOrders} orders (${summary.tomorrowWords} words)`,
    `- Due After Tomorrow: ${summary.afterOrders} orders (${summary.afterWords} words)`
  );

  return lines.join('\n');
}


async function sendToGoogleChat(text) {
  try {
    await axios.post(CHAT_WEBHOOK, { text });
  } catch (err) {
    console.error('❌ Failed to send to Google Chat:', err);
  }
} 

module.exports = {
  appendAcceptedTask,
  loadAndFilterTasks,
  summarizeTasks,
  formatReport,
  sendToGoogleChat,
  acceptedTasksPath,
  readStatusMapFromSheet
};
