/**
 * PU FEST 2026 - GOOGLE SHEETS BACKUP + EMAIL BRIDGE
 * Version 1.1.0
 *
 * Bound spreadsheet:
 * PU-Fest-Tickets 2026 (Backup)
 *
 * Security:
 * - Supabase calls this Web App over HTTPS.
 * - Each POST must contain the shared sync secret stored in Script Properties.
 * - Raw QR tokens are never written to the spreadsheet.
 */

const PU_FEST_CONFIG = Object.freeze({
  VERSION: '1.1.0',
  SHEET_ID: '1G-stDal6Rpg3CA2TGr9zTa-e0G8_E7ZswpsiID3y-dw',
  EVENT_NAME: 'PU Fest 2026',
  EVENT_DATE: 'October 30, 2026',
  EVENT_TIME: '1:00 PM - 6:00 PM',
  EVENT_VENUE: 'PanpacificU Events Center',
  TICKET_PRICE: 499,
  SENDER_NAME: 'Panpacific University | PU Fest 2026',
  REPLY_TO: 'marketing.staff@panpacificu.edu.ph',
  SECRET_PROPERTY: 'PU_FEST_SYNC_SECRET'
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

/**
 * Run this ONCE after pasting the code.
 * It prepares the backup tabs and creates a private sync secret.
 * Copy the returned/logged secret into Supabase Edge Function Secrets.
 */
function setupPUFestSystem() {
  const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);

  // If this is still a blank one-sheet workbook, use the first sheet as Registrations.
  const sheets = ss.getSheets();
  if (sheets.length === 1 && sheets[0].getLastRow() === 0 && sheets[0].getLastColumn() === 0) {
    sheets[0].setName(PU_FEST_TABS.REGISTRATIONS);
  }

  ensureTab_(ss, PU_FEST_TABS.REGISTRATIONS, REG_HEADERS);
  ensureTab_(ss, PU_FEST_TABS.TICKETS, TICKET_HEADERS);
  ensureTab_(ss, PU_FEST_TABS.EMAIL_LOGS, EMAIL_HEADERS);
  ensureTab_(ss, PU_FEST_TABS.SYNC_LOGS, SYNC_HEADERS);

  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty(PU_FEST_CONFIG.SECRET_PROPERTY);

  if (!secret) {
    secret = [
      Utilities.getUuid().replace(/-/g, ''),
      Utilities.getUuid().replace(/-/g, ''),
      Utilities.getUuid().replace(/-/g, '')
    ].join('');
    props.setProperty(PU_FEST_CONFIG.SECRET_PROPERTY, secret);
  }

  const message =
    'PU Fest 2026 setup complete.\n\n' +
    'COPY THIS SYNC SECRET INTO SUPABASE:\n' + secret + '\n\n' +
    'Keep this secret private. Do not put it in GitHub or frontend JavaScript.';

  console.log(message);
  SpreadsheetApp.getUi().alert(message);
  return secret;
}

/**
 * Optional health check.
 * After Web App deployment, opening the /exec URL should return this JSON.
 */
function doGet() {
  return jsonOutput_({
    success: true,
    service: 'PU Fest 2026 Sheets Backup + Email Bridge',
    version: PU_FEST_CONFIG.VERSION
  });
}

/**
 * Main endpoint called by Supabase Edge Functions.
 */
function doPost(e) {
  const started = new Date();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ success: false, message: 'Missing request body.' });
    }

    const payload = JSON.parse(e.postData.contents);
    validateSecret_(payload.secret);

    const action = String(payload.action || '').trim().toLowerCase();
    if (!['issue', 'resend', 'update_registration'].includes(action)) {
      throw new Error('Invalid API action.');
    }

    const registration = payload.registration || {};
    const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];

    let sheetSynced = false;
    let emailSent = false;
    let sheetError = '';
    let emailError = '';

    if (action === 'issue' || action === 'update_registration') {
      try {
        backupRegistration_(registration);
        if (action === 'issue') backupTickets_(registration, tickets);
        sheetSynced = true;
      } catch (err) {
        sheetError = errorText_(err);
      }
    }

    if (action === 'issue' || action === 'resend') {
      try {
        sendTicketEmail_(registration, tickets, action);
        emailSent = true;
      } catch (err) {
        emailError = errorText_(err);
      }
    }

    logSync_(
      registration,
      action,
      sheetSynced,
      emailSent,
      [sheetError, emailError].filter(Boolean).join(' | ') || 'OK'
    );

    return jsonOutput_({
      success: sheetSynced || emailSent,
      sheet_synced: sheetSynced,
      email_sent: emailSent,
      sheet_error: sheetError || null,
      email_error: emailError || null,
      processing_ms: new Date().getTime() - started.getTime()
    });

  } catch (err) {
    return jsonOutput_({
      success: false,
      sheet_synced: false,
      email_sent: false,
      message: errorText_(err)
    });
  }
}

