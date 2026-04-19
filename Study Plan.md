# 📚 AI-Meetnote — Final Review Study Plan

> **Review date:** Tomorrow &nbsp;|&nbsp; **Goal:** Understand every essential module from top to bottom.

---

## 🗂️ Table of Contents

1. [Project Overview — The Big Picture](#1-project-overview)
2. [Database — MongoDB & Mongoose](#2-database--mongodb--mongoose)
3. [API Connection — Groq AI (Whisper + LLaMA)](#3-api-connection--groq-ai)
4. [Gmail Logic — Nodemailer](#4-gmail-logic--nodemailer)
5. [Express Server — Entry Point](#5-express-server--entry-point)
6. [Authentication — JWT](#6-authentication--jwt)
7. [Client-Side API Layer — Axios](#7-client-side-api-layer--axios)
8. [Recording Flow — How Audio Gets Processed](#8-recording-flow)
9. [Summary Page — Approval & Download](#9-summary-page)
10. [Environment Variables Cheatsheet](#10-environment-variables-cheatsheet)

---

## 1. Project Overview

```
User (Browser)
   │
   ├── React Frontend  (Vite · port 5173)
   │       └── calls /api/* → proxy → Express backend
   │
   └── Express Backend (Node.js · port 5000)
           ├── MongoDB  — stores users & meetings
           ├── Groq AI  — transcription + summary
           └── Gmail    — emails summary to participants
```

**The full user journey in one sentence:**
> A user creates a meeting → records audio in the browser → audio is sent to the server → Groq transcribes it → LLaMA summarises it → the host approves → Nodemailer emails a `.docx` to everyone.

---

## 2. Database — MongoDB & Mongoose

### What is used
| Thing | Purpose |
|---|---|
| `mongoose` npm package | ODM — lets you define schemas and talk to MongoDB |
| `mongodb://localhost:27017/ai-meetnote` | Local MongoDB database |
| `{ timestamps: true }` | Auto-adds `createdAt` & `updatedAt` to every document |

---

### User Model (`server/models/User.js`)

```
Fields:
  name      — String, required
  email     — String, required, unique
  password  — String, required (stored as bcrypt hash, NOT plain text)
  createdAt — auto (timestamps)
  updatedAt — auto (timestamps)
```

**How password hashing works:**
1. Before every `.save()`, a Mongoose **pre-save hook** fires.
2. It checks `this.isModified('password')` — only hashes if the password actually changed.
3. `bcrypt.hash(password, 10)` → generates a salted hash with 10 rounds.
4. `comparePassword(candidate)` → uses `bcrypt.compare()` to verify at login.

> 🔑 **Key point:** The raw password is **never stored** — only the hash.

---

### Meeting Model (`server/models/Meeting.js`)

```
Fields:
  title              — String, required
  agenda             — String (optional context for AI)
  passkey            — String, unique (6-char random code, e.g. "AB12XY")
  host               — ObjectId → references User
  status             — 'scheduled' | 'recording' | 'processing' | 'completed' | 'failed'
  recipientEmails    — [String]  (all emails that get the summary)
  participants       — [{ name, email, isHost }]
  perSpeakerTranscripts — [{ speakerName, transcript }]
  startedAt          — Date (when recording actually began)
  transcript         — String (raw merged transcript from Whisper)
  summary            — { keyPoints[], decisions[], actionItems[{task, assignee, status}] }
  hostApproved       — Boolean (true after host clicks Approve)
  createdAt          — auto
  updatedAt          — auto  ← used to calculate meeting duration
```

**Duration formula:**
```
Duration = updatedAt − startedAt
```
- `startedAt` = moment the user clicked "Start Recording"
- `updatedAt` = last time Mongoose saved the document = when AI finished processing
- This gives the **real recording duration**, not just document age.

**How the passkey is generated:**
```js
Math.random().toString(36).substring(2, 8).toUpperCase()
// e.g. → "K7RQ2A"
// A while-loop checks for uniqueness in the DB before accepting it.
```

---

## 3. API Connection — Groq AI

### What is used
| Thing | Purpose |
|---|---|
| `groq-sdk` npm package | Official Groq client for Node.js |
| `GROQ_API_KEY` in `.env` | Your secret key from console.groq.com |
| **Whisper Large v3** | Speech-to-text model (audio → transcript) |
| **LLaMA 3.3 70B Versatile** | Chat/text model (transcript → structured JSON summary) |

---

### Step 1 — Transcription (`transcribeAudio`)

**File:** `server/services/ai.js`

```
Input:  Path to an audio file (.webm)
Output: Plain-text transcript string

How it works:
  1. fs.createReadStream(filePath)  →  opens the audio file as a stream
  2. groq.audio.transcriptions.create({
         model: 'whisper-large-v3',
         response_format: 'text',   ← returns a plain string, not JSON
         language: 'en'
     })
  3. Returns the transcript string directly.
```

> 🎙️ **Whisper** is OpenAI's open-source speech model, hosted on Groq's fast inference hardware.

---

### Step 2 — Summary Generation (`generateSummary`)

**File:** `server/services/ai.js`

```
Input:  transcript (string) + agenda (string, optional)
Output: { keyPoints[], decisions[], actionItems[] }

How it works:
  1. A system prompt instructs the model:
       "You are an expert meeting assistant. Extract key points,
        decisions, and action items. Respond ONLY with valid JSON."

  2. User message = Agenda (if any) + Transcript text

  3. groq.chat.completions.create({
         model: 'llama-3.3-70b-versatile',
         temperature: 0.3,    ← low = more factual, less creative
         max_tokens: 1024
     })

  4. The raw response may have markdown fences (```json ... ```)
     → .replace(/```json|```/g, '').trim()  strips them away
     → JSON.parse() converts to object

  5. Array checks guard against the model returning wrong types.
```

> 🧠 **temperature: 0.3** — The closer to 0, the more deterministic and factual the output. Good for structured data extraction.

---

### Multi-Speaker Flow

When multiple people record:
1. Each speaker's audio comes as a separate file (`audio_0`, `audio_1`, …)
2. Each file is transcribed separately → `"[Rajesh]: ...text..."`, `"[Karthi]: ...text..."`
3. All parts are joined with `\n\n` → one merged transcript
4. That merged transcript goes into `generateSummary()` as a single call

---

## 4. Gmail Logic — Nodemailer

### What is used
| Thing | Purpose |
|---|---|
| `nodemailer` npm package | Sends emails from Node.js |
| Gmail SMTP service | Delivery channel |
| `EMAIL_USER` | Gmail address used to send |
| `EMAIL_PASS` | **Gmail App Password** (not your real password!) |
| `EMAIL_FROM` | Display name shown to recipients |

> ⚠️ **App Password vs Real Password:** Google blocks direct login for sending email. You must create a 16-character App Password under Google Account → Security → 2-Step Verification → App Passwords.

---

### The Transporter (created once at startup)

**File:** `server/services/email.js`

```js
nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,  // karthikn1466@gmail.com
    pass: process.env.EMAIL_PASS,  // App Password (spaces are fine)
  }
})
```
The transporter is a **reusable singleton** — created once when the module loads, reused for every email.

---

### Email Type 1 — Summary Email (`sendSummaryEmail`)

**Triggered by:** Host clicking "Approve & Send"

```
Recipients:  All emails in meeting.recipientEmails[]
Subject:     "Meeting Summary: <title>"
Body:        Plain-text version  +  HTML version (email clients pick the best one)
Attachment:  <title>_minutes.docx  (the Word document buffer)

HTML email includes:
  - Gradient header with meeting title
  - Date, agenda, participants
  - Discussion Points  (bullet list)
  - Key Decisions      (bullet list)
  - Action Items       (HTML table: Task | Assignee | Status)
```

---

### Email Type 2 — Passkey Email (`sendPasskeyEmail`)

**Triggered by:** Host clicking "Invite Co-Recorder"

```
Recipient:  One co-recorder's email
Subject:    "You're invited to co-record: <title>"
Content:
  - Styled HTML card
  - Large passkey displayed in monospace font
  - Step-by-step instructions to join
```

---

### How the .docx is built

**File:** `server/routes/meetings.js` → `buildDocxBuffer(meeting)`

```
Library: docx (npm)

Structure of the Word document:
  1. Title heading  — "<Meeting Title> — Minutes"
  2. Metadata table — Date | Duration | Agenda | Participants
  3. "Discussion Points" heading + bullet list
  4. "Key Decisions" heading + bullet list
  5. "Action Items" heading + table (Task | Assignee | Status)
  6. Footer line   — "Generated by AI MeetNote • Powered by Groq AI"

Returns: Buffer  (used both for email attachment and for download)
```

---

## 5. Express Server — Entry Point

**File:** `server/index.js`

```
Startup sequence:
  1. dotenv.config()            — loads .env into process.env
  2. Express app created
  3. CORS configured            — only allows localhost:5173 and localhost:4173
  4. Body parser                — JSON + URL-encoded, up to 10 MB
  5. Routes mounted:
       /api/auth     → auth.js   (register, login)
       /api/meetings → meetings.js (all meeting operations)
       /api/health   → simple "ok" check
  6. Global error handler
  7. mongoose.connect()         — connects to MongoDB
  8. app.listen(5000)           — starts accepting requests
```

> 💡 MongoDB connection happens **after** routes are mounted but **before** real traffic arrives — that order is intentional.

---

## 6. Authentication — JWT

### Register / Login flow

**File:** `server/routes/auth.js`

```
REGISTER  POST /api/auth/register
  Input:  { name, email, password }
  Steps:
    1. Check if email already exists → 400 if yes
    2. new User({ name, email, password }) → pre-save hook hashes password
    3. jwt.sign({ id, name, email }, JWT_SECRET, { expiresIn: '7d' })
    4. Return { token, user }

LOGIN  POST /api/auth/login
  Input:  { email, password }
  Steps:
    1. Find user by email
    2. user.comparePassword(candidate) → bcrypt.compare()
    3. Sign new JWT → return { token, user }
```

### Auth Middleware

**File:** `server/middleware/auth.js`

```
Applied to: Every /api/meetings/* route

How it works:
  1. Read Authorization header → "Bearer <token>"
  2. Strip "Bearer " prefix
  3. jwt.verify(token, JWT_SECRET)  → decodes { id, name, email }
  4. Attach as req.user
  5. Call next() — let the route handler continue

On failure:
  → 401 "No token" or "Invalid or expired token"
```

> 🛡️ The JWT expires in **7 days**. After expiry, the client receives a 401 → the Axios interceptor clears localStorage and redirects to `/login`.

---

## 7. Client-Side API Layer — Axios

**File:** `client/src/services/api.js`

```
Base URL: '/api'
  → Vite dev server proxies this to http://localhost:5000/api
  → So the React app never hard-codes the server address

Request Interceptor (fires before every request):
  1. Read token from localStorage
  2. Add header: Authorization: Bearer <token>

Response Interceptor (fires after every response):
  Success → pass through unchanged
  401 error →
    1. localStorage.removeItem('token')
    2. localStorage.removeItem('user')
    3. window.location.href = '/login'
```

> Every page that calls `api.get(...)` or `api.post(...)` automatically includes the JWT. No manual header setting anywhere else.

---

## 8. Recording Flow

### Single Speaker

```
RecordingPage
  1. User clicks "Start Recording"
     → MediaRecorder API captures microphone audio
     → startedAt = new Date()  (stored in a ref)

  2. User clicks "Stop Recording"
     → Audio blob is collected

  3. FormData is built:
     formData.append('audio', audioBlob)
     formData.append('startedAt', startedAtRef.current.toISOString())

  4. POST /api/meetings/:id/process  (multipart/form-data)

Server:
  5. Multer saves audio to /uploads/<timestamp>-audio.webm
  6. meeting.status = 'processing'
  7. meeting.startedAt = provided startedAt
  8. Response sent immediately so browser doesn't wait

Background async:
  9.  transcribeAudio(audioPath)   → Whisper → transcript string
  10. generateSummary(transcript)  → LLaMA  → { keyPoints, decisions, actionItems }
  11. meeting.summary = summary
  12. meeting.status = 'completed'
  13. meeting.save()
  14. File deleted from /uploads
```

### Multi-Speaker

```
Extra fields in FormData:
  audio_0, audio_1, ...    (one per speaker)
  speakerNames = JSON array
  participants = JSON array of { name, email, isHost }

Server POST /api/meetings/:id/process-multi:
  - Transcribes each audio file separately
  - Labels each: "[Rajesh]: ...", "[Karthi]: ..."
  - Joins all → single merged transcript
  - generateSummary(mergedTranscript) → one unified summary
  - No email sent here — email only goes out on Approve
```

### Status Polling

```
RecordingPage polls GET /api/meetings/:id/status every 3 seconds
  → { status: 'processing' | 'completed' | 'failed' }
When 'completed' → navigate to /summary/:id
```

---

## 9. Summary Page

**File:** `client/src/pages/SummaryPage.jsx`

### What is displayed
```
1. Meeting metadata card
   - Date       (from startedAt, falls back to createdAt)
   - Start time (from startedAt)
   - Duration   (updatedAt − startedAt, in minutes)
   - Host name
   - Participants list with host/co-recorder badges

2. Editable draft banner (amber warning)

3. Three content sections
   - Discussion Points  (keyPoints[])
   - Key Decisions      (decisions[])
   - Action Items       (actionItems[] with assignee)

4. Approval section
   - Shows each participant's approval status
   - Green "✓ Approved / ✓ Notified" after host approves

5. Bottom action bar (3 buttons)
   - ← New Meeting    → navigate to /meeting/create
   - Approve & Send   → POST /api/meetings/:id/approve
                        (emails .docx to all, no download)
   - Download .docx   → GET /api/meetings/:id/download
                        (downloads only, no email)
```

### Approve flow (client)
```
1. api.post(`/meetings/${id}/approve`)   → server emails everyone
2. setApproved(true)
3. fetchMeeting()  — refreshes data to show updated status badges
```

### Download flow (client)
```
1. api.get(`/meetings/${id}/download`, { responseType: 'blob' })
2. window.URL.createObjectURL(blob)
3. Programmatically click a hidden <a> tag → file saves
4. Revoke the object URL (memory cleanup)
```

---

## 10. Environment Variables Cheatsheet

**File:** `server/.env`

| Variable | Value | Purpose |
|---|---|---|
| `PORT` | `5000` | Express listens on this port |
| `MONGODB_URI` | `mongodb://localhost:27017/ai-meetnote` | Local DB connection string |
| `JWT_SECRET` | Any long random string | Signs & verifies JWTs |
| `GROQ_API_KEY` | `gsk_...` | Authenticates with Groq API |
| `EMAIL_USER` | Gmail address | SMTP login username |
| `EMAIL_PASS` | 16-char App Password | SMTP login password |
| `EMAIL_FROM` | `"AI MeetNote <email>"` | "From" name shown in inbox |

---

## ✅ Quick Recap — The 5 Things That Power This App

```
┌─────────────────────────────────────────────────────────────┐
│  1. MongoDB       → Stores users and all meeting data       │
│  2. Groq Whisper  → Converts audio files to text           │
│  3. Groq LLaMA    → Converts text to structured JSON        │
│  4. Nodemailer    → Emails the summary + .docx attachment   │
│  5. JWT + bcrypt  → Handles login security                  │
└─────────────────────────────────────────────────────────────┘
```

---

> 💪 **You've got this. Good luck tomorrow!**
