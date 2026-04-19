# 🚀 AI MeetNote — Setup Guide

This file answers all the questions about what you need to configure after the code changes are made.

---

## 📋 Table of Contents
1. [Free AI API (Groq)](#1-free-ai-api--groq)
2. [Gmail App Password](#2-gmail-app-password)
3. [MongoDB Atlas (Free Database)](#3-mongodb-atlas-free-database)
4. [Final .env File](#4-final-env-file)
5. [How to Run the App](#5-how-to-run-the-app)

---

## 1. Free AI API — Groq

Groq provides **100% free** access to:
- **Whisper Large v3** — for audio-to-text transcription
- **LLaMA 3.3 70B** — for generating summaries, key points, decisions, action items

### Steps to get your Groq API Key:
1. Go to 👉 https://console.groq.com
2. Sign up with Google or email (no credit card needed)
3. After login → click **"API Keys"** in the left sidebar
4. Click **"Create API Key"** → give it a name like `ai-meetnote`
5. Copy the key (starts with `gsk_...`)
6. Paste it in your `.env` file:
   ```
   GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Free Tier Limits (more than enough for dev):
| Resource | Free Limit |
|----------|-----------|
| Whisper transcription | 20 hours / day |
| LLaMA 3.3 70B tokens | 6,000 tokens / minute |
| Requests | 30 requests / minute |

---

## 2. Gmail App Password

Gmail does **NOT** allow direct password login for apps.
You must create an **App Password** (a special 16-character password just for this app).

### Steps:
1. Go to your Google Account → https://myaccount.google.com
2. Click **Security** (left sidebar)
3. Under "How you sign in to Google" → click **2-Step Verification**
   - If not enabled, enable it first (required for App Passwords)
4. Scroll down and click **App Passwords**
5. Under "Select app" → choose **Mail**
6. Under "Select device" → choose **Windows Computer** (or Other)
7. Click **Generate** → copy the 16-character password shown
8. Paste it in your `.env` file:
   ```
   EMAIL_USER=yourgmail@gmail.com
   EMAIL_PASS=xxxx xxxx xxxx xxxx
   ```
   > ⚠️ Include the spaces as-is OR remove them — both work.

---

## 3. MongoDB Atlas (Free Database)

MongoDB Atlas is a **free cloud-hosted** MongoDB database. No installation needed on your computer.

### Steps:
1. Go to 👉 https://www.mongodb.com/cloud/atlas
2. Click **"Try Free"** → sign up (no credit card)
3. After signup → you'll be prompted to create a cluster
4. Choose:
   - **Free tier** (M0 cluster — 512MB storage, always free)
   - Provider: AWS or Google Cloud (doesn't matter)
   - Region: Choose the one closest to India (e.g., Mumbai / Singapore)
5. Click **"Create"** → wait ~2 minutes for cluster to spin up

### Configure Access:
6. In left sidebar → **Database Access** → Add New Database User
   - Username: `meetnote_user`
   - Password: set a strong password (e.g., `MeetNote@2024`)
   - Role: **Read and Write to any database** ✅
   - Click **Add User**

7. In left sidebar → **Network Access** → Add IP Address
   - Click **"Allow Access from Anywhere"** (adds `0.0.0.0/0`)
   - Click **Confirm**

### Get Connection String:
8. In left sidebar → **Database** → click **Connect** on your cluster
9. Click **"Drivers"**
10. Select Driver: **Node.js** / Version: **6.x or later**
11. Copy the connection string — it looks like:
    ```
    mongodb+srv://meetnote_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
    ```
12. Replace `<password>` with your actual password
13. Add your database name at the end: `...mongodb.net/ai-meetnote?retryWrites=...`
14. Paste the full string in your `.env` file:
    ```
    MONGODB_URI=mongodb+srv://meetnote_user:MeetNote@2024@cluster0.xxxxx.mongodb.net/ai-meetnote?retryWrites=true&w=majority
    ```

---

## 4. Final .env File

After collecting all keys above, your `server/.env` should look like this:

```env
# Server
PORT=5000

# MongoDB Atlas
MONGODB_URI=mongodb+srv://meetnote_user:YourPassword@cluster0.xxxxx.mongodb.net/ai-meetnote?retryWrites=true&w=majority

# JWT (any long random string — keep it secret)
JWT_SECRET=change_this_to_a_long_random_string_abc123xyz789

# Groq AI (free) — https://console.groq.com
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Gmail (use App Password, NOT your real Gmail password)
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx
EMAIL_FROM=AI MeetNote <yourgmail@gmail.com>
```

> ⚠️ **NEVER commit this file to GitHub!** It's already in `.gitignore`.

---

## 5. How to Run the App

### Step 1: Install dependencies

Open two terminal windows:

**Terminal 1 — Server:**
```powershell
cd d:\AI-meetnote-main\server
npm install
```

**Terminal 2 — Client:**
```powershell
cd d:\AI-meetnote-main\client
npm install
```

### Step 2: Fill in the .env file
- Open `server/.env`
- Fill in all the values from Section 4 above

### Step 3: Start both servers

**Terminal 1 — Start Server:**
```powershell
cd d:\AI-meetnote-main\server
npm run dev
# You should see:
# ✅ Connected to MongoDB
# 🚀 Server running on port 5000
```

**Terminal 2 — Start Client:**
```powershell
cd d:\AI-meetnote-main\client
npm run dev
# You should see:
# Local: http://localhost:5173
```

### Step 4: Open the app
Go to 👉 http://localhost:5173

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| `MongoDB connection error` | Check your Atlas IP whitelist & MONGODB_URI spelling |
| `Invalid credentials` on login | Make sure you registered first with the same email |
| `Email not sending` | Double-check Gmail App Password (not your real password) |
| `Groq API error` | Check your GROQ_API_KEY is correct and not expired |
| `Port 5000 already in use` | Change `PORT=5001` in `.env` and update `vite.config.js` proxy |
| CORS errors in browser | Make sure server is running on port 5000 |

---

## 📦 Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TailwindCSS v4 |
| Backend | Express.js 5 + Node.js |
| Database | MongoDB Atlas (free) via Mongoose |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| AI Transcription | Groq Whisper Large v3 (free) |
| AI Summarization | Groq LLaMA 3.3 70B (free) |
| Email | Nodemailer + Gmail SMTP |
| Audio Capture | Browser MediaRecorder API |
| PDF Export | Browser window.print() |