function validateSecret_(provided) {
  const expected = PropertiesService.getScriptProperties()
    .getProperty(PU_FEST_CONFIG.SECRET_PROPERTY);

  if (!expected) {
    throw new Error('Sync secret has not been configured. Run setupPUFestSystem().');
  }

  if (!provided || String(provided) !== String(expected)) {
    throw new Error('Unauthorized request.');
  }
}

function ensureTab_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn()))
      .getDisplayValues()[0];

    // Fill missing header cells without deleting existing backup data.
    headers.forEach((h, i) => {
      if (!existing[i]) sh.getRange(1, i + 1).setValue(h);
    });
  }

  styleTab_(sh, headers.length);
  return sh;
}

function styleTab_(sh, headerCount) {
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, headerCount)
    .setBackground('#0B1F3F')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontFamily('Inter')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  sh.getRange(1, 1, Math.max(1, sh.getMaxRows()), headerCount)
    .setFontFamily('Inter');

  sh.setRowHeight(1, 34);

  // Sensible compact widths.
  for (let c = 1; c <= headerCount; c++) {
    sh.setColumnWidth(c, 135);
  }
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

  // Number/date formatting.
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

    const qrBytes = Utilities.base64Decode(t.qr_png_base64);
    inlineImages[cid] = Utilities.newBlob(
      qrBytes,
      'image/png',
      (t.ticket_number || ('ticket-' + (index + 1))) + '.png'
    );

    return ticketCardHtml_(t, index + 1, tickets.length, cid, r);
  }).join('');

  const subjectPrefix = action === 'resend' ? 'Resent: ' : '';
  const subject = subjectPrefix +
    'Your PU Fest 2026 Ticket' + (tickets.length > 1 ? 's' : '') +
    ' | ' + (r.transaction_number || '');

  const html = emailHtml_(r, ticketCards, tickets.length);

  MailApp.sendEmail({
    to: r.email,
    subject: subject,
    body:
      'Your PU Fest 2026 ticket is ready. ' +
      'Event: October 30, 2026, 1:00 PM - 6:00 PM, PanpacificU Events Center. ' +
      'Please view the HTML version of this email to access your QR ticket.',
    htmlBody: html,
    name: PU_FEST_CONFIG.SENDER_NAME,
    replyTo: PU_FEST_CONFIG.REPLY_TO,
    inlineImages: inlineImages
  });

  logEmail_(r, action, 'sent', '');
}

