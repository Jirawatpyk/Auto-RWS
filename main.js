require('dotenv').config();
const dayjs = require('dayjs');

const { startListeningEmails } = require('./IMAP/imapClient');
const { cleanupFetcher } = require('./IMAP/fetcher');
const { trackAmountWords, resetIfNewDay } = require('./Task/wordQuotaTracker');
const { pushStatusUpdate, broadcastToClients } = require('./Dashboard/server');
const { defaultConcurrency, DEFAULT_SHEET_KEY } = require('./Config/configs');
const { initLoginSession } = require('./LoginSession/initLoginSession');
const { appendStatusToMainSheet } = require('./Sheets/sheetWriter');
const { markAcceptedWithRetry } = require('./Sheets/markAcceptedByOrderId');
const runTaskInNewBrowser = require('./Task/runTaskInNewBrowser');
const { TaskQueue } = require('./Task/taskQueue');
const { startTaskSchedule } = require('./Task/taskScheduler');
const { appendAcceptedTask, loadAndFilterTasks, summarizeTasks, formatReport, sendToGoogleChat } = require('./Task/taskReporter');
const { saveCookies } = require('./Session/sessionManager');
const { logSuccess, logFail, logInfo, logProgress, logBanner } = require('./Logs/logger');
const { notifyGoogleChat } = require('./Logs/notifier');
const { incrementStatus } = require('./Dashboard/statusManager/taskStatusStore');
const { recordFailure, resetFailure } = require('./Task/consecutiveFailureTracker');
const { getAvailableDates, canFitWithinDeadline, applyCapacity, getReport, getTotalWords, releaseCapacity, getUsedDates, resetCapacityMap } = require('./Task/CapacityTracker');

const MAX_LOGIN_RETRIES = 3;
//const START_TIME = new Date();

  function adjustDeadline(plannedEndDate) {
  const deadline = dayjs(plannedEndDate, [
    'YYYY-MM-DD', 'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY',
    'YYYY-MM-DD HH:mm', 'DD.MM.YYYY h:mm A',
    'DD/MM/YYYY h:mm A', 'DD-MM-YYYY h:mm A'
  ], true);

  if (!deadline.isValid()) return dayjs.invalid();

  if (deadline.hour() === 0 && deadline.minute() === 0) {
    const adjusted = deadline.subtract(1, 'day').set('hour', 23).set('minute', 59);
    logInfo(`⏰ Adjusted deadline to ${adjusted.format('YYYY-MM-DD HH:mm')} (original was 00:00)`);
    return adjusted;
  }

  return deadline;
}

