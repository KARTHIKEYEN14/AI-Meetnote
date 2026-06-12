const mongoose = require('mongoose');

const actionItemSchema = new mongoose.Schema({
  task:     { type: String, default: '' },
  assignee: { type: String, default: '' },
  status:   { type: String, enum: ['pending', 'completed'], default: 'pending' },
});

const participantSchema = new mongoose.Schema({
  name:   { type: String, default: '' },
  email:  { type: String, default: '' },
  isHost: { type: Boolean, default: false },
});

const perSpeakerTranscriptSchema = new mongoose.Schema({
  speakerName: { type: String, default: '' },
  transcript:  { type: String, default: '' },
});

// ── Remote recording: one entry per participant who uploaded their audio chunk ─
const submittedChunkSchema = new mongoose.Schema({
  participantId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participantName:  { type: String, default: '' },
  participantEmail: { type: String, default: '' },
  isHost:           { type: Boolean, default: false },
  transcript:       { type: String, default: '' },
  submittedAt:      { type: Date, default: Date.now },
});

const meetingSchema = new mongoose.Schema(
  {
    title:           { type: String, required: true },
    agenda:          { type: String, default: '' },
    passkey:         { type: String, required: true, unique: true },
    host:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status:          {
      type: String,
      enum: ['scheduled', 'recording', 'waiting_for_participants', 'processing', 'completed', 'failed'],
      default: 'scheduled',
    },

    // All email recipients for the summary (host + participants)
    recipientEmails: { type: [String], default: [] },

    // Speakers added during an offline multi-speaker recording
    participants: { type: [participantSchema], default: [] },

    // Per-speaker audio transcripts (ordered by speaking sequence)
    perSpeakerTranscripts: { type: [perSpeakerTranscriptSchema], default: [] },

    // When the recording was actually started (for duration calculation)
    startedAt: { type: Date, default: null },

    // Raw audio transcript from Groq Whisper (kept for reference)
    transcript:      { type: String, default: '' },

    // AI-generated summary
    summary: {
      keyPoints:   { type: [String], default: [] },
      decisions:   { type: [String], default: [] },
      actionItems: { type: [actionItemSchema], default: [] },
    },

    // Whether the host has approved the summary for distribution
    hostApproved: { type: Boolean, default: false },

    // ── Remote recording fields ───────────────────────────────────────────────
    // true = participants record from their own devices
    remoteMode: { type: Boolean, default: false },

    // How many total recordings the host expects (including their own)
    expectedParticipants: { type: Number, default: 0 },

    // Each submitted audio chunk (transcribed server-side)
    submittedChunks: { type: [submittedChunkSchema], default: [] },

    // Convenience counter — incremented atomically when a chunk arrives
    chunksReceived: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Meeting', meetingSchema);
