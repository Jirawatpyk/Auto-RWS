const puppeteer = require('puppeteer');
const { saveCookies } = require('../Session/sessionManager');
const { logSuccess, logFail, logInfo, logProgress } = require('../Logs/logger');

const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASS;
const LOGIN_TIMEOUT_MS = process.env.LOGIN_TIMEOUT_MS ? parseInt(process.env.LOGIN_TIMEOUT_MS) : 90000;

if (!EMAIL || !PASSWORD) {
  throw new Error("❌ ไม่พบ LOGIN_EMAIL หรือ LOGIN_PASS ใน .env");
}

async function isLoggedIn(page) {
  const url = page.url().toLowerCase();
  return url.includes('projects.moravia.com') && !url.includes('login');
}

async function waitForLoginSuccess(page, timeout) {
  logProgress(`[Auth] Waiting for successful login... (Timeout: ${timeout / 1000}s)`);
  
  const checkInterval = 2000;
  const endTime = Date.now() + timeout;

  while (Date.now() < endTime) {
    if (await isLoggedIn(page)) {
      logSuccess("✅ [Auth] Login successful!");
      return;
    }
    await page.waitForTimeout(checkInterval);
  }

  throw new Error(`❌ Login did not complete within the timeout period.`);
}

// ==================================================================
// ✅ [IMPROVEMENT] ปรับปรุงฟังก์ชันนี้ให้ฉลาดขึ้น
// ==================================================================
async function performAutoLogin(page) {
  logInfo("▶️ Starting Auto-Login process...");
  
  await page.goto('https://login.microsoftonline.com/', { waitUntil: 'networkidle2' });

  try {
    const emailSelector = 'input[type=email]';
    const passwordSelector = 'input[type=password]';

    // รอว่า element ไหนจะปรากฏก่อนกัน ระหว่างช่องอีเมลกับช่องรหัสผ่าน
    logInfo("🕵️ Determining login step...");
    const firstVisibleSelector = await Promise.race([
      page.waitForSelector(emailSelector, { timeout: 10000 }).then(() => emailSelector),
      page.waitForSelector(passwordSelector, { timeout: 10000 }).then(() => passwordSelector)
    ]);

    // ✅ กรณีเจอช่องอีเมล (ขั้นตอนปกติ)
    if (firstVisibleSelector === emailSelector) {
      logInfo("✉️ Email input found. Proceeding with full login.");
      await page.type(emailSelector, EMAIL, { delay: 50 });
      await page.click('input[type=submit]');
      
      logInfo("🔒 Waiting for password input...");
      await page.waitForSelector(passwordSelector, { timeout: 15000 });
      await page.type(passwordSelector, PASSWORD, { delay: 50 });
    } 
    // ✅ กรณีเจอช่องรหัสผ่านเลย (ข้ามขั้นตอนอีเมล)
    else if (firstVisibleSelector === passwordSelector) {
      logInfo("⏩ Email step was skipped. Proceeding directly to password.");
      await page.type(passwordSelector, PASSWORD, { delay: 50 });
    }

    logInfo("🔑 Submitting credentials...");
    await page.click('input[type=submit]');
    
    logProgress("[Auth] Password submitted. Waiting for authentication (e.g., OTP approval)...");

  } catch (error) {
    throw new Error(`Failed during login sequence: ${error.message}`);
  }
}

async function initLoginSession() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: puppeteer.executablePath(),
    userDataDir: './user_data',
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--window-size=1280,800']
  });

  const mainPage = (await browser.pages())[0];
  const targetUrl = 'https://projects.moravia.com/';

  await logInfo(`🌐 Navigating to target page...`);
  await mainPage.goto(targetUrl, { waitUntil: 'networkidle2' });

  if (await isLoggedIn(mainPage)) {
    logSuccess("✅ Valid session found. Skipping login.");
  } else {
    logInfo("🔐 Login required. Attempting login sequence...");
    try {
      await performAutoLogin(mainPage);
      await waitForLoginSuccess(mainPage, LOGIN_TIMEOUT_MS);
    } catch (err) {
      logFail(`❌ Login process failed: ${err.message}`);
      logInfo("Please try logging in manually in the browser window.");
      try {
        await waitForLoginSuccess(mainPage, LOGIN_TIMEOUT_MS);
      } catch (manualErr) {
        logFail(`❌ Manual login also failed or timed out. Shutting down.`);
        await browser.close();
        process.exit(1);
      }
    }
  }

  await saveCookies(mainPage);
  logInfo('💾 Session cookies saved/updated.');

  return { browser, mainPage };
}

module.exports = { initLoginSession };