const { logInfo, logFail } = require('../Logs/logger');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function retry(taskFn, retries = 3, delayMs = 1000) {
  const totalAttempts = retries + 1;
  let lastResult;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const label = attempt === 1 ? '🟢 First attempt' : `🔁 Retry ${attempt}/${totalAttempts}`;
     logInfo(`${label} → (${taskFn.name || 'anonymous'})`);

    try {
      const result = await taskFn();

      if (result?.success === true) {
         logInfo(`✅ Success on attempt ${attempt}/${totalAttempts} → (${taskFn.name || 'anonymous'})`);
        return result;
      }

      lastResult = result;
      logFail(`⚠️ Retry failed (${attempt}/${totalAttempts}): ${result?.reason || 'Unknown reason'}`);
    } catch (err) {
      logFail(`⚠️ Retry exception (${attempt}/${totalAttempts}): ${err.message}`);
    }

    if (attempt < totalAttempts) {
      await delay(delayMs);
    }
  }

  if (lastResult) {
    return lastResult;
  }

  throw new Error(`❌ All ${totalAttempts} attempts failed for ${taskFn.name || 'anonymous'}`);
};
