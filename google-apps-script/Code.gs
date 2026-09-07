/**
 * PU FEST 2026 — GOOGLE SHEETS BACKUP + EMAIL WORKER
 * Version 1.2.0
 *
 * Pull model:
 * Apps Script requests pending jobs FROM Supabase every minute.
 * This avoids Google rejecting server-to-server POSTs from Supabase.
 */

const PU_FEST_CONFIG = Object.freeze({
  VERSION: '1.2.0',
  SHEET_ID: '1G-stDal6Rpg3CA2TGr9zTa-e0G8_E7ZswpsiID3y-dw',
  EVENT_NAME: 'PU Fest 2026',
  EVENT_DATE: 'October 30, 2026',
  EVENT_TIME: '1:00 PM - 6:00 PM',
  EVENT_VENUE: 'PanpacificU Events Center',
  TICKET_PRICE: 499,
  SENDER_NAME: 'Panpacific University | PU Fest 2026',
  REPLY_TO: 'marketing.staff@panpacificu.edu.ph',
  WORKER_URL: 'https://kimhqlenfulaflyfhrez.supabase.co/functions/v1/apps-script-pull',
  SECRET_PROPERTY: 'PU_FEST_SYNC_SECRET',
  BATCH_SIZE: 10
});

const PU_FEST_TABS = Object.freeze({
  REGISTRATIONS: 'Registrations',
  TICKETS: 'Tickets',
  EMAIL_LOGS: 'Email Logs',
  SYNC_LOGS: 'Sync Logs'
});

const REG_HEADERS = [
  'Transaction Number','Registration ID','Student Number','Full Name','Email',
  'Campus','Course / Program','Year Level','Section','Ticket Quantity',
  'Ticket Price','Expected Total','Amount Paid','OR / Reference Number',
  'Payment Date','Payment Method','Notes','Registration Status',
  'Email Status','Sheet Sync Status','Created At','Last Synced At'
];

const TICKET_HEADERS = [
  'Ticket Number','Ticket ID','Transaction Number','Registration ID',
  'Holder Name','Ticket Status','Created At','Last Synced At'
];

const EMAIL_HEADERS = [
  'Timestamp','Transaction Number','Registration ID','Recipient',
  'Action','Status','Error / Message'
];

const SYNC_HEADERS = [
  'Timestamp','Transaction Number','Registration ID','Action',
  'Sheet Sync','Email','Message'
];

function setupPUFestWorker() {
  const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
  ensureTab_(ss, PU_FEST_TABS.REGISTRATIONS, REG_HEADERS);
  ensureTab_(ss, PU_FEST_TABS.TICKETS, TICKET_HEADERS);
  ensureTab_(ss, PU_FEST_TABS.EMAIL_LOGS, EMAIL_HEADERS);
  ensureTab_(ss, PU_FEST_TABS.SYNC_LOGS, SYNC_HEADERS);

  const secret = PropertiesService.getScriptProperties()
    .getProperty(PU_FEST_CONFIG.SECRET_PROPERTY);

  if (!secret) {
    throw new Error(
      'PU_FEST_SYNC_SECRET is missing. Keep the rotated secret already generated in Script Properties.'
    );
  }

  // Remove old worker triggers before creating exactly one.
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processPUFestQueue') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('processPUFestQueue')
    .timeBased()
    .everyMinutes(1)
    .create();

  console.log('PU Fest worker configured. Queue will run every minute.');
  return true;
}

function processPUFestQueue() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const result = callWorker_({
      action: 'fetch',
      limit: PU_FEST_CONFIG.BATCH_SIZE
    });

    if (!result.success) throw new Error(result.message || 'Worker fetch failed.');

    const jobs = Array.isArray(result.jobs) ? result.jobs : [];

    jobs.forEach(job => processJob_(job));

  } finally {
    lock.releaseLock();
  }
}

