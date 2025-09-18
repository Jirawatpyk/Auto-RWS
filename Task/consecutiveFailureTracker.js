const { notifyGoogleChat } = require('../Logs/notifier');
const { logFail } = require('../Logs/logger');

let failureCount = 0;
const FAILURE_THRESHOLD = process.env.FAILURE_THRESHOLD ? parseInt(process.env.FAILURE_THRESHOLD) : 3;

async function recordFailure(context = 'Auto RWS System') {
  failureCount++;
  if (failureCount >= FAILURE_THRESHOLD) {
    await notifyGoogleChat(`🚨 [${context}] ${failureCount} consecutive task failures — please check the system.`);
    failureCount = 0;
  }
}

function resetFailure() {
  failureCount = 0;
}

module.exports = {
  recordFailure,
  resetFailure
};
