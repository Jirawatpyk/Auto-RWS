async function retry(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        console.warn(`🔁 Retry attempt ${attempt} failed: ${err.message}`);
        await new Promise(res => setTimeout(res, delayMs * attempt)); // exponential backoff
      }
    }
  }
  throw lastError;
}

module.exports = { retry };
