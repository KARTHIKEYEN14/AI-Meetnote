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

const meetingSchema = new mongoose.Schema(
  {
    title:           { type: String, required: true },
    agenda:          { type: String, default: '' },
    passkey:         { type: String, required: true, unique: true },
    host:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status:          {
      type: String,
      enum: ['scheduled', 'recording', 'processing', 'completed', 'failed'],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Meeting', meetingSchema);
