const puppeteer = require('puppeteer');
const { loadCookies } = require('../Session/sessionManager');
const execAccept = require('../Exec/execAccept');
const withTimeout = require('../Utils/taskTimeout');

function normalizeUrl(url) {
  const mode = process.env.MORAVIA_REWRITE_MODE;

  if (mode === 'projects-new') {
    return url.replace('projects.moravia.com', 'projects-new.moravia.com');
  }

  // ไม่แปลงอะไรเลย
  return url;
}

module.exports = async function runTaskInNewBrowser({ task }) {
  let browser;
  const fixedUrl = normalizeUrl(task.url);

  const taskFn = async () => {
    try {
      browser = await puppeteer.launch({
        headless: "new",
        executablePath: puppeteer.executablePath(),
        defaultViewport: { width: 1200, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,800']
      });

      const pages = await browser.pages();
      const page = pages[0];
      await loadCookies(page);

      const result = await execAccept({ page, url: fixedUrl });

      return {
        success: result?.success || false,
        reason: result?.reason || '',
        url: fixedUrl
      };
    } catch (err) {
      return {
        success: false,
        reason: err.message,
        url: fixedUrl
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  };

  // ✅ ไม่ retry แล้ว ตรงเข้าไปทำงาน
  const result = await withTimeout(taskFn, 60000);
  return result;
};