function processJob_(job) {
  const r = job.registration || {};
  const tickets = Array.isArray(job.tickets) ? job.tickets : [];

  let sheetAttempted = false;
  let sheetSynced = false;
  let sheetError = '';

  let emailAttempted = false;
  let emailSent = false;
  let emailError = '';

  if (job.needs_sheet) {
    sheetAttempted = true;
    try {
      backupRegistration_(r);
      backupTickets_(r, tickets);
      sheetSynced = true;
    } catch (err) {
      sheetError = errorText_(err);
    }
  }

  if (job.needs_email) {
    emailAttempted = true;
    try {
      sendTicketEmail_(r, tickets, 'issue');
      emailSent = true;
    } catch (err) {
      emailError = errorText_(err);
      logEmail_(r, 'issue', 'failed', emailError);
    }
  }

  logSync_(
    r,
    'worker',
    sheetSynced,
    emailSent,
    [sheetError, emailError].filter(Boolean).join(' | ') || 'OK'
  );

  callWorker_({
    action: 'ack',
    registration_id: r.id || r.registration_id,
    sheet_attempted: sheetAttempted,
    sheet_synced: sheetSynced,
    sheet_error: sheetError || null,
    email_attempted: emailAttempted,
    email_sent: emailSent,
    email_error: emailError || null
  });
}

function callWorker_(payload) {
  const secret = PropertiesService.getScriptProperties()
    .getProperty(PU_FEST_CONFIG.SECRET_PROPERTY);

  if (!secret) throw new Error('PU_FEST_SYNC_SECRET is missing from Script Properties.');

  const response = UrlFetchApp.fetch(PU_FEST_CONFIG.WORKER_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(Object.assign({}, payload, { secret: secret })),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error('Supabase worker returned non-JSON response (' + code + '): ' + text.slice(0, 180));
  }

  if (code < 200 || code >= 300) {
    throw new Error(data.message || ('Supabase worker HTTP ' + code));
  }

  return data;
}

function backupRegistration_(r) {
  if (!r.transaction_number) throw new Error('Missing transaction number.');

  const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
  const sh = ensureTab_(ss, PU_FEST_TABS.REGISTRATIONS, REG_HEADERS);

  const values = [
    r.transaction_number || '',
    r.id || r.registration_id || '',
    r.student_number || '',
    r.full_name || fullName_(r),
    r.email || '',
    r.campus || '',
    r.course || '',
    r.year_level || '',
    r.section || '',
    number_(r.ticket_quantity),
    number_(r.ticket_price),
    number_(r.expected_total),
    number_(r.amount_paid),
    r.or_number || '',
    r.payment_date || '',
    r.payment_method || '',
    r.notes || '',
    r.status || 'active',
    r.email_status || 'pending',
    'synced',
    r.created_at || '',
    new Date()
  ];

  upsertByKey_(sh, 1, r.transaction_number, values);

  const row = findRowByKey_(sh, 1, r.transaction_number);
  if (row > 1) {
    sh.getRange(row, 11, 1, 3).setNumberFormat('₱#,##0.00');
    sh.getRange(row, 22).setNumberFormat('yyyy-mm-dd hh:mm:ss');
  }
}

function backupTickets_(registration, tickets) {
  const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
  const sh = ensureTab_(ss, PU_FEST_TABS.TICKETS, TICKET_HEADERS);

  tickets.forEach(t => {
    if (!t.ticket_number) return;

    const values = [
      t.ticket_number || '',
      t.id || '',
      registration.transaction_number || '',
      registration.id || registration.registration_id || '',
      t.holder_name || registration.full_name || fullName_(registration),
      t.status || 'unused',
      t.created_at || '',
      new Date()
    ];

    upsertByKey_(sh, 1, t.ticket_number, values);
  });
}

