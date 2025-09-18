const { simpleParser } = require('mailparser');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const { loadLastSeenUidFromFile, saveLastSeenUid } = require('./uidStore');
const { loadSeenUids, saveSeenUids } = require('./seenUidsStore');
const { logInfo, logSuccess, logFail } = require('../Logs/logger');
const { retry } = require('./retryHandler');

let seenUids = new Set();
let lastSeenUid = 0;
let isFetching = false;
let currentMailboxName = null;

// ===== ✅ 1. Email Content Parser Class (ปรับปรุงประสิทธิภาพ) =====
class EmailContentParser {
  constructor() {
    // Pre-compiled regex patterns
    this.patterns = {
      orderId: /\[#(\d+)\]/,
      amountWords: /amountWords\s*[:：]?\s*['"]?([0-9.,]+)/i,
      plannedEndDate: /plannedEndDate\s*[:：]?\s*['"]?([0-9./:\sAPMapm]+)['"]?/i,
      moraviaLinks: /https:\/\/projects\.moravia\.com\/Task\/[^\s<>"']*\/detail\/notification\?command=Accept/g
    };
  }

  parseEmail(content, rawText) {
    // Single cheerio instance per email
    const $ = cheerio.load(content);
    
    return {
      orderId: this.extractOrderId(rawText),
      workflowName: this.extractWorkflowName($),
      metrics: this.extractMetrics(content, $),
      moraviaLinks: this.extractMoraviaLinks(content)
    };
  }

  extractOrderId(rawText) {
    const match = rawText.match(this.patterns.orderId);
    return match ? match[1] : null;
  }

  extractWorkflowName($) {
    return $('td:contains("Workflow name")').next().text().trim() || null;
  }

  extractMetrics(content, $) {
    // Try structured data first
    let amountsText = $('td:contains("Amounts")').next().text();
    let deadlineText = $('td:contains("Planned end")').next().text();

    // Fallback to regex
    if (!amountsText) {
      const match = content.match(this.patterns.amountWords);
      amountsText = match ? match[1] : null;
    }
    if (!deadlineText) {
      const match = content.match(this.patterns.plannedEndDate);
      deadlineText = match ? match[1] : null;
    }

    return {
      amountWords: amountsText ? parseFloat(amountsText.replace(/[^0-9.]/g, '')) : null,
      plannedEndDate: this.normalizeDate(deadlineText)
    };
  }

  extractMoraviaLinks(content) {
    return [...(content.match(this.patterns.moraviaLinks) || [])];
  }

  normalizeDate(dateText) {
    if (!dateText) return null;
    
    const cleaned = dateText.replace(/\(.*?\)/g, '').trim();
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
    
    return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : null;
  }
}

// ===== ✅ 2. Memory Management Helper =====
function trimSeenUids() {
  if (seenUids.size > 1000) {
    const uidArray = Array.from(seenUids).sort((a, b) => b - a);
    seenUids = new Set(uidArray.slice(0, 1000));
    logInfo(`🧹 Trimmed seenUids: kept ${seenUids.size} recent UIDs`);
  }
}

// ===== ✅ 3. โหลด UID ล่าสุดจากไฟล์ (ไม่เปลี่ยน) =====
async function initLastSeenUid(client, mailboxName) {
  currentMailboxName = mailboxName;
  seenUids = loadSeenUids(mailboxName);
  lastSeenUid = loadLastSeenUidFromFile(mailboxName) || 0;
  logInfo(`📌 Loaded lastSeenUid from file: ${lastSeenUid}`);
  return lastSeenUid;
}

// ===== ✅ 4. ปรับปรุง fetchNewEmails (รวมทุกการปรับปรุง) =====
async function fetchNewEmails(client, mailboxName, callback) {
  if (isFetching) {
    logInfo('⏳ Skip fetch: already running.');
    return;
  }

  const fetchStartTime = Date.now();
  isFetching = true;
  const startUid = lastSeenUid + 1;

  try {
    // ✅ Health Check - ปรับปรุงที่สำคัญที่สุด
    const healthCheckStart = Date.now();
    try {
      await client.noop(); // ตรวจสอบ connection
      logInfo(`💚 Connection healthy (${Date.now() - healthCheckStart}ms)`);
    } catch (healthError) {
      logFail('❌ Connection health check failed:', {
        error: healthError.message,
        code: healthError.code,
        duration: Date.now() - healthCheckStart
      });
      throw healthError; // ให้ retry mechanism จัดการ
    }

    await retry(async () => {
      const lock = await client.getMailboxLock(mailboxName);
      const fetchedUids = [];
      const parser = new EmailContentParser(); // Single parser instance

      try {
        // ✅ Search with better logging
        let uids = [];
        const searchStart = Date.now();
        try {
          uids = await client.search({ uid: `${startUid}:*` });
          logInfo(`🔍 Search completed: ${uids.length} UIDs (${Date.now() - searchStart}ms)`);
        } catch (err) {
          logFail('❌ Search failed:', {
            error: err.message,
            code: err.code,
            searchRange: `${startUid}:*`,
            duration: Date.now() - searchStart
          });
          return;
        }

        if (uids.length === 0) {
          logInfo(`ℹ️ No new emails found from UID ${startUid}`);
          return;
        }

        logInfo(`📨 Processing ${uids.length} new emails: [${uids.join(', ')}]`);

        // ✅ Process emails with performance tracking
        const processingStart = Date.now();
        for await (const message of client.fetch(uids, { uid: true, source: true, envelope: true })) {
          const uid = message.uid;
          const emailStart = Date.now();

          if (seenUids.has(uid)) {
            logInfo(`⚠️ Skipping duplicate UID: ${uid}`);
            continue;
          }

          try {
            // Parse email
            const parsed = await simpleParser(message.source);
            const content = parsed.html || parsed.text || '';
            const rawText = `${parsed.subject || ''} ${parsed.text || ''} ${parsed.html || ''}`;
            
            // ✅ ใช้ parser ที่ปรับปรุงแล้ว
            const emailData = parser.parseEmail(content, rawText);
            
            logInfo(`📩 UID ${uid} | Subject: ${parsed.subject}`);
            logInfo(`🆔 Order: ${emailData.orderId} | Workflow: ${emailData.workflowName}`);
            logInfo(`📊 Words: ${emailData.metrics.amountWords} | Deadline: ${emailData.metrics.plannedEndDate}`);

            // Check for Moravia links
            if (emailData.moraviaLinks.length === 0) {
              logInfo(`⚠️ No Moravia links found in UID ${uid}`);
              // ยังคงบันทึก UID แม้ไม่มี links เพื่อไม่ให้ process ซ้ำ
            }

            // Process each Moravia link
            for (const link of emailData.moraviaLinks) {
              try {
                logInfo(`✅ Processing Moravia link: ${link}`);
                await callback?.({ 
                  orderId: emailData.orderId,
                  workflowName: emailData.workflowName,
                  url: link,
                  amountWords: emailData.metrics.amountWords,
                  plannedEndDate: emailData.metrics.plannedEndDate
                });
              } catch (callbackError) {
                logFail(`❌ Callback failed for UID ${uid}:`, {
                  error: callbackError.message,
                  link: link,
                  orderId: emailData.orderId,
                  stack: callbackError.stack
                });
              }
            }

            fetchedUids.push(uid);
            logInfo(`⚡ UID ${uid} processed in ${Date.now() - emailStart}ms`);

          } catch (parseError) {
            logFail(`❌ Failed to process UID ${uid}:`, {
              error: parseError.message,
              subject: message.envelope?.subject,
              from: message.envelope?.from?.[0]?.address,
              duration: Date.now() - emailStart,
              stack: parseError.stack
            });
          }
        }

        // ✅ Update tracking with better logging
        if (fetchedUids.length > 0) {
          const maxUid = Math.max(...fetchedUids);
          fetchedUids.forEach(uid => seenUids.add(uid));
          
          // Memory management
          trimSeenUids();
          
          saveSeenUids(mailboxName, seenUids);
          lastSeenUid = maxUid;
          saveLastSeenUid(mailboxName, lastSeenUid);
          
          logSuccess(`📌 Batch complete: ${fetchedUids.length} emails processed in ${Date.now() - processingStart}ms`);
          logInfo(`📌 Updated lastSeenUid → ${lastSeenUid} | SeenUIDs count: ${seenUids.size}`);
        }

      } finally {
        lock.release();
      }
    }, 3, 1000); // 3 retries, 1 second delay

  } catch (err) {
    logFail('❌ Email fetch failed after retry:', {
      error: err.message,
      code: err.code,
      totalDuration: Date.now() - fetchStartTime,
      startUid: startUid,
      lastSeenUid: lastSeenUid,
      stack: err.stack
    });
  } finally {
    const totalTime = Date.now() - fetchStartTime;
    logInfo(`📈 Fetch cycle completed in ${totalTime}ms`);
    isFetching = false;
  }
}

// ✅ Cleanup function (ไม่เปลี่ยน)
function cleanupFetcher() {
  if (currentMailboxName && seenUids.size > 0) {
    saveSeenUids(currentMailboxName, seenUids);
    logInfo('🧼 SeenUIDs saved during shutdown.');
  }
}

module.exports = {
  fetchNewEmails,
  initLastSeenUid,
  cleanupFetcher,
  EmailContentParser // Export class สำหรับ testing
};