const { logSuccess, logFail, logInfo, logProgress } = require('../Logs/logger');
/**
 * clickHelper.js
 * ----------------
 * ฟังก์ชัน tryClick ใช้คลิกปุ่มตาม XPath โดยจะ retry ซ้ำตามเวลาที่กำหนด
 * เหมาะสำหรับใช้กับ Puppeteer ที่ต้องรอ element ปรากฏแบบไม่แน่นอน
 */

/**
 * พยายามคลิกปุ่มจาก XPath โดย retry ภายในเวลารวมที่กำหนด
 * @param {object} page - Puppeteer Page object
 * @param {string} xpath - XPath ของปุ่ม
 * @param {number} maxWaitTimeMs - เวลารวมที่รอได้ (default = 15000ms)
 * @param {number} delayPerTryMs - เวลารอระหว่างรอบ (default = 1000ms)
 * @param {string} label - ป้ายชื่อปุ่มที่ใช้ใน log (optional)
 * @returns {boolean} - true ถ้าคลิกสำเร็จ, false ถ้าเกินเวลา
 */
async function tryClick(page, xpath, maxWaitTimeMs = 15000, delayPerTryMs = 1000, label = 'ปุ่มไม่ทราบชื่อ') {
  const startTime = Date.now();
  let attempt = 0;

  while ((Date.now() - startTime) < maxWaitTimeMs) {
    attempt++;
    const [btn] = await page.$x(xpath);
    if (btn) {
      try {
        await btn.click();
        logSuccess(`✅ คลิก "${label}" สำเร็จ (รอบที่ ${attempt})`);
        return true;
      } catch (err) {
        logProgress(`⚠️ คลิก "${label}" พบปัญหา (รอบที่ ${attempt}):`, err.message);
      }
    } else {
      logInfo(`🔍 ยังไม่เจอ "${label}" (รอบที่ ${attempt})`);
    }
    await page.waitForTimeout(delayPerTryMs);
  }

  logFail(`❌ ไม่สามารถคลิก "${label}" ภายใน ${maxWaitTimeMs / 1000} วินาที`);
  return false;
}

module.exports = { tryClick };
