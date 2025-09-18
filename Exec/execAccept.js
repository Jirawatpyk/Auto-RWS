const retry = require('../Utils/retryHandler');
const withTimeout = require('../Utils/taskTimeout');
const { logSuccess, logFail, logInfo, logProgress } = require('../Logs/logger');

async function waitUntilPageIsReady(page) {
  try {
    // ✅ รอให้ modal (.modal-message) และข้อความ "Please wait" หายไป
    await page.waitForFunction(() => {
      const modal = document.querySelector('.modal-message');
      const text = document.body.innerText;
      return (!modal || modal.offsetParent === null) &&
             !text.includes("Please wait a few moments") &&
             !text.includes("Please wait");
    }, { timeout: 20000 });

    // ✅ รอ navigation หรือ fallback ถ้าไม่มี navigation
    const navResult = await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.waitForTimeout(3000).then(() => 'no-navigation')
    ]);

    if (navResult === 'no-navigation') {
      logInfo('⚠️ No further navigation detected (acceptable)');
    }

    logSuccess('✅ Page fully loaded and ready.');
  } catch (err) {
    throw new Error(`❌ Page did not load in time: ${err.message}`);
  }
}

async function checkTaskStatus(page) {
  try {
    const statusText = await page.$eval('#entityStatus', el => el.innerText.trim().toLowerCase());
    if (['in progress', 'on hold'].includes(statusText)) {
      logFail(`⛔ Status not allowed: ${statusText}`);
      return { allowed: false, reason: `⛔ Status is not eligible: ${statusText}` };
    }
    return { allowed: true };
  } catch (err) {
    logFail(`⚠️ Failed to check status: ${err.message}`);
    return { allowed: false, reason: `⚠️ Unable to read status: ${err.message}` };
  }
}

// ✅ Step 1: คลิก Change Status พร้อม Retry ภายใน
async function step1_ChangeStatus(page) {
  try {
    const selector = '#taskActionConfirm';
	
    await page.waitForFunction(sel => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      return (
        el.offsetParent !== null &&
        !el.disabled &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight
      );
    }, { timeout: 10000 }, selector);

    await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        el.click();
      }
    }, selector);

   logSuccess('✅ STEP 1: Clicked Change Status button.');
    return { success: true };
  } catch (err) {
    return { success: false, reason: `❌ STEP 1 failed: ${err.message}` };
  }
}

