const fs = require('fs');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Transcribe an audio file using Groq Whisper Large v3.
 * @param {string} filePath - Absolute path to the audio file.
 * @returns {Promise<string>} - Plain text transcript.
 */
async function transcribeAudio(filePath) {
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-large-v3',
    response_format: 'text',
    language: 'en',
  });
  // Groq returns the text directly when response_format is 'text'
  return typeof transcription === 'string' ? transcription : transcription.text || '';
}

/**
 * Generate a structured meeting summary from a transcript using LLaMA 3.3 70B.
 * @param {string} transcript - Raw transcript text.
 * @param {string} [agenda=''] - Meeting agenda for extra context.
 * @returns {Promise<{keyPoints: string[], decisions: string[], actionItems: {task,assignee,status}[]}>}
 */
async function generateSummary(transcript, agenda = '') {
  const systemPrompt = `You are an expert meeting assistant. 
Given a meeting transcript${agenda ? ' and agenda' : ''}, extract:
1. Key Points — The main topics discussed (3-7 bullet points).
2. Decisions Made — Concrete decisions agreed upon (may be empty).
3. Action Items — Tasks assigned, with assignee name (use "Unassigned" if unknown) and status (always "pending" for new items).

Respond ONLY with valid JSON in exactly this format (no markdown, no explanation):
{
  "keyPoints": ["...", "..."],
  "decisions": ["...", "..."],
  "actionItems": [
    { "task": "...", "assignee": "...", "status": "pending" }
  ]
}`;

  const userContent = agenda
    ? `Agenda:\n${agenda}\n\nTranscript:\n${transcript}`
    : `Transcript:\n${transcript}`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  const raw = completion.choices[0]?.message?.content || '{}';

  // Strip any accidental markdown fences before parsing
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    keyPoints:   Array.isArray(parsed.keyPoints)   ? parsed.keyPoints   : [],
    decisions:   Array.isArray(parsed.decisions)   ? parsed.decisions   : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
  };
}

module.exports = { transcribeAudio, generateSummary };
