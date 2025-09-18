
const cheerio = require('cheerio');
const dayjs = require('dayjs');

function extractOrderIdFromEmail(emailTextOrHtml = '') {
  const match = emailTextOrHtml.match(/\[#(\d+)\]/);
  return match ? match[1] : null;
}

function extractLinksFromText(text) {
  const regex = /https?:\/\/[^\s<>"']+/g;
  return [...new Set(text.match(regex) || [])];
}

function extractWorkflowNameFromEmail(emailHtml = '') {
  const $ = cheerio.load(emailHtml);
  const text = $('td:contains("Workflow name")').next().text().trim();
  return text || null;
}

function filterMoraviaLinks(links) {
  return links.filter(link =>
    link.startsWith('https://projects.moravia.com/Task/') &&
    link.includes('/detail/notification?command=Accept')
  );
}

function parseMoraviaLinksFromEmail(emailTextOrHtml) {
  const allLinks = extractLinksFromText(emailTextOrHtml || '');
  const moraviaLinks = filterMoraviaLinks(allLinks);
  return moraviaLinks;
}

function extractMetricsFromEmail(emailHtml = '') {
  const $ = cheerio.load(emailHtml);

  // 🔍 Step 1: Try cheerio first
  let amountsText = $('td:contains("Amounts")').next().text();
  let deadlineText = $('td:contains("Planned end")').next().text();

  // 🔁 Step 2: Fallback to regex (plain text format)
  if (!amountsText) {
    const m = emailHtml.match(/amountWords\s*[:：]?\s*['"]?([0-9.,]+)/i);
    amountsText = m ? m[1] : null;
  }
  if (!deadlineText) {
    const d1 = emailHtml.match(/plannedEndDate\s*[:：]?\s*['"]?([0-9./:\sAPMapm]+)['"]?/i);
    deadlineText = d1 ? d1[1] : null;
    if (!deadlineText) {
      const d2 = emailHtml.match(/plannedEndDate\s*[:：]?\s*([0-9./:\sAPMapm]+)/i);
      deadlineText = d2 ? d2[1] : null;
    }
  }

  const amountWords = amountsText
    ? parseFloat(amountsText.replace(/[^0-9.]/g, ''))
    : null;

  let normalizedDate = null;
  if (deadlineText) {
    const cleaned = deadlineText.replace(/\(.*?\)/g, '').trim();
    const parsed = dayjs(cleaned, [
      'DD.MM.YYYY h:mm A',
      'DD.MM.YYYY h:mmA',
      'DD/MM/YYYY h:mm A',
      'DD-MM-YYYY h:mm A',
      'YYYY-MM-DD HH:mm',
      'YYYY-MM-DD',
      'DD/MM/YYYY',
      'DD-MM-YYYY',
      'DD.MM.YYYY'
    ], true);
    if (parsed.isValid()) {
      normalizedDate = parsed.format('YYYY-MM-DD HH:mm');
    }
  }

  return {
    amountWords,
    plannedEndDate: normalizedDate
  };
}

module.exports = {
  extractLinksFromText,
  filterMoraviaLinks,
  parseMoraviaLinksFromEmail,
  extractMetricsFromEmail,
  extractOrderIdFromEmail,
  extractWorkflowNameFromEmail 
};