// ✅ Step 2–6: Workflow หลัก พร้อม Retry จากภายนอก
async function step2to6_Workflow(page) {
  try {
    const currentUrl = page.url();

    logProgress('🔁 STEP 2+: Waiting for page to be ready...');
    await waitUntilPageIsReady(page);
    //logSuccess('✅ Page ready. Continuing to STEP 2...');

    if (!currentUrl.includes('/attachments')) {
      //console.log('🟦 ขั้นตอน 2: เปิดแท็บ Attachments');
      const selector = 'a[href$="/attachments"]';
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.scrollIntoView({ block: 'center' });
            el.click();
          }
        }, selector);
        logSuccess('✅ STEP 2: Attachments tab opened.');
      } catch (err) {
        return { success: false, reason: `❌ STEP 2 failed: ${err.message}` };
      }
    } else {
      logInfo('✅ Already in Attachments tab. Skipping STEP 2.');
    }

    //console.log(`ขั้นตอน 3: ขยายหมวด Source`);
    await page.waitForTimeout(1500);
    try {
      const sourceChevronXPath = "//div[contains(@class,'grid-row') and .//span[contains(normalize-space(.), 'Source')]]//span[contains(@class,'grid-chevron-icon')]";
      const maxTries = 3;
      let success = false;

      for (let i = 1; i <= maxTries; i++) {
        //logInfo(`🔁 STEP 3: Attempt ${i} to locate Source chevron...`);
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(400);
        try {
          await page.waitForXPath(sourceChevronXPath, { timeout: 3000 });
          const sourceChevron = await page.$x(sourceChevronXPath);

          if (sourceChevron.length > 0) {
            let className = await page.evaluate(el => el.className, sourceChevron[0]);

            if (className.includes('fa-angle-right')) {
              logSuccess('✅ STEP 3: Source section is collapsed. Expanding...');
              await sourceChevron[0].click();
              await page.waitForTimeout(800);
            } else {
              logSuccess('✅ STEP 3: Source section already expanded.');
            }

            success = true;
            break;
          }
        } catch (innerErr) {
          logFail(`⚠️ STEP 3: Attempt ${i} failed.`);
        }
        await page.waitForTimeout(1000);
      }

      if (!success) {
        throw new Error('❌ Source chevron not found after retries.');
      }
    } catch (err) {
      return { success: false, reason: `❌ STEP 3 failed: ${err.message}` };
    }

    //console.log(`ขั้นตอน 4: คลิกลิงก์เพื่อเซ็ต Licence`);
    try {
      const fileLink = await page.waitForSelector('a[onclick^="TMS.startTranslation"]', { timeout: 10000 });
      await fileLink.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
      await page.evaluate(el => el.click(), fileLink);
      await page.waitForTimeout(2000);
      logSuccess('✅ STEP 4: File link clicked.');
    } catch (err) {
      return { success: false, reason: `❌ STEP 4 failed: ${err.message}` };
    }

    //console.log(`ขั้นตอน 5: เลือก Licence เป็น EQHOmoraviateam`);
    try {
      await page.waitForSelector('.modal-content, .popup-container', { timeout: 10000 });

  // STEP 5.1: คลิก dropdown
      const licenceDropdown = await page.waitForSelector('#select2-chosen-1', { timeout: 10000 });
      await licenceDropdown.click();
      await page.waitForTimeout(500);

  // STEP 5.2: รอและเลือก option
      const option = await page.waitForXPath("//div[contains(@class, 'select2-result-label') and contains(text(), 'EQHOmoraviateam')]", { timeout: 10000 });
      await option.click();

      logSuccess('✅ STEP 5: Licence selected.');
    } catch (err) {
      return { success: false, reason: `❌ STEP 5 failed: ${err.message}` };
    }

    //console.log(`ขั้นตอน 6: คลิก "Set licence"`);
    try {
      const setBtn = await page.waitForSelector('button.btn.btn-primary.js_loader', { timeout: 5000 });
      await setBtn.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.evaluate(el => el.click(), setBtn);
      logSuccess('✅ STEP 6: Licence set successfully.');
    } catch (err) {
      return { success: false, reason: `❌ STEP 6 failed: ${err.message}` };
    }

    return { success: true, reason: '✅ Licence set successfully.' };
  } catch (err) {
    return { success: false, reason: `❌ Steps 2–6 failed: ${err.message}` };
  }
}

async function checkLoginStatus(page) {
  	const currentUrl = page.url();
  	const title = await page.title();
  	if (currentUrl.includes('login') || title.toLowerCase().includes('sign in')) {
    	logFail(`❌ Login session expired → ${currentUrl}`, true);  // ✅ แจ้งเตือนผ่าน logFail อย่างเดียว
    	return false;
  	}
  	return true;
	}

// ✅ ฟังก์ชันหลักที่เรียกใช้งาน
module.exports = async function execAccept({ page, url }) {
  try {
  	 //logInfo(`🌐 Navigating to ${url}`);
	let currentPage = page;

    try {
      await currentPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (gotoErr) {
      logInfo(`❌ First goto failed: ${gotoErr.message} — retrying with new tab...`);

      try {
        const newPage = await page.browser().newPage();
        await newPage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        if (page !== newPage) await page.close();
            logSuccess('✅ Retried with new tab and succeeded.');

        currentPage = newPage; // ✅ ใช้หน้าใหม่ต่อจากนี้

      } catch (retryErr) {
        return {
          success: false,
          reason: `❌ Retry goto failed: ${retryErr.message}`,
          url
        };
      }
    }

	if (!(await checkLoginStatus(currentPage))) {
      return { success: false, reason: 'Login expired or redirected to login page' };
	}

   const taskStatus = await checkTaskStatus(currentPage);  // ✅ เช็คสถานะ
    if (!taskStatus.allowed) {
      return { success: false, reason: taskStatus.reason };
    }

	const step1WithTimeout = async () => await withTimeout(() => step1_ChangeStatus(currentPage), 10000);
	const step2WithTimeout = async () => await withTimeout(() => step2to6_Workflow(currentPage), 20000);

	const step1 = await retry(step1WithTimeout, 2, 1000);
	if (!step1.success) return step1;

	const step2to6 = await retry(step2WithTimeout, 2, 1000);
	return step2to6;
	} catch (err) {
	return { success: false, reason: `❌ Error: ${err.message}` };
  }
};
