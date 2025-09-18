// /Task/taskScheduler.js
const dayjs = require('dayjs');
const isBusinessDay = require('./isBusinessDay');
const {
  loadAndFilterTasks,
  summarizeTasks,
  formatReport,
  sendToGoogleChat,
  acceptedTasksPath,
  readStatusMapFromSheet
} = require('./taskReporter');
const fs = require('fs');
const { logSuccess, logFail, logInfo } = require('../Logs/logger');

function scheduleDailyAt(hour, minute, taskFn, label) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const delay = target - now;

  logInfo(`[INIT] Scheduled daily "${label}" in ${Math.round(delay / 1000)} sec`);
  setTimeout(() => {
    const wrapped = async () => {
      if (!isBusinessDay(dayjs())) {
        logInfo(`[SKIP] ${label} – Not a business day`);
        return;
      } 
      try {
        await taskFn();
      } catch (err) {
        logFail(`❌ ${label} failed:`, err);
      }
    };
    wrapped(); // run first time
    setInterval(wrapped, 24 * 60 * 60 * 1000);
  }, delay);
}

function startTaskSchedule() {
  scheduleDailyAt(9, 0, async () => {
    logSuccess('📅 Running daily task report at 09:00...');
    const { activeTasks, completedCount } = await loadAndFilterTasks();
    const summary = summarizeTasks(activeTasks);
    summary.completedCount = completedCount;
    const message = formatReport(summary);
    await sendToGoogleChat(message);
  }, '09:00 Report');

  scheduleDailyAt(15, 0, async () => {
    logSuccess('📅 Running daily task report at 15:00...');
    const { activeTasks, completedCount } = await loadAndFilterTasks();
    const summary = summarizeTasks(activeTasks);
    summary.completedCount = completedCount;
    const message = formatReport(summary);
    await sendToGoogleChat(message);
  }, '15:00 Report');

  scheduleDailyAt(18, 0, async () => {
    logSuccess('📅 Running daily task report at 18:00...');
    const { activeTasks, completedCount } = await loadAndFilterTasks();
    const summary = summarizeTasks(activeTasks);
    summary.completedCount = completedCount;
    const message = formatReport(summary);
    await sendToGoogleChat(message);
  }, '18:00 Report');

setInterval(async () => {
  if (!isBusinessDay(dayjs())) return;
  try {
    if (!fs.existsSync(acceptedTasksPath)) return;
    const raw = fs.readFileSync(acceptedTasksPath);
    const allTasks = JSON.parse(raw);

    const statusMap = await readStatusMapFromSheet();

    const activeTasks = allTasks.filter(task => {
      const status = statusMap[task.workflowName]?.toLowerCase();
      return status !== 'completed';
    });

    const summary = summarizeTasks(activeTasks);
    if (summary.alerts.length > 0) {
      const alertMessage = [
        `⚠️ *RWS Alert — Orders Due < 15 mins!*`,
        ...summary.alerts.map(t => `• ${t.workflowName} (due ${t.due.format('HH:mm')})`)
      ].join('\n');
      await sendToGoogleChat(alertMessage);
      logSuccess(`⚠️ Alert sent: ${summary.alerts.length} orders`);
    }
  } catch (err) {
  logFail(`❌ Alert checker failed: ${err.message || err}`, true);
    }
  }, 10 * 60 * 1000); // every 10 minutes
}

module.exports = { startTaskSchedule };
