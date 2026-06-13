import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic, MicOff, X, UserPlus, Users, FileText, Square,
  ArrowLeft, Mail, Loader, Radio, Upload, Trash2,
  Copy, Eye, EyeOff, Check, KeyRound, MessageSquare,
  CheckCircle2, Clock, WifiOff,
} from 'lucide-react';
import api from '../services/api';

const POLL_INTERVAL_MS = 3000;

// ── Web Speech API helpers ─────────────────────────────────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

export default function RecordingPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Meeting info — loaded from API (reliable) + localStorage (instant fallback) ──
  const currentInfo = JSON.parse(localStorage.getItem('currentMeetingInfo') || '{}');

  const [meetingTitle,  setMeetingTitle]  = useState(currentInfo.title   || `Meeting ${id}`);
  const [meetingAgenda, setMeetingAgenda] = useState(currentInfo.agenda  || '');
  const [passkey,       setPasskey]       = useState(currentInfo.passkey || '');
  const [remoteMode,    setRemoteMode]    = useState(currentInfo.remoteMode === true);
  const [expectedParts, setExpectedParts] = useState(currentInfo.expectedParticipants || 0);

  // ── Role detection ─────────────────────────────────────────────────────────
  // isParticipant=true when user joined via passkey (set by JoinMeetingPage)
  const loggedInUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [isParticipant, setIsParticipant] = useState(
    currentInfo.isParticipant === true || currentInfo.isHost === false
  );

  const hostName  = loggedInUser.name  || loggedInUser.email?.split('@')[0] || 'Host';
  const hostEmail = loggedInUser.email || '';
  const myName    = isParticipant ? (loggedInUser.name  || loggedInUser.email?.split('@')[0] || 'Participant') : hostName;
  const myEmail   = isParticipant ? (loggedInUser.email || '') : hostEmail;

  // ── Speakers / participants (host only — local multi-speaker mode) ───────────
  const initialSpeaker = { name: hostName, email: hostEmail, isHost: true };
  const [speakers, setSpeakers] = useState([initialSpeaker]);
  const [activeSpeakerIndex, setActiveSpeakerIndex] = useState(0);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [micOn, setMicOn] = useState(true);
  const [activeTab, setActiveTab] = useState('people');
  const [notes, setNotes] = useState('');
  const [showAddSpeaker, setShowAddSpeaker] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('Uploading…');
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [chunkStatus, setChunkStatus] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [passkeyVisible, setPasskeyVisible] = useState(false);
  const [passkeyCopied, setPasskeyCopied] = useState(false);

  // ── Live transcript state ──────────────────────────────────────────────────
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [speechSupported] = useState(!!SpeechRecognition);
  const [speechActive, setSpeechActive] = useState(false);
  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // ── Audio refs ──────────────────────────────────────────────────────────────
  const audioChunksRef     = useRef([]);
  const completedChunksRef = useRef([]);
  const mediaRecorderRef   = useRef(null);
  const streamRef          = useRef(null);
  const timerRef           = useRef(null);
  const pollRef            = useRef(null);
  const chunkPollRef       = useRef(null);
  const startedAtRef       = useRef(null);

  // ── Format timer ────────────────────────────────────────────────────────────
  const formatTime = (s) => {
    const m  = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  // ── Auto-scroll transcript ──────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptLines]);

  // ── Speech Recognition ──────────────────────────────────────────────────────
  const startSpeechRecognition = useCallback((speakerName) => {
    if (!SpeechRecognition) return;

    // Stop any existing instance first
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    let interimLineId = null;

    recognition.onstart = () => setSpeechActive(true);
    recognition.onend   = () => {
      setSpeechActive(false);
      // Auto-restart if mic is still on (recognition ends after silence/timeout)
      if (micOn && mediaRecorderRef.current?.state === 'recording') {
        setTimeout(() => {
          try { recognition.start(); } catch (_) {}
        }, 300);
      }
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      setTranscriptLines((prev) => {
        const updated = [...prev];

        // Replace or append interim
        if (interim) {
          if (interimLineId !== null) {
            const idx = updated.findIndex((l) => l.id === interimLineId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], text: interim, interim: true };
              return updated;
            }
          }
          interimLineId = Date.now();
          updated.push({ id: interimLineId, speaker: speakerName, text: interim, interim: true });
          return updated;
        }

        // Finalise interim line if exists, else push new
        if (finalText.trim()) {
          if (interimLineId !== null) {
            const idx = updated.findIndex((l) => l.id === interimLineId);
            if (idx !== -1) {
              updated[idx] = { ...updated[idx], text: finalText.trim(), interim: false };
              interimLineId = null;
              return updated;
            }
          }
          updated.push({ id: Date.now(), speaker: speakerName, text: finalText.trim(), interim: false });
          interimLineId = null;
        }

        return updated;
      });
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[speech]', e.error);
      }
    };

    try { recognition.start(); } catch (_) {}
  }, [micOn]);

  const stopSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setSpeechActive(false);
  }, []);

  // ── Start recording (auto on mount) ────────────────────────────────────────
  const startRecordingChunk = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.start();

      // Start live transcript
      const activeName = isParticipant ? myName : (speakers[activeSpeakerIndex]?.name || 'Speaker');
      startSpeechRecognition(activeName);
    } catch (err) {
      setError('Microphone access denied. Please allow microphone and refresh.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSpeakerIndex, speakers, isParticipant, myName, startSpeechRecognition]);

  // ── Stop current chunk, save it ────────────────────────────────────────────
  const stopCurrentChunk = () =>
    new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve();
        return;
      }
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        completedChunksRef.current.push({ speakerIndex: activeSpeakerIndex, blob });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        resolve();
      };
      mediaRecorderRef.current.stop();
    });

  // ── Switch active speaker (host only) ──────────────────────────────────────
  const switchSpeaker = async (idx) => {
    if (idx === activeSpeakerIndex) return;
    await stopCurrentChunk();
    setActiveSpeakerIndex(idx);
    if (micOn) await startRecordingChunk();
  };

  // ── Mic toggle ───────────────────────────────────────────────────────────
  const toggleMic = async () => {
    if (micOn) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
          streamRef.current?.getTracks().forEach((t) => t.stop());
        };
        mediaRecorderRef.current.stop();
      }
      stopSpeechRecognition();
      setMicOn(false);
    } else {
      await startRecordingChunk();
      setMicOn(true);
    }
  };

  // ── Add Co-Recorder (host only) ─────────────────────────────────────────
  const handleAddSpeaker = async () => {
    if (!newName.trim()) return;
    setSpeakers((prev) => [...prev, { name: newName.trim(), email: newEmail.trim(), isHost: false }]);

    if (newEmail.trim()) {
      setInviteLoading(true);
      setInviteError('');
      try {
        await api.post(`/meetings/${id}/invite-speaker`, {
          name:  newName.trim(),
          email: newEmail.trim(),
        });
        setInviteSuccess(true);
      } catch (err) {
        setInviteError(err.response?.data?.message || 'Failed to send invitation email.');
      } finally {
        setInviteLoading(false);
      }
    } else {
      closeAddSpeakerModal();
    }
  };

  const closeAddSpeakerModal = () => {
    setShowAddSpeaker(false);
    setNewName('');
    setNewEmail('');
    setInviteLoading(false);
    setInviteSuccess(false);
    setInviteError('');
  };

  // ── Remove Co-Recorder (host only) ──────────────────────────────────────
  const handleRemoveSpeaker = async (idx) => {
    const speaker = speakers[idx];
    if (!speaker || speaker.isHost) return;
    setSpeakers((prev) => prev.filter((_, i) => i !== idx));
    if (activeSpeakerIndex === idx) setActiveSpeakerIndex(0);
    else if (activeSpeakerIndex > idx) setActiveSpeakerIndex((p) => p - 1);
    if (speaker.email) {
      try { await api.delete(`/meetings/${id}/speakers/${encodeURIComponent(speaker.email)}`); }
      catch (err) { console.warn('[remove-speaker]', err.response?.data?.message || err.message); }
    }
  };

  // ── End meeting (host LOCAL mode) ────────────────────────────────────────
  const handleEndMeeting = async () => {
    if (isEnding) return;
    setIsEnding(true);
    stopSpeechRecognition();
    await stopCurrentChunk();
    clearInterval(timerRef.current);

    const chunks = completedChunksRef.current;
    if (chunks.length === 0) {
      setError('No audio was recorded. Please record at least one speaker.');
      setIsEnding(false);
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Uploading audio…');

    try {
      const formData = new FormData();
      const speakerNames = [];
      chunks.forEach(({ speakerIndex, blob }, i) => {
        formData.append(`audio_${i}`, blob, `chunk_${i}.webm`);
        speakerNames.push(speakers[speakerIndex]?.name || `Speaker ${speakerIndex + 1}`);
      });
      formData.append('speakerNames', JSON.stringify(speakerNames));
      formData.append('participants', JSON.stringify(
        speakers.map(({ name, email, isHost }) => ({ name, email, isHost: !!isHost }))
      ));
      formData.append('startedAt', startedAtRef.current?.toISOString() || new Date().toISOString());

      await api.post(`/meetings/${id}/process-multi`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setProcessingStatus('AI is transcribing and summarising…');
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get(`/meetings/${id}/status`);
          if (data.status === 'completed') {
            clearInterval(pollRef.current);
            navigate(`/meeting/summary/${id}`);
          } else if (data.status === 'failed') {
            clearInterval(pollRef.current);
            setIsProcessing(false);
            setIsEnding(false);
            setError('AI processing failed. Please try again.');
          }
        } catch (_) {}
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setIsProcessing(false);
      setIsEnding(false);
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    }
  };

  // ── Submit chunk (REMOTE mode — host OR participant) ─────────────────────
  const handleSubmitRemoteChunk = async () => {
    if (isEnding) return;
    setIsEnding(true);
    stopSpeechRecognition();
    await stopCurrentChunk();
    clearInterval(timerRef.current);

    const chunks = completedChunksRef.current;
    if (chunks.length === 0) {
      setError('No audio was recorded.');
      setIsEnding(false);
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Uploading your recording…');

    try {
      const allBlobs = chunks.map((c) => c.blob);
      const merged   = new Blob(allBlobs, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', merged, 'recording.webm');
      formData.append('participantName',  myName);
      formData.append('participantEmail', myEmail);
      formData.append('startedAt', startedAtRef.current?.toISOString() || new Date().toISOString());

      await api.post(`/meetings/${id}/submit-chunk`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSubmitted(true);
      setIsProcessing(false);
      setIsEnding(false);

      // Poll until all chunks are in and summary is ready
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get(`/meetings/${id}/chunk-status`);
          setChunkStatus(data);
          if (data.status === 'completed') {
            clearInterval(pollRef.current);
            navigate(`/meeting/summary/${id}`);
          }
        } catch (_) {}
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setIsProcessing(false);
      setIsEnding(false);
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    }
  };

  // ── Poll chunk-status for People panel (always, host AND participant) ──────
  useEffect(() => {
    chunkPollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/meetings/${id}/chunk-status`);
        setChunkStatus(data);
      } catch (_) {}
    }, POLL_INTERVAL_MS);
    return () => clearInterval(chunkPollRef.current);
  }, [id]);

  // ── Fetch meeting from API on mount ─────────────────────────────────────
  useEffect(() => {
    api.get(`/meetings/${id}`)
      .then(({ data }) => {
        if (data.passkey)   setPasskey(data.passkey);
        if (data.title)     setMeetingTitle(data.title);
        if (data.agenda)    setMeetingAgenda(data.agenda);
        setRemoteMode(!!data.remoteMode);
        setExpectedParts(data.expectedParticipants || 0);

        // Detect host by comparing meeting.host with logged-in user id
        if (data.host && loggedInUser._id) {
          const iAmHost = String(data.host) === String(loggedInUser._id);
          setIsParticipant(!iAmHost);
        }

        localStorage.setItem('currentMeetingInfo', JSON.stringify({
          title:                data.title,
          passkey:              data.passkey,
          agenda:               data.agenda,
          remoteMode:           data.remoteMode,
          expectedParticipants: data.expectedParticipants,
          isParticipant:        currentInfo.isParticipant,
          isHost:               currentInfo.isHost,
        }));
      })
      .catch((err) => console.warn('[RecordingPage] Could not fetch meeting:', err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Auto-start on mount ──────────────────────────────────────────────────
  useEffect(() => {
    startedAtRef.current = new Date();
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    startRecordingChunk();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
      clearInterval(chunkPollRef.current);
      stopSpeechRecognition();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Processing screen ────────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/30 animate-ping" />
          <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-indigo-500/10 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Processing Meeting</h2>
        <p className="text-slate-400 text-base max-w-sm">{processingStatus}</p>
        <p className="text-slate-600 text-sm mt-2">This may take up to a minute. Keep this tab open.</p>
      </div>
    );
  }

  // ── Submitted banner (waiting for others) ────────────────────────────────
  if (submitted) {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-6">
          <Upload className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Recording Submitted!</h2>
        <p className="text-slate-400 max-w-sm mb-6">
          {isParticipant
            ? 'Your audio has been uploaded. Waiting for all participants to submit before AI generates the summary.'
            : 'Waiting for all participants to submit their recordings before AI generates the summary.'}
        </p>
        {chunkStatus && (
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl px-8 py-5 mb-6">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">Session Progress</p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-4xl font-black text-violet-400 tabular-nums">{chunkStatus.chunksReceived}</span>
              <span className="text-slate-500 font-bold text-2xl">/</span>
              <span className="text-4xl font-black text-slate-400 tabular-nums">{chunkStatus.expectedParticipants}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (chunkStatus.chunksReceived / chunkStatus.expectedParticipants) * 100)}%` }}
              />
            </div>
            {chunkStatus.submitters?.length > 0 && (
              <div className="mt-3 space-y-1 text-left">
                {chunkStatus.submitters.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {s.name}{s.isHost ? ' (Host)' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-slate-500 text-sm animate-pulse">
          <Loader className="w-4 h-4 animate-spin" />
          Waiting for others…
        </div>
      </div>
    );
  }

  // ── Determine end-button mode ────────────────────────────────────────────
  // Participant always submits a chunk. Host in remoteMode also submits chunk.
  const showSubmitBtn = isParticipant || remoteMode;

  // ── Main recording UI ────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] text-white overflow-hidden" style={{ minHeight: '100vh' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#111827]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBackConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white rounded-full text-xs font-medium transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Leave
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{meetingTitle}</h1>
            {meetingAgenda && <p className="text-xs text-slate-400 truncate">{meetingAgenda}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Role badge */}
          {isParticipant ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 rounded-full text-xs font-bold">
              <Radio className="w-3 h-3" /> Participant · Remote
            </span>
          ) : remoteMode ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 rounded-full text-xs font-bold">
              <Radio className="w-3 h-3" /> Host · Remote
            </span>
          ) : null}

          {/* Timer */}
          <span className="bg-white/10 text-white font-mono font-bold text-sm px-3 py-1.5 rounded-full tabular-nums">
            {formatTime(timer)}
          </span>

          {/* End / Submit button */}
          {showSubmitBtn ? (
            <button
              id="end-meeting-btn"
              onClick={handleSubmitRemoteChunk}
              disabled={isEnding}
              className="recording-end-btn flex items-center gap-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-full transition-all disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Submit My Recording</span>
            </button>
          ) : (
            <button
              id="end-meeting-btn"
              onClick={handleEndMeeting}
              disabled={isEnding}
              className="recording-end-btn flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-full transition-all disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>End Meeting</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="recording-body flex flex-1 overflow-hidden">

        {/* ── LEFT: Speaker switcher + mic controls (host only in local mode) ── */}
        <div className="flex-1 flex flex-col p-5 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              Live Transcript
            </span>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${micOn ? 'text-green-400' : 'text-slate-500'}`}>
              <span className={`w-2 h-2 rounded-full ${micOn ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
              {micOn ? (speechActive ? 'Listening' : 'Recording') : 'Paused'}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 bg-red-900/40 border border-red-700/50 text-red-300 px-4 py-3 rounded-2xl text-sm flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Speaker pills — host local mode only */}
          {!isParticipant && !remoteMode && (
            <>
              <div className="mb-2">
                <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
                  Active Speaker — Click to Switch
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {speakers.map((sp, idx) => (
                  <div key={idx} className="relative group">
                    <button
                      id={`speaker-pill-${idx}`}
                      onClick={() => switchSpeaker(idx)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                        idx === activeSpeakerIndex
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-400/50'
                          : 'bg-white/8 text-slate-300 hover:bg-white/15 border border-white/10'
                      } ${!sp.isHost ? 'pr-8' : ''}`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                        {sp.name.charAt(0).toUpperCase()}
                      </span>
                      {sp.name}
                    </button>
                    {!sp.isHost && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveSpeaker(idx); }}
                        title="Remove co-recorder"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-600/80 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Live transcript box ── */}
          <div className="flex-1 bg-[#161b27] rounded-2xl border border-white/8 p-5 flex flex-col overflow-hidden">

            {!speechSupported ? (
              /* Browser doesn't support Web Speech API */
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <WifiOff className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-slate-500 font-medium">Live transcript not available</p>
                <p className="text-slate-600 text-sm mt-1">Use Chrome or Edge for real-time transcription</p>
              </div>
            ) : transcriptLines.length === 0 ? (
              /* Waiting for first words */
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Mic className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-slate-500 font-medium">Speak into your microphone…</p>
                <p className="text-slate-600 text-sm mt-1">
                  {speechActive ? 'Listening — words will appear here' : 'Transcript will appear when you speak'}
                </p>
              </div>
            ) : (
              /* Transcript lines */
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {transcriptLines.map((line) => (
                  <div
                    key={line.id}
                    className={`flex gap-3 transition-opacity ${line.interim ? 'opacity-50' : 'opacity-100'}`}
                  >
                    {/* Speaker avatar */}
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                      {line.speaker.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-indigo-400 font-semibold">{line.speaker}</span>
                      <p className={`text-sm mt-0.5 leading-relaxed ${line.interim ? 'text-slate-500 italic' : 'text-slate-200'}`}>
                        {line.text}
                        {line.interim && <span className="ml-1 animate-pulse">…</span>}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            )}

            {/* Live indicator */}
            {speechSupported && speechActive && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-slate-500">Transcribing live in en-IN</span>
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div className="flex items-center gap-3 mt-4">
            <button
              id="mic-toggle-btn"
              onClick={toggleMic}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                micOn
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-red-600/20 text-red-400 border border-red-600/40 hover:bg-red-600/30'
              }`}
            >
              {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              {micOn ? 'Mic On' : 'Mic Off'}
            </button>

            {/* Add Co-Recorder — host only */}
            {!isParticipant && (
              <button
                id="add-speaker-btn"
                onClick={() => setShowAddSpeaker(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/40 text-indigo-300 rounded-full text-sm font-semibold transition-all ml-auto"
              >
                <UserPlus className="w-4 h-4" />
                Add Co-Recorder
              </button>
            )}
          </div>
        </div>

        {/* ── RIGHT: People / Notes panel ──────────────────────────────── */}
        <div className="recording-right-panel w-72 border-l border-white/10 flex flex-col bg-[#111827]">
          {/* Tab bar */}
          <div className="flex border-b border-white/10">
            {[
              { key: 'people', label: 'People', icon: <Users className="w-4 h-4" /> },
              { key: 'notes',  label: 'Notes',  icon: <FileText className="w-4 h-4" /> },
            ].map(({ key, label, icon }) => (
              <button
                key={key}
                id={`tab-${key}`}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-all ${
                  activeTab === key
                    ? 'text-white border-b-2 border-indigo-500'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'people' && (
              <div className="space-y-2">

                {/* ── Passkey card — host only ── */}
                {!isParticipant && passkey && (
                  <div className="mb-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Meeting Passkey</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex-1 font-mono font-black text-xl tracking-[0.22em] text-white select-all">
                        {passkeyVisible ? passkey : '••••••'}
                      </span>
                      <button
                        onClick={() => setPasskeyVisible((v) => !v)}
                        title={passkeyVisible ? 'Hide passkey' : 'Reveal passkey'}
                        className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                      >
                        {passkeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(passkey);
                          setPasskeyCopied(true);
                          setTimeout(() => setPasskeyCopied(false), 2000);
                        }}
                        title="Copy passkey"
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          passkeyCopied
                            ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                            : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {passkeyCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Share this passkey with co-recorders. They open <span className="text-slate-400 font-medium">Join Meeting</span> and enter it.
                    </p>
                  </div>
                )}

                {/* ── Local speakers list (host, non-remote) ── */}
                {!isParticipant && !remoteMode && speakers.map((sp, idx) => (
                  <div
                    key={idx}
                    onClick={() => switchSpeaker(idx)}
                    className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${
                      idx === activeSpeakerIndex
                        ? 'bg-indigo-600/20 border border-indigo-600/30'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {sp.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{sp.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {sp.isHost ? 'Host' : 'Co-Recorder'}
                        {sp.email ? ' · ' + sp.email : ''}
                      </p>
                    </div>
                    {sp.isHost ? (
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${idx === activeSpeakerIndex ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveSpeaker(idx); }}
                        title="Remove co-recorder"
                        className="shrink-0 w-7 h-7 rounded-full bg-red-600/20 hover:bg-red-600/50 border border-red-600/30 hover:border-red-600/60 text-red-400 hover:text-red-300 flex items-center justify-center transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {/* ── Remote participants list (from chunk-status polling) ── */}
                {(remoteMode || isParticipant) && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2 px-1">
                      Participants
                      {chunkStatus && (
                        <span className="ml-2 text-violet-400">
                          {chunkStatus.chunksReceived}/{chunkStatus.expectedParticipants} submitted
                        </span>
                      )}
                    </p>

                    {chunkStatus?.submitters?.length > 0 ? (
                      chunkStatus.submitters.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white/5">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                            {s.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{s.name}</p>
                            <p className="text-xs text-slate-400">
                              {s.isHost ? 'Host' : 'Co-Recorder'}
                              {s.email ? ' · ' + s.email : ''}
                            </p>
                          </div>
                          {/* Submitted badge */}
                          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" title="Recording submitted" />
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2 p-3 text-slate-500 text-xs">
                        <Clock className="w-4 h-4" />
                        Waiting for participants to submit…
                      </div>
                    )}

                    {/* Progress bar */}
                    {chunkStatus && chunkStatus.expectedParticipants > 0 && (
                      <div className="mt-3 px-1">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, (chunkStatus.chunksReceived / chunkStatus.expectedParticipants) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Add co-recorder button — host only */}
                {!isParticipant && (
                  <button
                    onClick={() => setShowAddSpeaker(true)}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 border border-dashed border-white/20 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 rounded-2xl text-sm font-medium transition-all"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add Co-Recorder
                  </button>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <textarea
                id="notes-area"
                className="w-full h-full min-h-[200px] bg-transparent text-slate-300 text-sm placeholder-slate-600 outline-none resize-none"
                placeholder="Type meeting notes here…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── Add Co-Recorder Modal (host only) ─────────────────────────────── */}
      {showAddSpeaker && !isParticipant && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#1e293b] border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl">
            {!inviteSuccess ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Add Co-Recorder</h3>
                  <button
                    onClick={closeAddSpeakerModal}
                    className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm text-slate-400 mb-5">
                  Add someone who will record from their own device. We'll email them the passkey so they can join this meeting — their audio will be merged into the final summary.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Name</label>
                    <input
                      id="new-speaker-name"
                      type="text"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-white placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                      placeholder="Co-recorder's name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Email <span className="text-slate-500 normal-case font-normal">(passkey will be sent here)</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                      <input
                        id="new-speaker-email"
                        type="email"
                        className="w-full pl-10 pr-4 bg-white/5 border border-white/10 rounded-2xl py-2.5 text-white placeholder-slate-500 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                        placeholder="their@email.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {inviteError && (
                  <div className="mt-4 bg-red-900/30 border border-red-700/40 text-red-300 px-4 py-2.5 rounded-2xl text-sm">
                    {inviteError}
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    id="confirm-add-speaker"
                    onClick={handleAddSpeaker}
                    disabled={!newName.trim() || inviteLoading}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 disabled:opacity-40 text-white font-bold rounded-full text-sm transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                  >
                    {inviteLoading ? (
                      <><Loader className="w-4 h-4 animate-spin" /> Sending invite…</>
                    ) : (
                      newEmail.trim() ? 'Add & Send Passkey by Email' : 'Add Co-Recorder'
                    )}
                  </button>
                  <button
                    id="cancel-add-speaker"
                    onClick={closeAddSpeakerModal}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-full text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-7 h-7 text-green-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Passkey Sent!</h3>
                <p className="text-sm text-slate-400 mb-6">
                  The meeting passkey has been emailed to <strong className="text-white">{newEmail}</strong>. They can join from the "Join Meeting" page.
                </p>
                <button
                  onClick={closeAddSpeakerModal}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-blue-500 text-white font-bold rounded-full text-sm transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Back / Leave Confirmation ──────────────────────────────────────── */}
      {showBackConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#1e293b] border border-white/10 rounded-3xl p-7 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Leave Recording?</h3>
            <p className="text-sm text-slate-400 mb-6">
              Leaving now will stop the recording. Any audio already recorded will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBackConfirm(false)}
                className="flex-1 py-2.5 rounded-full font-semibold text-slate-300 bg-white/5 hover:bg-white/10 text-sm transition"
              >
                Stay
              </button>
              <button
                onClick={() => {
                  clearInterval(timerRef.current);
                  stopSpeechRecognition();
                  streamRef.current?.getTracks().forEach((t) => t.stop());
                  navigate('/dashboard');
                }}
                className="flex-1 py-2.5 rounded-full font-bold text-white bg-red-600 hover:bg-red-700 text-sm transition"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
