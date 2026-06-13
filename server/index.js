require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  // 👇 Replace with your actual Vercel URL after deploying the frontend
  'https://ai-meetnote.vercel.app',
  process.env.FRONTEND_URL, // optional: set this env var on Render for flexibility
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// ── Email diagnostic — GET /api/health/email?to=you@example.com ───────────────
// Tests the Brevo HTTP API — no SMTP ports needed.
app.get('/api/health/email', async (req, res) => {
  const brevoSdk = require('@getbrevo/brevo');
  const apiKey   = process.env.BREVO_API_KEY;
  const to       = req.query.to || process.env.EMAIL_USER || 'test@example.com';
  const from     = process.env.EMAIL_USER || process.env.EMAIL_FROM || 'karthikn1466@gmail.com';

  if (!apiKey) {
    return res.status(500).json({
      ok:    false,
      error: 'BREVO_API_KEY is not set.',
      hint:  'Sign up free at https://app.brevo.com → SMTP & API → API Keys → Generate key → add as BREVO_API_KEY in Render env vars. Also verify your sender email under Senders & IP → Senders.',
    });
  }

  try {
    const defaultClient = brevoSdk.ApiClient.instance;
    defaultClient.authentications['api-key'].apiKey = apiKey;
    const api = new brevoSdk.TransactionalEmailsApi();

    const sendSmtpEmail = new brevoSdk.SendSmtpEmail();
    sendSmtpEmail.sender      = { name: 'AI MeetNote', email: from };
    sendSmtpEmail.to          = [{ email: to }];
    sendSmtpEmail.subject     = '✅ AI MeetNote email test (Brevo)';
    sendSmtpEmail.textContent = `Brevo HTTP API is working correctly. Sent at ${new Date().toISOString()}`;

    const result = await api.sendTransacEmail(sendSmtpEmail);
    const msgId  = result.body?.messageId || result.messageId || 'sent';

    console.log(`[health/email] ✅ Brevo test email sent to ${to} — messageId: ${msgId}`);
    res.json({ ok: true, to, from, messageId: msgId });
  } catch (err) {
    console.error('[health/email] Brevo error:', err.message || err);
    res.status(500).json({ ok: false, error: err.message || JSON.stringify(err) });
  }
});


// ── Global error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.message || err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal Server Error' });
});

// ── Database ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('   👉 Fix MONGODB_URI in server/.env then save to auto-restart');
  });

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