function sendTicketEmail_(r, tickets, action) {
  if (!r.email) throw new Error('Registration has no email address.');
  if (!tickets.length) throw new Error('No tickets supplied for email.');

  const inlineImages = {};
  const ticketCards = tickets.map((t, index) => {
    const cid = 'ticketqr' + (index + 1);

    if (!t.qr_png_base64) {
      throw new Error('QR image missing for ' + (t.ticket_number || ('ticket ' + (index + 1))));
    }

    inlineImages[cid] = Utilities.newBlob(
      Utilities.base64Decode(t.qr_png_base64),
      'image/png',
      (t.ticket_number || ('ticket-' + (index + 1))) + '.png'
    );

    return ticketCardHtml_(t, index + 1, tickets.length, cid, r);
  }).join('');

  const subject = 'Your PU Fest 2026 Ticket' + (tickets.length > 1 ? 's' : '') +
    ' | ' + (r.transaction_number || '');

  MailApp.sendEmail({
    to: r.email,
    subject: subject,
    body:
      'Your PU Fest 2026 ticket is ready. ' +
      'October 30, 2026, 1:00 PM - 6:00 PM, PanpacificU Events Center.',
    htmlBody: emailHtml_(r, ticketCards, tickets.length),
    name: PU_FEST_CONFIG.SENDER_NAME,
    replyTo: PU_FEST_CONFIG.REPLY_TO,
    inlineImages: inlineImages
  });

  logEmail_(r, action, 'sent', '');
}

function emailHtml_(r, ticketCards, ticketCount) {
  const amount = Number(r.amount_paid || 0);

  return `<!doctype html>
  <html><body style="margin:0;padding:0;background:#f3f6fa;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
      style="width:100%;background:#f3f6fa;padding:24px 10px;">
      <tr><td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0"
          style="width:100%;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;">
          <tr><td align="center" style="background:#0B1F3F;padding:30px 24px;">
            <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;color:#bdcce0;">PANPACIFIC UNIVERSITY</div>
            <div style="font-family:Arial,sans-serif;font-size:39px;font-weight:800;letter-spacing:-2px;color:#ffffff;margin-top:6px;">
              PU Fest <span style="color:#F0C857;">2026</span>
            </div>
            <div style="font-family:Arial,sans-serif;font-size:12px;color:#d7e2f0;margin-top:5px;">Official Event Ticket Confirmation</div>
          </td></tr>

          <tr><td style="padding:28px;">
            <div style="font-family:Arial,sans-serif;font-size:23px;font-weight:700;color:#0B1F3F;">Payment confirmed.</div>
            <p style="font-family:Arial,sans-serif;font-size:13px;line-height:1.65;color:#566377;margin:8px 0 20px;">
              Hi ${escapeHtml_(r.first_name || 'Student')}, your PU Fest 2026 payment has been recorded and your
              ${ticketCount} ticket${ticketCount > 1 ? 's are' : ' is'} ready.
            </p>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
              style="background:#f6f8fb;border-radius:12px;">
              ${infoRow_('EVENT', 'PU Fest 2026')}
              ${infoRow_('DATE', 'October 30, 2026')}
              ${infoRow_('TIME', '1:00 PM - 6:00 PM')}
              ${infoRow_('VENUE', 'PanpacificU Events Center')}
              ${infoRow_('TRANSACTION', r.transaction_number || '')}
              ${infoRow_('AMOUNT PAID', 'PHP ' + amount.toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2}))}
              ${infoRow_('OR / REF #', r.or_number || 'To be updated by Finance')}
            </table>

            <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:1.6px;color:#215FA6;margin-top:25px;">
              YOUR TICKET${ticketCount > 1 ? 'S' : ''}
            </div>

            ${ticketCards}

            <div style="background:#fff8df;border:1px solid #f1dfa0;border-radius:11px;padding:13px 14px;margin-top:10px;font-family:Arial,sans-serif;font-size:11px;line-height:1.55;color:#5f532a;">
              <strong>Important:</strong> Each QR code can be successfully checked in only once.
              Please do not publicly share your ticket QR.
            </div>
          </td></tr>

          <tr><td align="center" style="background:#f6f8fb;padding:17px 20px;font-family:Arial,sans-serif;font-size:9px;line-height:1.55;color:#8b96a6;">
            Panpacific University | PU Fest 2026<br>
            October 30, 2026 • 1:00 PM - 6:00 PM • PanpacificU Events Center
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

function ticketCardHtml_(t, number, total, cid, r) {
  const url = escapeHtml_(t.ticket_url || '#');
  const holder = escapeHtml_(t.holder_name || r.full_name || fullName_(r));
  const details = [r.course, r.year_level, r.section].filter(Boolean).map(escapeHtml_).join(' • ');

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
    style="width:100%;margin-top:12px;border:1px solid #e4e9ef;border-radius:14px;">
    <tr><td align="center" style="padding:21px 18px;">
      <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:1.3px;color:#215FA6;">
        TICKET ${number} OF ${total}
      </div>

      <img src="cid:${cid}" width="220" alt="PU Fest Ticket QR"
        style="display:block;width:220px;max-width:100%;height:auto;margin:12px auto;border:0;">

      <div style="font-family:Arial,sans-serif;font-size:19px;font-weight:700;color:#0B1F3F;">${holder}</div>
      <div style="font-family:Arial,sans-serif;font-size:11px;color:#6f7b8d;margin-top:4px;">${details}</div>
      <div style="font-family:Arial,sans-serif;font-size:9px;color:#8490a0;margin-top:14px;letter-spacing:1px;">TICKET NUMBER</div>
      <div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#0B1F3F;letter-spacing:1px;margin-top:3px;">
        ${escapeHtml_(t.ticket_number || '')}
      </div>

      <a href="${url}" style="display:inline-block;margin-top:15px;background:#0B1F3F;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:11px 16px;border-radius:8px;">
        VIEW TICKET
      </a>
    </td></tr>
  </table>`;
}

