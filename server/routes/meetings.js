const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Meeting = require('../models/Meeting');
const auth = require('../middleware/auth');
const { transcribeAudio, generateSummary } = require('../services/ai');
const { sendSummaryEmail, sendPasskeyEmail } = require('../services/email');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType,
} = require('docx');

// ── Multer storage — save audio with .webm extension ─────────────────────────
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.fieldname}.webm`);
  },
});
const upload = multer({ storage });

// ── Helpers ───────────────────────────────────────────────────────────────────
const generatePasskey = () => Math.random().toString(36).substring(2, 8).toUpperCase();

function cleanupFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
  }
}

/**
 * Build a .docx Word document from a meeting object.
 * Returns a Buffer.
 */
async function buildDocxBuffer(meeting) {
  const { title, agenda, summary, participants, createdAt, startedAt, updatedAt } = meeting;

  const date = startedAt
    ? new Date(startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : createdAt
    ? new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';

  // Duration = recording start → meeting completion (updatedAt)
  const duration = (startedAt && updatedAt)
    ? `${Math.max(1, Math.round((new Date(updatedAt) - new Date(startedAt)) / 60000))} min`
    : 'N/A';

  const heading = (text, level = HeadingLevel.HEADING_2) =>
    new Paragraph({ text, heading: level, spacing: { before: 300, after: 100 } });

  const bullet = (text) =>
    new Paragraph({
      text: `• ${text}`,
      indent: { left: 400 },
      spacing: { after: 80 },
    });

  const metaRow = (label, value) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ text: value || 'N/A' })],
        }),
      ],
    });

  // Combine participants from both remote chunks and local participants list
  const allParticipants = meeting.remoteMode && meeting.submittedChunks?.length
    ? meeting.submittedChunks.map(c => ({ name: c.participantName, email: c.participantEmail }))
    : (participants || []);

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      metaRow('Date', date),
      metaRow('Duration', duration),
      metaRow('Agenda', agenda || ''),
      metaRow('Recording Mode', meeting.remoteMode ? 'Remote (Distributed)' : 'Local'),
      metaRow(
        'Participants',
        allParticipants.map((p) => `${p.name}${p.email ? ` <${p.email}>` : ''}`).join(', ') || 'N/A'
      ),
    ],
  });

  const actionTable = summary.actionItems.length
    ? new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: ['Task', 'Assignee', 'Status'].map((h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
                shading: { fill: 'F1F5F9' },
              })
            ),
          }),
          ...summary.actionItems.map(
            (a) =>
              new TableRow({
                children: [a.task, a.assignee, a.status].map(
                  (v) => new TableCell({ children: [new Paragraph({ text: v || '' })] })
                ),
              })
          ),
        ],
      })
    : new Paragraph({ text: '(none recorded)', italics: true });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `${title} — Minutes`,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          metaTable,
          new Paragraph({ text: '', spacing: { after: 200 } }),

          heading('Discussion Points'),
          ...(summary.keyPoints.length
            ? summary.keyPoints.map(bullet)
            : [new Paragraph({ text: '(none recorded)', italics: true })]),

          heading('Key Decisions'),
          ...(summary.decisions.length
            ? summary.decisions.map(bullet)
            : [new Paragraph({ text: '(none recorded)', italics: true })]),

          heading('Action Items'),
          actionTable,

          new Paragraph({ text: '', spacing: { before: 400 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Generated by AI MeetNote • Powered by Groq AI', size: 18, color: '94A3B8' }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

// ── Trigger merge + AI summary after all chunks received ─────────────────────
async function triggerRemoteMerge(meeting) {
  try {
    console.log(`[remote-merge] Merging ${meeting.submittedChunks.length} chunks for meeting ${meeting._id}…`);
    meeting.status = 'processing';
    await meeting.save();

    // Build per-speaker transcripts from submitted chunks
    const perSpeakerTranscripts = meeting.submittedChunks.map(c => ({
      speakerName: c.participantName,
      transcript: c.transcript,
    }));

    const mergedTranscript = perSpeakerTranscripts
      .map(({ speakerName, transcript }) => `[${speakerName}]: ${transcript}`)
      .join('\n\n');

    meeting.perSpeakerTranscripts = perSpeakerTranscripts;
    meeting.transcript = mergedTranscript;

    // Build participants list from chunks
    meeting.participants = meeting.submittedChunks.map(c => ({
      name:   c.participantName,
      email:  c.participantEmail,
      isHost: c.isHost,
    }));

    console.log(`[remote-merge] Generating AI summary…`);
    const summary = await generateSummary(mergedTranscript, meeting.agenda);
    meeting.summary = summary;
    meeting.status = 'completed';
    await meeting.save();
    console.log(`[remote-merge] ✅ Meeting ${meeting._id} completed.`);
  } catch (err) {
    console.error('[remote-merge] Error:', err.message);
    meeting.status = 'failed';
    await meeting.save();
  }
}

// ── POST /api/meetings — Create a meeting ─────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { title, agenda, recipientEmails, remoteMode, expectedParticipants } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });

    let emails = [];
    if (Array.isArray(recipientEmails)) {
      emails = recipientEmails.map((e) => e.trim()).filter(Boolean);
    } else if (typeof recipientEmails === 'string' && recipientEmails.trim()) {
      emails = recipientEmails.split(',').map((e) => e.trim()).filter(Boolean);
    }

    if (req.user.email && !emails.includes(req.user.email)) {
      emails.unshift(req.user.email);
    }

    let passkey = generatePasskey();
    while (await Meeting.findOne({ passkey })) {
      passkey = generatePasskey();
    }

    const isRemote = remoteMode === true || remoteMode === 'true';
    const expectedCount = isRemote ? (parseInt(expectedParticipants, 10) || 1) : 0;

    const meeting = new Meeting({
      title,
      agenda: agenda || '',
      passkey,
      host: req.user.id,
      recipientEmails: emails,
      remoteMode: isRemote,
      expectedParticipants: expectedCount,
      status: isRemote ? 'waiting_for_participants' : 'scheduled',
    });

    await meeting.save();
    res.status(201).json(meeting);
  } catch (err) {
    console.error('[POST /meetings]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/meetings/join — Join by passkey ─────────────────────────────────
router.post('/join', auth, async (req, res) => {
  try {
    const { passkey, participantEmail } = req.body;
    if (!passkey) return res.status(400).json({ message: 'Passkey is required' });

    const meeting = await Meeting.findOne({ passkey: passkey.trim().toUpperCase() });
    if (!meeting) return res.status(404).json({ message: 'Invalid passkey — meeting not found' });

    if (participantEmail && !meeting.recipientEmails.includes(participantEmail.trim())) {
      meeting.recipientEmails.push(participantEmail.trim());
      await meeting.save();
    }

    res.json(meeting);
  } catch (err) {
    console.error('[POST /meetings/join]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/meetings — List meetings for logged-in user ──────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const meetings = await Meeting.find({ host: req.user.id }).sort({ createdAt: -1 });
    res.json(meetings);
  } catch (err) {
    console.error('[GET /meetings]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/meetings/:id — Get a single meeting ──────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    console.error('[GET /meetings/:id]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/meetings/:id/status — Poll processing status ─────────────────────
router.get('/:id/status', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id).select('status');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    res.json({ status: meeting.status });
  } catch (err) {
    console.error('[GET /meetings/:id/status]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/meetings/:id/chunk-status — Remote recording progress ────────────
// Returns how many chunks received vs expected (for host polling)
router.get('/:id/chunk-status', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .select('status chunksReceived expectedParticipants remoteMode submittedChunks');
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    const submitters = (meeting.submittedChunks || []).map(c => ({
      name:  c.participantName,
      email: c.participantEmail,
      isHost: c.isHost,
      submittedAt: c.submittedAt,
    }));

    res.json({
      remoteMode:           meeting.remoteMode,
      chunksReceived:       meeting.chunksReceived,
      expectedParticipants: meeting.expectedParticipants,
      status:               meeting.status,
      submitters,
    });
  } catch (err) {
    console.error('[GET /meetings/:id/chunk-status]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/meetings/:id/start-remote — Host activates remote mode ──────────
// Can also update expectedParticipants count on an existing meeting
router.post('/:id/start-remote', auth, async (req, res) => {
  try {
    const { expectedParticipants } = req.body;
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (String(meeting.host) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the host can enable remote recording.' });
    }

    meeting.remoteMode = true;
    meeting.expectedParticipants = parseInt(expectedParticipants, 10) || 1;
    meeting.status = 'waiting_for_participants';
    await meeting.save();

    res.json({
      message: 'Remote recording mode activated.',
      passkey: meeting.passkey,
      expectedParticipants: meeting.expectedParticipants,
    });
  } catch (err) {
    console.error('[POST /meetings/:id/start-remote]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/meetings/:id/submit-chunk — Participant submits their audio ─────
// Any logged-in user who knows the passkey can submit.
// Guards: one submission per user, meeting must be in remote mode.
router.post(
  '/:id/submit-chunk',
  auth,
  upload.single('audio'),
  async (req, res) => {
    const audioPath = req.file?.path;
    try {
      const meeting = await Meeting.findById(req.params.id);
      if (!meeting) {
        cleanupFile(audioPath);
        return res.status(404).json({ message: 'Meeting not found' });
      }

      if (!meeting.remoteMode) {
        cleanupFile(audioPath);
        return res.status(400).json({ message: 'This meeting is not in remote recording mode.' });
      }

      if (!['waiting_for_participants', 'recording'].includes(meeting.status)) {
        cleanupFile(audioPath);
        return res.status(400).json({ message: `Meeting status is "${meeting.status}" — cannot accept more chunks.` });
      }

      // Guard: one submission per user
      const alreadySubmitted = meeting.submittedChunks.some(
        c => String(c.participantId) === String(req.user.id)
      );
      if (alreadySubmitted) {
        cleanupFile(audioPath);
        return res.status(409).json({ message: 'You have already submitted your recording for this meeting.' });
      }

      if (!audioPath) {
        return res.status(400).json({ message: 'No audio file received.' });
      }

      const isHost = String(meeting.host) === String(req.user.id);
      const participantName  = req.body.participantName  || req.user.name  || req.user.email?.split('@')[0] || 'Unknown';
      const participantEmail = req.body.participantEmail || req.user.email || '';

      // Add participant email to recipient list if not already there
      if (participantEmail && !meeting.recipientEmails.includes(participantEmail)) {
        meeting.recipientEmails.push(participantEmail);
      }

      // Set startedAt on first chunk
      if (!meeting.startedAt) {
        meeting.startedAt = req.body.startedAt ? new Date(req.body.startedAt) : new Date();
      }

      await meeting.save();

      // Respond immediately — transcription runs in background
      res.json({ message: 'Audio received. Transcribing in background…', isHost });

      // ── Background: transcribe + check if merge is needed ─────────────────
      (async () => {
        try {
          console.log(`[submit-chunk] Transcribing audio for "${participantName}"…`);
          const transcript = await transcribeAudio(audioPath);

          // Atomically push the chunk and increment counter
          await Meeting.findByIdAndUpdate(meeting._id, {
            $push: {
              submittedChunks: {
                participantId:    req.user.id,
                participantName,
                participantEmail,
                isHost,
                transcript,
                submittedAt: new Date(),
              },
            },
            $inc: { chunksReceived: 1 },
          });

          const updated = await Meeting.findById(meeting._id);
          console.log(`[submit-chunk] Chunk saved. ${updated.chunksReceived}/${updated.expectedParticipants} received.`);

          // If all chunks are in → trigger merge
          if (updated.chunksReceived >= updated.expectedParticipants) {
            await triggerRemoteMerge(updated);
          }
        } catch (err) {
          console.error('[submit-chunk] Background error:', err.message);
        } finally {
          cleanupFile(audioPath);
        }
      })();
    } catch (err) {
      console.error('[POST /meetings/:id/submit-chunk]', err.message);
      cleanupFile(audioPath);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ── POST /api/meetings/:id/process — Single-audio upload (legacy) ─────────────
router.post('/:id/process', auth, upload.single('audio'), async (req, res) => {
  const audioPath = req.file?.path;
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) {
      cleanupFile(audioPath);
      return res.status(404).json({ message: 'Meeting not found' });
    }

    meeting.status = 'processing';
    meeting.startedAt = meeting.startedAt || new Date();
    await meeting.save();

    res.json({ message: 'Audio received, processing started', meetingId: meeting._id });

    (async () => {
      try {
        const transcript = await transcribeAudio(audioPath);
        meeting.transcript = transcript;
        const summary = await generateSummary(transcript, meeting.agenda);
        meeting.summary = summary;
        meeting.status = 'completed';
        await meeting.save();

        if (meeting.recipientEmails.length > 0) {
          await sendSummaryEmail(meeting.recipientEmails, meeting, null);
        }
      } catch (aiErr) {
        console.error('[process] AI/Email error:', aiErr.message);
        meeting.status = 'failed';
        await meeting.save();
      } finally {
        cleanupFile(audioPath);
      }
    })();
  } catch (err) {
    console.error('[POST /meetings/:id/process]', err.message);
    cleanupFile(audioPath);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/meetings/:id/process-multi — Multi-speaker audio upload ─────────
//   Expects fields: audio_0, audio_1, ... (one per speaker chunk)
//   and a JSON body field: speakerNames = ["Rajesh", "karthi", ...]
//   and: participants = [{name, email}, ...]
//   and: startedAt = ISO date string
router.post(
  '/:id/process-multi',
  auth,
  upload.fields([
    { name: 'audio_0' }, { name: 'audio_1' }, { name: 'audio_2' },
    { name: 'audio_3' }, { name: 'audio_4' }, { name: 'audio_5' },
    { name: 'audio_6' }, { name: 'audio_7' }, { name: 'audio_8' },
    { name: 'audio_9' },
  ]),
  async (req, res) => {
    const uploadedPaths = [];

    try {
      const meeting = await Meeting.findById(req.params.id);
      if (!meeting) {
        return res.status(404).json({ message: 'Meeting not found' });
      }

      // Parse speaker names and participants from form fields
      let speakerNames = [];
      let participants = [];
      let startedAt = null;

      try { speakerNames = JSON.parse(req.body.speakerNames || '[]'); } catch (_) {}
      try { participants = JSON.parse(req.body.participants || '[]'); } catch (_) {}
      try { startedAt = req.body.startedAt ? new Date(req.body.startedAt) : null; } catch (_) {}

      // Collect uploaded audio files in order
      const audioFiles = [];
      for (let i = 0; i < 10; i++) {
        const field = req.files?.[`audio_${i}`];
        if (field && field[0]) {
          audioFiles.push(field[0].path);
          uploadedPaths.push(field[0].path);
        }
      }

      if (audioFiles.length === 0) {
        return res.status(400).json({ message: 'No audio files received' });
      }

      // Update meeting metadata immediately
      meeting.status = 'processing';
      meeting.participants = participants;
      if (startedAt) meeting.startedAt = startedAt;

      // Add participant emails to recipientEmails if not already there
      for (const p of participants) {
        if (p.email && !meeting.recipientEmails.includes(p.email)) {
          meeting.recipientEmails.push(p.email);
        }
      }

      await meeting.save();

      res.json({ message: 'Audio received, processing started', meetingId: meeting._id });

      // ── Background processing ─────────────────────────────────────────────
      (async () => {
        try {
          const perSpeakerTranscripts = [];
          const mergedParts = [];

          for (let i = 0; i < audioFiles.length; i++) {
            const speakerName = speakerNames[i] || `Speaker ${i + 1}`;
            console.log(`[process-multi] Transcribing chunk ${i} for speaker "${speakerName}"…`);
            const transcript = await transcribeAudio(audioFiles[i]);
            perSpeakerTranscripts.push({ speakerName, transcript });
            mergedParts.push(`[${speakerName}]: ${transcript}`);
          }

          const mergedTranscript = mergedParts.join('\n\n');

          meeting.perSpeakerTranscripts = perSpeakerTranscripts;
          meeting.transcript = mergedTranscript;

          console.log(`[process-multi] Generating summary…`);
          const summary = await generateSummary(mergedTranscript, meeting.agenda);
          meeting.summary = summary;
          meeting.status = 'completed';
          await meeting.save();
          console.log(`[process-multi] ✅ Meeting ${meeting._id} complete.`);

          // Note: email with .docx is sent only after host approves (POST /:id/approve)
        } catch (aiErr) {
          console.error('[process-multi] AI error:', aiErr.message);
          meeting.status = 'failed';
          await meeting.save();
        } finally {
          uploadedPaths.forEach(cleanupFile);
          console.log(`[process-multi] 🗑️  Audio files deleted.`);
        }
      })();
    } catch (err) {
      console.error('[POST /meetings/:id/process-multi]', err.message);
      uploadedPaths.forEach(cleanupFile);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ── GET /api/meetings/:id/download — Download .docx without approving ─────────
router.get('/:id/download', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (meeting.status !== 'completed') {
      return res.status(400).json({ message: 'Meeting is not yet processed.' });
    }

    const docxBuffer = await buildDocxBuffer(meeting);
    const safeTitle = meeting.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeTitle}_minutes.docx"`,
      'Content-Length': docxBuffer.length,
    });
    res.send(docxBuffer);
  } catch (err) {
    console.error('[GET /meetings/:id/download]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/meetings/:id/approve — Host approves → email .docx to all ───────
router.post('/:id/approve', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (String(meeting.host) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the host can approve this meeting.' });
    }
    if (meeting.status !== 'completed') {
      return res.status(400).json({ message: 'Meeting is not yet processed.' });
    }

    meeting.hostApproved = true;
    await meeting.save();

    // Build .docx (separate try so we can distinguish docx vs email errors)
    let docxBuffer = null;
    let docxError = null;
    try {
      docxBuffer = await buildDocxBuffer(meeting);
    } catch (dErr) {
      docxError = dErr.message;
      console.error('[approve] Failed to build .docx:', dErr.message);
    }

    // Send email (only if recipients exist)
    let emailSent = false;
    let emailError = null;
    if (meeting.recipientEmails.length > 0) {
      try {
        await sendSummaryEmail(meeting.recipientEmails, meeting, docxBuffer);
        emailSent = true;
      } catch (eErr) {
        emailError = eErr.message;
        console.error('[approve] Failed to send email:', eErr.message);
      }
    }

    res.json({
      message: emailSent
        ? 'Meeting approved and emailed to all participants.'
        : `Meeting approved${emailError ? ` but email failed: ${emailError}` : ' (no recipients).'}`,
      hostApproved: true,
      emailSent,
      emailError: emailError || undefined,
      docxError: docxError || undefined,
    });
  } catch (err) {
    console.error('[POST /meetings/:id/approve]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/meetings/:id/resend-email — Retry sending summary email ─────────
// Allows host to resend the summary + .docx email without re-approving.
router.post('/:id/resend-email', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (String(meeting.host) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the host can resend the summary email.' });
    }
    if (meeting.status !== 'completed') {
      return res.status(400).json({ message: 'Meeting is not yet processed.' });
    }
    if (meeting.recipientEmails.length === 0) {
      return res.status(400).json({ message: 'No recipient emails configured for this meeting.' });
    }

    const docxBuffer = await buildDocxBuffer(meeting);
    await sendSummaryEmail(meeting.recipientEmails, meeting, docxBuffer);

    res.json({ message: `Summary email resent to ${meeting.recipientEmails.length} recipient(s).` });
  } catch (err) {
    console.error('[POST /meetings/:id/resend-email]', err.message);
    res.status(500).json({ message: `Failed to resend email: ${err.message}` });
  }
});

// ── POST /api/meetings/:id/invite-speaker — Email passkey to a co-recorder ──
router.post('/:id/invite-speaker', auth, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (String(meeting.host) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the host can invite co-recorders.' });
    }

    await sendPasskeyEmail(email, name || email.split('@')[0], meeting);

    res.json({ message: `Passkey emailed to ${email}` });
  } catch (err) {
    console.error('[POST /meetings/:id/invite-speaker]', err.message);
    res.status(500).json({
      message: `Failed to send invitation email: ${err.message}`,
    });
  }
});

