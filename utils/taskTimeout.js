module.exports = function withTimeout(fn, timeoutMs) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`⏰ Task timeout after ${timeoutMs} ms`)), timeoutMs)
    )
  ]);
};
