require('dotenv').config();

module.exports = {
    DEFAULT_SHEET_KEY: 'MainSheet',
    jobLinks: { 
            MainSheet: {
                sheetId: process.env.SHEET_ID_MAIN,
                tabName: 'AcceptLinks',
                LinksOrderColumn: 'D',   //ตำแหน่งเขียนLink
                StatusColumn: 'E',      // ตำแหน่งเขียน status
                ReasonColumn: 'F',      // ตำแหน่งเขียน reason
                TimestampColumn: 'G'    // ตำแหน่งเขียน timestamp
            },
            DATASheet: {
                sheetId: process.env.SHEET_ID_DATA, // เชื่อมต่อ Data
                tabName: 'NOTOUCH',
                    LinksColumn: 'Q', // ตำแหน่งอ่าน Link
                    ReceviedDate: 'C', // ตำแหน่งอ่าน timestamp
                    StartRow: 7300
            },
            TrackingSheet: {
                sheetId: process.env.SHEET_ID_Tracking, // เชื่อมต่อ Data
                tabName: 'PM_Tracking',
                    statusColumn: 'B', 
                    orderIdColumn: 'F',
                    pmNameColumn: 'C',

            Assignment: {
                tabName: 'Assignment', 
                workflowNameColumn: 'F', 
                projectStatusColumn: 'L'
                    }
                }
            },
  defaultConcurrency: 4,
  maxRetries: 1,
  forceLogin: process.env.FORCE_LOGIN === 'true',
  googleChatWebhook: process.env.GOOGLE_CHAT_WEBHOOK,
     taskConfig: {
                 TASK_TIMEOUT_MS: parseInt(process.env.TASK_TIMEOUT_MS) || 60000,
                    RETRY_COUNT: parseInt(process.env.RETRY_COUNT) || 2,
                    RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS) || 3000  
                },
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  IMAP_HOST: process.env.IMAP_HOST,
  MAILBOX: process.env.MAILBOX_NAME || 'INBOX',
  ALLOW_BACKFILL: process.env.ALLOW_BACKFILL === 'true'

};
