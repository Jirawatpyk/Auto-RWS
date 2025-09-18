const puppeteer = require('puppeteer');
const { saveCookies } = require('../Session/sessionManager');
const { logSuccess, logFail, logInfo, logProgress, logBanner } = require('../Logs/logger');
const axios = require('axios');
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASS;
const OTP_TIMEOUT_MS = process.env.OTP_TIMEOUT_MS ? parseInt(process.env.OTP_TIMEOUT_MS) : 60000;

if (!EMAIL || !PASSWORD) {
  throw new Error("❌ ไม่พบ LOGIN_EMAIL หรือ LOGIN_PASS ใน .env");
}

async function stepLoginEmail(page) {
  await logInfo("✉️ Type Email...");
  await page.waitForSelector('input[type=email]', { timeout: 15000 });
  await page.type('input[type=email]', EMAIL, { delay: 80 });
  await page.click('input[type=submit]');
  await page.waitForTimeout(2000);
}

async function stepLoginPassword(page) {
  await logInfo("🔒 Type Password...");
  await page.waitForSelector('input[type=password]', { timeout: 15000 });
  await page.type('input[type=password]', PASSWORD, { delay: 80 });
  await page.click('input[type=submit]');
  await page.waitForTimeout(3000);
}

async function stepWaitOtp(page) {
  await logProgress(`🕐 กรุณาใส่ OTP ภายใน ${OTP_TIMEOUT_MS / 1000} วินาที...`);
  await page.waitForTimeout(OTP_TIMEOUT_MS);

  const pageUrl = page.url();
  const content = await page.content();
  if (pageUrl.includes('microsoftonline.com') || content.includes('Keep your account secure')) {
    throw new Error("❌ OTP failed or remains on Microsoft page → Auto-login failed");
  }
}

async function waitForManualLoginSuccess(page) {
  await logInfo(`🧑‍💻 [Manual Mode] กรุณา Login ด้วยตนเองภายใน ${OTP_TIMEOUT_MS / 1000} วินาที...`);
  await page.goto('https://login.microsoftonline.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(OTP_TIMEOUT_MS);

  const pageUrl = page.url();
  const content = await page.content();
  if (pageUrl.includes('microsoftonline.com') || content.includes('Keep your account secure')) {
    throw new Error("⛔ Manual Login failed → System shutdown");
  }
}

function normalizeUrl(url) {
  const mode = process.env.MORAVIA_REWRITE_MODE;

  if (mode === 'projects-new') {
    return url.replace('projects.moravia.com', 'projects-new.moravia.com');
  }

  return url; // default: no rewrite
}

async function initLoginSession() {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: puppeteer.executablePath(),
    userDataDir: './user_data',
    defaultViewport: { width: 1200, height: 800 },
    args: ['--no-sandbox', '--window-size=1200,800']
  });

  const pages = await browser.pages();
  const mainPage = pages[0];

  await logInfo("🌐 Opening the projects page...");
  const url = normalizeUrl('https://projects.moravia.com/');
  await mainPage.goto(url, { waitUntil: 'networkidle2' });
  await mainPage.waitForTimeout(3000)

  const currentUrl = mainPage.url();
  if (currentUrl.includes('login') || currentUrl.includes('microsoftonline')) {
    await logInfo('🔐 Not logged in yet... Start Auto-Login');

    try {
      await mainPage.goto('https://login.microsoftonline.com/', { waitUntil: 'networkidle2' });

      await stepLoginEmail(mainPage);
      await stepLoginPassword(mainPage);
      await stepWaitOtp(mainPage);

      await logSuccess("✅ Auto-Login Successful");
      await saveCookies(mainPage);
      await logInfo('💾 Session cookies saved');
    } catch (err) {
      await logFail(`⚠️ Auto-Login failed: ${err.message}`);

      try {
        await waitForManualLoginSuccess(mainPage);
        await logSuccess("✅ Manual Login Successful");
        await saveCookies(mainPage);
        await logInfo('💾 Session cookies saved');
      } catch (manualErr) {
        await logFail(manualErr.message);
        await browser.close();
        process.exit(1);
      }
    }
  } else {
    await  logInfo("✅ Valid session detected → Skipping login");
    await saveCookies(mainPage);
    await logInfo('💾 Session cookies saved');
  }

  return { browser, mainPage };
}

module.exports = { initLoginSession };