(async () => {
  logBanner();
  startTaskSchedule();
  let loginSuccess = false;
  let browserHolder = { value: null };

  for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
    try {
      logInfo(`🔁 Attempting Login ${attempt}...`);
      const { browser, mainPage } = await initLoginSession();
      await saveCookies(mainPage);
      browserHolder.value = browser;
      logSuccess(`✅ Login successful! Starting task automation system...`);
      loginSuccess = true;
      break;
    } catch (err) {
      logFail(`⚠️ [Auto RWS] Login failed (${attempt}): ${err.message}`, true);
    }
  }

  if (!loginSuccess) {
    logFail(`❌ [Auto RWS] Login failed after all attempts. Exiting system.`, true);
    process.exit(1);
  }

  resetIfNewDay();
  let totalTasks = 0;
  let successful = 0;

  const queue = new TaskQueue({
    concurrency: defaultConcurrency,
    onSuccess: async (res) => {
    	
	successful++;
	resetFailure();
	
	  if (res?.context?.allocationPlan) {
		applyCapacity(res.context.allocationPlan);
		broadcastToClients({ type: "capacityUpdated" });
    	
		const planStr = res.context.allocationPlan.map(d => `${d.date} (${d.amount})`).join(', ');
		const words = res.amountWords || 0;
		logSuccess(`✅ Task completed | Order ID: ${res.orderId} | Applied ${words} words | Allocated: ${planStr}`, true);
		//logSuccess(`✅ Order ID: ${res.orderId} | Task completed`);
	}
	
	if (res?.orderId) {
		appendAcceptedTask({
		timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
		orderId: res.orderId,
		workflowName: res.workflowName,
		url: res.url,
		amountWords: res.amountWords,
		plannedEndDate: res.plannedEndDate
		});
	   await markAcceptedWithRetry(res.orderId);
	   await trackAmountWords(res.amountWords, notifyGoogleChat);
	}
    },
    onError: async (err) => {
	//logFail(`❌  [Auto RWS] Order ID: ${err.orderId} | Task failed: ${err.message}`, true);
	logFail(`❌ Task failed | Order ID: ${err.orderId} | Reason: ${err.message}`, true);
	await recordFailure();
      
	if (err.context?.allocationPlan) {
		releaseCapacity(err.context.allocationPlan);
		logInfo(`🔁 Released capacity from failed task`);
	}
    },
    onQueueEmpty: async () => {
	logInfo(`🎯 Task Summary: Total: ${totalTasks} | Success: ${successful}`);
	logInfo(`🟢 Queue is now empty.`);
	if (browserHolder.value) await browserHolder.value.close();
    }
  });

	startListeningEmails(async({ orderId, workflowName, url, amountWords, plannedEndDate }) => {
	
	const now = dayjs();
	const rawDeadline = adjustDeadline(plannedEndDate);
	const deadline = rawDeadline;

	const deadlineHour = deadline.hour();
	const isDeadlineNight = deadlineHour < 9 || deadlineHour >= 19;
	const isUrgentDeadline = deadline.diff(now, 'hour') <= 6;

	// ❌ Reject: deadline เร่งด่วน + อยู่นอกเวลาทำการ
	if (isUrgentDeadline && isDeadlineNight) {
		const msg = `⛔ [Auto RWS] Rejected: Urgent deadline outside working hours (${deadline.format('YYYY-MM-DD')})`;
		logFail(msg, true);
		await appendStatusToMainSheet({
		timestamp: now.format('YYYY-MM-DD HH:mm:ss'),
		url,
		status: '❌ Reject',
		reason: msg,
		sheetKey: DEFAULT_SHEET_KEY
		});
	return;
	}

	// ✅ รับได้: เร่งด่วนแต่อยู่ในเวลาทำการ หรือ deadline ปกติ
	if (isUrgentDeadline && !isDeadlineNight) {
		const msg = `✅ Accepted: Urgent deadline within working hours (${deadline.format('YYYY-MM-DD')})`;
		logSuccess(msg, false);
	} else if (!isUrgentDeadline) {
		const msg = `✅ Accepted: Normal deadline (${deadline.format('YYYY-MM-DD')})`;
		logSuccess(msg, false);
	}

	//ถ้า deadline เป็นตอนกลางคืน (ก่อน 09:00) → ต้องเสร็จก่อนหน้านั้น
	const isNightDeadline = rawDeadline.hour() < 9;
	//สร้าง deadline ที่จะใช้ในการจัดสรรจริง
const effectiveDeadline = isNightDeadline
  ? rawDeadline.subtract(1, 'day').endOf('day') // วางวันก่อนหน้า
  : rawDeadline;

	//จัดสรรคำตาม deadline ที่วางงานได้จริง
	const cutoff = now.set('hour', 19).set('minute', 0);
	const excludeToday = now.isAfter(cutoff);

	const allocationPlan = getAvailableDates(amountWords, effectiveDeadline, excludeToday);
	const lastDate = allocationPlan.at(-1)?.date || 'N/A';
	logInfo(`📌 Last allocated date = ${lastDate} | Deadline = ${rawDeadline.format('YYYY-MM-DD HH:mm')} | Effective = ${effectiveDeadline.format('YYYY-MM-DD')}`);
	const totalPlanned = allocationPlan.reduce((sum, d) => sum + d.amount, 0);

	if (totalPlanned < amountWords) {
		const msg = `⛔ [Auto RWS] Rejected: Over capacity — required ${amountWords} words by ${deadline.format('YYYY-MM-DD')}, but only ${totalPlanned} could be allocated.`;
		logFail(msg, true);
		await appendStatusToMainSheet({
		timestamp: now.format('YYYY-MM-DD HH:mm:ss'),
		url,
		status: '❌ Reject',
		reason: msg,
		sheetKey: DEFAULT_SHEET_KEY
		});
	return;
	}

	const dateList = allocationPlan.map(d => d.date);
	logInfo(`⏳ Allocated: ${dateList.join(', ')}`);

	totalTasks++;
	const taskStartTime = dayjs().format('YYYY-MM-DD HH:mm:ss');
	logProgress(`⚙️ Starting task for Order ID: ${orderId}`);

	queue.addTask(async () => {
		const context = { allocationPlan };
		incrementStatus("pending");
		pushStatusUpdate();
		
	/*await appendStatusToMainSheet({
		timestamp: taskStartTime,
		url,
		status: '⚙️ In Progress',
		reason: 'Started',
		sheetKey: DEFAULT_SHEET_KEY
	});*/
		
	broadcastToClients({
		type: 'logEntry',
		log: {
		time: taskStartTime, url, status: "⚙️ In Progress", reason: "Started"}
	});

	const result = await runTaskInNewBrowser({ task: { url, orderId } });
	 
	const taskEndTime = dayjs().format('YYYY-MM-DD HH:mm:ss');
	
	/*await appendStatusToMainSheet({
		timestamp: taskEndTime,
		url: result.url,
		status: result.success ? '✅ Success' : '❌ Fail',
		reason: result.reason || '',
		sheetKey: DEFAULT_SHEET_KEY
	});*/

	incrementStatus(result.success ? "success" : "error");
	pushStatusUpdate();
      
        setTimeout(() => {
          broadcastToClients({
            type: 'logEntry',
            log: {
              time: taskStartTime,
              url,
              status: result.success ? "✅ Success" : "❌ Fail",
              reason: result.reason || ""
            }
          });
        }, 50);

	if (!result.success) {
		const error = new Error(result.reason);
		error.orderId = orderId;
  		throw error;
	}

	return { ...result, orderId, workflowName, url, amountWords, plannedEndDate: deadline.format('YYYY-MM-DD HH:mm'), context };
    });
  });
})();

process.on('SIGINT', async () => {
  console.log('🧪 SIGINT received'); 
  await notifyGoogleChat('🔴 [Auto RWS] System shutdown initiated (SIGINT)');
  await cleanupFetcher();
  await new Promise(res => setTimeout(res, 500));
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await notifyGoogleChat('🔴 [Auto RWS] System shutdown requested (SIGTERM)');
  await cleanupFetcher();
  await new Promise(res => setTimeout(res, 500));
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  logFail('🔥 Uncaught Exception:', err);
  await notifyGoogleChat(`❌ [Auto RWS] System crash: ${err.message}`);
  await cleanupFetcher();
  await new Promise(res => setTimeout(res, 500));
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logFail('🔥 Unhandled Promise Rejection:', reason);
  await notifyGoogleChat(`❌ [Auto RWS] Unhandled rejection: ${reason}`);
  await cleanupFetcher();
  await new Promise(res => setTimeout(res, 500));
  process.exit(1);
});
