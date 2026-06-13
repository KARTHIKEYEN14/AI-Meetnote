const nodemailer = require('nodemailer');

/**
 * Create a fresh transporter on every send call.
 * This ensures we always read the latest EMAIL_USER / EMAIL_PASS from process.env
 * and avoids stale-credential failures from module-level evaluation order.
 */
function createTransporter() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error(
      'Email credentials missing — set EMAIL_USER and EMAIL_PASS (no spaces) in server/.env'
    );
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,         // TLS on port 465
    family: 4,            // force IPv4 — prevents ENETUNREACH on IPv6-disabled hosts
    auth: { user, pass },
    tls: { rejectUnauthorized: false }, // safety net for corporate / self-signed certs
  });
}

/**
 * Format the meeting summary as a clean plain-text email body.
 */
function buildEmailBody(meeting) {
  const { title, agenda, summary, createdAt } = meeting;
  const date = createdAt
    ? new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })
    : 'N/A';

  const lines = [
    `📋 MEETING SUMMARY`,
    `═══════════════════════════════════`,
    `Meeting : ${title}`,
    `Date    : ${date}`,
    agenda ? `Agenda  : ${agenda}` : null,
    ``,
    `── KEY POINTS ──`,
    ...(summary.keyPoints.length
      ? summary.keyPoints.map((p) => `  • ${p}`)
      : ['  (none recorded)']),
    ``,
    `── DECISIONS MADE ──`,
    ...(summary.decisions.length
      ? summary.decisions.map((d) => `  ✓ ${d}`)
      : ['  (none recorded)']),
    ``,
    `── ACTION ITEMS ──`,
    ...(summary.actionItems.length
      ? summary.actionItems.map(
          (a) => `  • ${a.task}  [${a.assignee}]  — ${a.status}`
        )
      : ['  (none recorded)']),
    ``,
    `───────────────────────────────────`,
    `Sent by AI MeetNote`,
  ];

  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Build an HTML version of the email for richer clients.
 */
