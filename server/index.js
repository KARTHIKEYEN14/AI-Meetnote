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
// Tests the Resend HTTP API connection (no SMTP sockets needed).
app.get('/api/health/email', async (req, res) => {
  const { Resend } = require('resend');
  const apiKey = process.env.RESEND_API_KEY;
  const to     = req.query.to || process.env.EMAIL_USER || 'test@example.com';

  if (!apiKey) {
    return res.status(500).json({
      ok:    false,
      error: 'RESEND_API_KEY is not set in environment variables.',
      hint:  'Sign up at https://resend.com → API Keys → Create API Key → add to Render env vars as RESEND_API_KEY',
    });
  }

  try {
    const resend = new Resend(apiKey);
    const from   = process.env.RESEND_FROM || 'AI MeetNote <onboarding@resend.dev>';

    const { data, error } = await resend.emails.send({
      from,
      to:      [to],
      subject: '✅ AI MeetNote email test (Resend)',
      text:    `Resend HTTP API is working correctly. Sent at ${new Date().toISOString()}`,
    });

    if (error) {
      console.error('[health/email] Resend error:', error);
      return res.status(500).json({ ok: false, error: error.message || JSON.stringify(error), apiKey: `${apiKey.slice(0, 8)}…` });
    }

    console.log(`[health/email] ✅ Resend test email sent — ID: ${data.id}`);
    res.json({ ok: true, to, from, resendId: data.id });
  } catch (err) {
    console.error('[health/email] Exception:', err.message);
    res.status(500).json({ ok: false, error: err.message });
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