function infoRow_(label, value) {
  return `<tr>
    <td style="padding:7px 10px;font-family:Arial,sans-serif;font-size:9px;color:#7c8899;width:34%;">${escapeHtml_(label)}</td>
    <td style="padding:7px 10px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#0B1F3F;">${escapeHtml_(value)}</td>
  </tr>`;
}

function ensureTab_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headers.length)
    .setBackground('#0B1F3F')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontFamily('Inter')
    .setFontSize(10);

  return sh;
}

function logEmail_(r, action, status, message) {
  const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
  const sh = ensureTab_(ss, PU_FEST_TABS.EMAIL_LOGS, EMAIL_HEADERS);
  sh.appendRow([
    new Date(), r.transaction_number || '', r.id || r.registration_id || '',
    r.email || '', action, status, message || ''
  ]);
}

function logSync_(r, action, sheetSynced, emailSent, message) {
  const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
  const sh = ensureTab_(ss, PU_FEST_TABS.SYNC_LOGS, SYNC_HEADERS);
  sh.appendRow([
    new Date(), r.transaction_number || '', r.id || r.registration_id || '',
    action, sheetSynced ? 'synced' : 'failed',
    emailSent ? 'sent' : 'failed', message || ''
  ]);
}

function upsertByKey_(sh, keyColumn, key, values) {
  const row = findRowByKey_(sh, keyColumn, key);
  if (row > 1) sh.getRange(row, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);
}

function findRowByKey_(sh, keyColumn, key) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;
  const values = sh.getRange(2, keyColumn, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) return i + 2;
  }
  return -1;
}

function fullName_(r) {
  return [r.first_name, r.middle_name, r.last_name]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function number_(v) {
  const n = Number(v || 0);
  return isFinite(n) ? n : 0;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function errorText_(err) {
  return err && err.message ? String(err.message) : String(err || 'Unknown error');
}