function buildEmailHtml(meeting) {
  const { title, agenda, summary, createdAt, participants } = meeting;
  const date = createdAt
    ? new Date(createdAt).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })
    : 'N/A';

  const kp = summary.keyPoints.map((p) => `<li>${p}</li>`).join('') || '<li>None recorded</li>';
  const dec = summary.decisions.map((d) => `<li>${d}</li>`).join('') || '<li>None recorded</li>';
  const ai = summary.actionItems
    .map(
      (a) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${a.task}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${a.assignee}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:${a.status === 'completed' ? '#16a34a' : '#d97706'}">${a.status}</td>
        </tr>`
    )
    .join('');

  const participantList = (participants || [])
    .map((p) => `<span style="display:inline-block;background:#e0e7ff;color:#3730a3;border-radius:999px;padding:3px 12px;font-size:13px;margin:2px">${p.name}</span>`)
    .join(' ');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Inter,sans-serif;background:#f8fafc;padding:32px;margin:0">
  <div style="max-width:640px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#2563eb,#0d9488);padding:32px">
      <h1 style="color:#fff;margin:0;font-size:22px">📋 Meeting Summary</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0">${title}</p>
    </div>
    <div style="padding:32px">
      <p style="color:#64748b;margin:0 0 24px"><strong>Date:</strong> ${date}${agenda ? `&nbsp;&nbsp;|&nbsp;&nbsp;<strong>Agenda:</strong> ${agenda}` : ''}</p>

      ${participantList ? `<p style="margin:0 0 24px"><strong>Participants:</strong><br/>${participantList}</p>` : ''}

      <h2 style="font-size:15px;color:#1e293b;border-bottom:2px solid #f1f5f9;padding-bottom:8px">💡 Discussion Points</h2>
      <ul style="color:#475569;padding-left:20px;line-height:1.8">${kp}</ul>

      <h2 style="font-size:15px;color:#1e293b;border-bottom:2px solid #f1f5f9;padding-bottom:8px">✅ Key Decisions</h2>
      <ul style="color:#475569;padding-left:20px;line-height:1.8">${dec}</ul>

      <h2 style="font-size:15px;color:#1e293b;border-bottom:2px solid #f1f5f9;padding-bottom:8px">📌 Action Items</h2>
      ${
        summary.actionItems.length
          ? `<table style="width:100%;border-collapse:collapse;font-size:14px">
              <thead><tr style="background:#f8fafc">
                <th style="padding:8px 12px;text-align:left;color:#64748b">Task</th>
                <th style="padding:8px 12px;text-align:left;color:#64748b">Assignee</th>
                <th style="padding:8px 12px;text-align:left;color:#64748b">Status</th>
              </tr></thead>
              <tbody>${ai}</tbody>
            </table>`
          : '<p style="color:#94a3b8">None recorded</p>'
      }

      <p style="margin-top:32px;font-size:12px;color:#94a3b8;text-align:center">Approved &amp; sent by AI MeetNote • Powered by Groq AI</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send the meeting summary email to all recipients WITH .docx attachment.
 * @param {string[]} recipients   - Array of email addresses.
 * @param {object}  meeting       - Mongoose Meeting document.
 * @param {Buffer}  docxBuffer    - The .docx file buffer to attach (optional).
 */
async function sendSummaryEmail(recipients, meeting, docxBuffer) {
  if (!recipients || recipients.length === 0) return;

  const transporter = createTransporter();

  const mailOptions = {
    from:    process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to:      recipients.join(', '),
    subject: `Meeting Summary: ${meeting.title}`,
    text:    buildEmailBody(meeting),
    html:    buildEmailHtml(meeting),
  };

  // Attach the .docx if provided
  if (docxBuffer) {
    const safeTitle = meeting.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    mailOptions.attachments = [
      {
        filename: `${safeTitle}_minutes.docx`,
        content:  docxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ];
  }

  const info = await transporter.sendMail(mailOptions);
  console.log(`📧 Summary email sent to [${recipients.join(', ')}] — MessageID: ${info.messageId}`);
  return info;
}

/**
 * Send the meeting passkey to a co-recorder so they can join the meeting.
 * @param {string} toEmail   - Recipient email address.
 * @param {string} toName    - Recipient name (for personalisation).
 * @param {object} meeting   - Mongoose Meeting document.
 */
async function sendPasskeyEmail(toEmail, toName, meeting) {
  const { title, agenda, passkey } = meeting;

  const transporter = createTransporter(); // will throw if credentials missing

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:Inter,sans-serif;background:#f8fafc;padding:32px;margin:0">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:32px">
      <h1 style="color:#fff;margin:0;font-size:20px">&#127897;&#65039; You've been invited to record</h1>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:14px">${title}</p>
    </div>
    <div style="padding:32px">
      <p style="color:#334155;margin:0 0 16px">Hi <strong>${toName}</strong>,</p>
      <p style="color:#64748b;margin:0 0 24px;line-height:1.6">
        You have been added as a <strong>co-recorder</strong> for the meeting
        <strong>&quot;${title}&quot;</strong>${agenda ? ` (${agenda})` : ''}.
        Use the passkey below to join from your device.
      </p>

      <div style="background:#f1f5f9;border-radius:14px;padding:24px;text-align:center;margin:0 0 24px">
        <p style="color:#94a3b8;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px">Meeting Passkey</p>
        <p style="color:#1e293b;font-size:36px;font-weight:900;letter-spacing:10px;margin:0;font-family:monospace">${passkey}</p>
      </div>

      <div style="background:#eef2ff;border-radius:12px;padding:16px;margin:0 0 24px">
        <p style="color:#4338ca;font-size:13px;font-weight:600;margin:0 0 6px">How to join:</p>
        <ol style="color:#6366f1;font-size:13px;padding-left:20px;margin:0;line-height:1.8">
          <li>Open the AI Minutes app</li>
          <li>Click <strong>&quot;Join Meeting&quot;</strong> in the sidebar</li>
          <li>Enter the passkey above and click Join</li>
          <li>Start recording!</li>
        </ol>
      </div>

      <p style="font-size:12px;color:#94a3b8;text-align:center;margin:0">Sent by AI MeetNote &bull; Powered by Groq AI</p>
    </div>
  </div>
</body>
</html>`;

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  console.log(`[sendPasskeyEmail] Attempting to send to: ${toEmail} from: ${fromAddress}`);

  const info = await transporter.sendMail({
    from: fromAddress,
    to: toEmail,
    subject: `You're invited to co-record: ${title}`,
    text: `Hi ${toName},\n\nYou've been added as a co-recorder for "${title}".\n\nMeeting Passkey: ${passkey}\n\nGo to the app -> Join Meeting -> enter the passkey above.\n\n-- AI MeetNote`,
    html,
  });

  console.log(`✅ Passkey email sent to ${toEmail} — MessageID: ${info.messageId}`);
  return info;
}

module.exports = { sendSummaryEmail, sendPasskeyEmail };
