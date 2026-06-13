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
// Tries to send a test email and returns the full SMTP result / error.
// Use this to debug email issues on Render without touching the main app flow.
app.get('/api/health/email', async (req, res) => {
  const nodemailer = require('nodemailer');
  const to = req.query.to || process.env.EMAIL_USER;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    return res.status(500).json({ ok: false, error: 'EMAIL_USER or EMAIL_PASS not set in env' });
  }

  // Try port 587 first, then 465 as fallback
  const configs = [
    { port: 587, secure: false, label: 'port-587-STARTTLS' },
    { port: 465, secure: true,  label: 'port-465-SSL'      },
  ];

  const results = [];

  for (const cfg of configs) {
    const transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   cfg.port,
      secure: cfg.secure,
      family: 4,
      auth:   { user, pass },
      connectionTimeout: 10000,
      greetingTimeout:   10000,
      socketTimeout:     15000,
      tls: { rejectUnauthorized: false },
      logger: true,
      debug:  true,
    });

    try {
      // 1. Verify connection
      await transporter.verify();

      // 2. Send actual test mail
      const info = await transporter.sendMail({
        from:    user,
        to,
        subject: `✅ AI MeetNote SMTP test (${cfg.label})`,
        text:    `SMTP is working via ${cfg.label}. Sent at ${new Date().toISOString()}`,
      });

      results.push({ config: cfg.label, ok: true, messageId: info.messageId });
      console.log(`[health/email] ✅ ${cfg.label} SUCCESS — MessageID: ${info.messageId}`);

      // If one config works, no need to try the other
      return res.json({
        ok: true,
        workingConfig: cfg.label,
        to,
        results,
      });
    } catch (err) {
      console.error(`[health/email] ❌ ${cfg.label} FAILED:`, err.message, err.code);
      results.push({ config: cfg.label, ok: false, error: err.message, code: err.code });
    }
  }

  // Both configs failed
  res.status(500).json({ ok: false, to, results });
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