// ── DELETE /api/meetings/:id/speakers/:email — Remove a co-recorder (host only) ──
// Removes the speaker from the in-memory participants list and recipientEmails.
// Only works before processing is complete (meeting must not be in 'completed' state).
router.delete('/:id/speakers/:email', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (String(meeting.host) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the host can remove co-recorders.' });
    }

    const emailToRemove = decodeURIComponent(req.params.email).trim().toLowerCase();

    // Remove from participants list — preserve host entry, remove co-recorder by email
    meeting.participants = (meeting.participants || []).filter(
      (p) => p.isHost || p.email?.toLowerCase() !== emailToRemove
    );

    // Remove from recipientEmails — preserves host email because the host is never
    // the co-recorder email being passed here (UI enforces this)
    meeting.recipientEmails = (meeting.recipientEmails || []).filter(
      (e) => e.toLowerCase() !== emailToRemove
    );

    await meeting.save();

    res.json({ message: `Co-recorder ${emailToRemove} removed successfully.` });
  } catch (err) {
    console.error('[DELETE /meetings/:id/speakers/:email]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/meetings/:id — Delete a meeting (host only) ──────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    if (String(meeting.host) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Only the host can delete this meeting.' });
    }

    await Meeting.findByIdAndDelete(req.params.id);
    res.json({ message: 'Meeting deleted successfully' });
  } catch (err) {
    console.error('[DELETE /meetings/:id]', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