function emailHtml_(r, ticketCards, ticketCount) {
  const amount = Number(r.amount_paid || 0);

  return `<!doctype html>
  <html>
  <body style="margin:0;padding:0;background:#f3f6fa;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
      style="width:100%;background:#f3f6fa;padding:24px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0"
            style="width:100%;max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;">
            <tr>
              <td align="center" style="background:#0B1F3F;padding:30px 24px;">
                <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;
                  letter-spacing:2px;color:#bdcce0;">PANPACIFIC UNIVERSITY</div>
                <div style="font-family:Arial,sans-serif;font-size:39px;font-weight:800;
                  letter-spacing:-2px;color:#ffffff;margin-top:6px;">
                  PU Fest <span style="color:#F0C857;">2026</span>
                </div>
                <div style="font-family:Arial,sans-serif;font-size:12px;color:#d7e2f0;margin-top:5px;">
                  Official Event Ticket Confirmation
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:28px;">
                <div style="font-family:Arial,sans-serif;font-size:23px;font-weight:700;color:#0B1F3F;">
                  Payment confirmed.
                </div>
                <p style="font-family:Arial,sans-serif;font-size:13px;line-height:1.65;
                  color:#566377;margin:8px 0 20px;">
                  Hi ${escapeHtml_(r.first_name || 'Student')}, your PU Fest 2026 payment has been
                  recorded and your ${ticketCount} ticket${ticketCount > 1 ? 's are' : ' is'} ready.
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

                <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:800;
                  letter-spacing:1.6px;color:#215FA6;margin-top:25px;">
                  YOUR TICKET${ticketCount > 1 ? 'S' : ''}
                </div>

                ${ticketCards}

                <div style="background:#fff8df;border:1px solid #f1dfa0;border-radius:11px;
                  padding:13px 14px;margin-top:10px;font-family:Arial,sans-serif;
                  font-size:11px;line-height:1.55;color:#5f532a;">
                  <strong>Important:</strong> Each QR code can be successfully checked in only once.
                  Please do not publicly share your ticket QR.
                </div>

                <p style="font-family:Arial,sans-serif;font-size:10px;line-height:1.6;
                  color:#7a8798;margin:21px 0 0;">
                  For payment or ticket concerns, reply to this email or contact the event team
                  through the official Panpacific University channels.
                </p>
              </td>
            </tr>

            <tr>
              <td align="center" style="background:#f6f8fb;padding:17px 20px;
                font-family:Arial,sans-serif;font-size:9px;line-height:1.55;color:#8b96a6;">
                Panpacific University | PU Fest 2026<br>
                October 30, 2026 • 1:00 PM - 6:00 PM • PanpacificU Events Center
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

function ticketCardHtml_(t, number, total, cid, r) {
  const url = escapeHtml_(t.ticket_url || '#');
  const holder = escapeHtml_(t.holder_name || r.full_name || fullName_(r));
  const details = [r.course, r.year_level, r.section].filter(Boolean).map(escapeHtml_).join(' • ');

  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
    style="width:100%;margin-top:12px;border:1px solid #e4e9ef;border-radius:14px;">
    <tr>
      <td align="center" style="padding:21px 18px;">
        <div style="font-family:Arial,sans-serif;font-size:9px;font-weight:800;
          letter-spacing:1.3px;color:#215FA6;">TICKET ${number} OF ${total}</div>

        <img src="cid:${cid}" width="220" alt="PU Fest Ticket QR"
          style="display:block;width:220px;max-width:100%;height:auto;margin:12px auto;border:0;">

        <div style="font-family:Arial,sans-serif;font-size:19px;font-weight:700;color:#0B1F3F;">
          ${holder}
        </div>

        <div style="font-family:Arial,sans-serif;font-size:11px;color:#6f7b8d;margin-top:4px;">
          ${details}
        </div>

        <div style="font-family:Arial,sans-serif;font-size:9px;color:#8490a0;
          margin-top:14px;letter-spacing:1px;">TICKET NUMBER</div>

        <div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;
          color:#0B1F3F;letter-spacing:1px;margin-top:3px;">
          ${escapeHtml_(t.ticket_number || '')}
        </div>

        <a href="${url}" style="display:inline-block;margin-top:15px;background:#0B1F3F;
          color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:11px;
          font-weight:700;padding:11px 16px;border-radius:8px;">
          VIEW TICKET
        </a>
      </td>
    </tr>
  </table>`;
}

function infoRow_(label, value) {
  return `
    <tr>
      <td style="padding:7px 10px;font-family:Arial,sans-serif;font-size:9px;
        color:#7c8899;width:34%;">${escapeHtml_(label)}</td>
      <td style="padding:7px 10px;font-family:Arial,sans-serif;font-size:11px;
        font-weight:700;color:#0B1F3F;">${escapeHtml_(value)}</td>
    </tr>`;
}

function logEmail_(r, action, status, message) {
  try {
    const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
    const sh = ensureTab_(ss, PU_FEST_TABS.EMAIL_LOGS, EMAIL_HEADERS);
    sh.appendRow([
      new Date(),
      r.transaction_number || '',
      r.id || r.registration_id || '',
      r.email || '',
      action,
      status,
      message || ''
    ]);
  } catch (err) {
    console.error('Email log failed: ' + errorText_(err));
  }
}

function logSync_(r, action, sheetSynced, emailSent, message) {
  try {
    const ss = SpreadsheetApp.openById(PU_FEST_CONFIG.SHEET_ID);
    const sh = ensureTab_(ss, PU_FEST_TABS.SYNC_LOGS, SYNC_HEADERS);
    sh.appendRow([
      new Date(),
      r.transaction_number || '',
      r.id || r.registration_id || '',
      action,
      sheetSynced ? 'synced' : (action === 'resend' ? 'not-required' : 'failed'),
      emailSent ? 'sent' : (action === 'update_registration' ? 'not-required' : 'failed'),
      message || ''
    ]);
  } catch (err) {
    console.error('Sync log failed: ' + errorText_(err));
  }
}

function upsertByKey_(sh, keyColumn, key, values) {
  const row = findRowByKey_(sh, keyColumn, key);

  if (row > 1) {
    sh.getRange(row, 1, 1, values.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }
}

function findRowByKey_(sh, keyColumn, key) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return -1;

  const values = sh.getRange(2, keyColumn, lastRow - 1, 1).getDisplayValues();
  const needle = String(key);

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === needle) return i + 2;
  }

  return -1;
}

function fullName_(r) {
  return [r.first_name, r.middle_name, r.last_name]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number_(v) {
  const n = Number(v || 0);
  return isFinite(n) ? n : 0;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function errorText_(err) {
  if (!err) return 'Unknown error';
  return err.message ? String(err.message) : String(err);
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
