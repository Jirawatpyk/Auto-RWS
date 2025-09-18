const puppeteer = require('puppeteer');
const { logInfo, logFail, logSuccess, logProgress } = require('../Logs/logger');
const { saveCookies } = require('../Session/sessionManager');
const EMAIL = process.env.LOGIN_EMAIL;
const PASSWORD = process.env.LOGIN_PASS;
const OTP_TIMEOUT_MS = parseInt(process.env.OTP_TIMEOUT_MS || '180000', 10);

async function waitForAndType(page, selectors, value) {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.type(selector, value, { delay: 80 });
      return true;
    } catch (e) {
      continue;
    }
  }
  return false;
}

async function stepLoginEmail(page) {
  logProgress('📧 Step 1: Login Email');
  const emailSelectors = ['input[type=email]', 'input[name=loginfmt]', '#i0116'];
  const typed = await waitForAndType(page, emailSelectors, EMAIL);
  if (!typed) throw new Error("❌ Email input not found");
  await Promise.any([
    page.keyboard.press('Enter'),
    page.click('input[type=submit], button[type=submit], #idSIButton9')
  ]);
  await page.waitForTimeout(2000);
}

async function stepSelectUserIfPresent(page) {
  const userTileSelector = '.userTile, #otherTileText';
  try {
    await page.waitForSelector(userTileSelector, { timeout: 3000 });
    await page.click(userTileSelector);
    await page.waitForTimeout(1500);
    logInfo('👤 คลิกเลือก user สำเร็จ');
    return true;
  } catch {
    return false;
  }
}

async function stepLoginPassword(page) {
  logProgress('🔐 Step 2: Login Password');
  const passSelectors = ['input[type=password]', '#i0118'];
  const typed = await waitForAndType(page, passSelectors, PASSWORD);
  if (!typed) throw new Error("❌ Password input not found");
  await Promise.any([
    page.keyboard.press('Enter'),
    page.click('input[type=submit], button[type=submit], #idSIButton9')
  ]);
  await page.waitForTimeout(3000);
}

async function handleStaySignedIn(page) {
  try {
    const selector = 'input[id="idBtn_Back"], input[value="No"], #idBtn_Back';
    await page.waitForSelector(selector, { timeout: 3000 });
    await page.click(selector);
    await page.waitForTimeout(1000);
    logInfo('🔒 Bypassed stay signed in screen.');
  } catch {}
}

async function waitForOTPConfirmation(page, timeoutMs = OTP_TIMEOUT_MS) {
  logInfo('🕐 รอ OTP จากผู้ใช้...');
  const start = Date.now();
  while ((Date.now() - start) < timeoutMs) {
    const currentUrl = page.url();
    const title = await page.title();
    if (!currentUrl.includes('login') && !title.toLowerCase().includes('sign in')) {
      logInfo('✅ OTP ผ่านแล้ว → login สำเร็จ');
      return true;
    }
    await page.waitForTimeout(2000);
  }
  throw new Error('❌ OTP ไม่ถูกกรอกในเวลาที่กำหนด');
}

async function launchBrowserWithLogin() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('❌ Missing LOGIN_EMAIL or LOGIN_PASS in .env');
  }

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    userDataDir: './user_data',
    args: ['--no-sandbox', '--start-maximized']
  });

  const page = (await browser.pages())[0];
  await page.goto('https://projects-new.moravia.com/', { waitUntil: 'domcontentloaded' });

  // ถ้า login อยู่แล้วไม่ต้องทำซ้ำ
  const currentUrl = page.url();
  if (!currentUrl.includes('login')) {
    logSuccess('✅ Already logged in (session restored)');
    return { browser, mainPage: page };
  }

  try {
    logProgress('🚀 Starting auto login...');
    await page.goto('https://login.microsoftonline.com/', { waitUntil: 'domcontentloaded' });
    await stepLoginEmail(page);
    await stepSelectUserIfPresent(page);
    await stepLoginPassword(page);
    await handleStaySignedIn(page);
    await waitForOTPConfirmation(page);
    await saveCookies(page);
    logSuccess('✅ Login completed successfully. Cookies saved.');
    return { browser, mainPage: page };
  } catch (err) {
    logFail(`❌ Auto login failed: ${err.message}`);
    logInfo('🔓 เปิด browser ให้ manual login ต่อได้เลย...');

    try {
      await waitForOTPConfirmation(page);
      await saveCookies(page);
      logSuccess('✅ Manual login completed. Cookies saved.');
    } catch (e) {
      logFail(`❌ Manual login ยังไม่สำเร็จ: ${e.message}`);
    }

    return { browser, mainPage: page };
  }
}

module.exports = { initLoginSession: launchBrowserWithLogin };
