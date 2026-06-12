import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, X, UserPlus, Users, FileText, Square, ArrowLeft, Mail, Loader, Radio, Upload } from 'lucide-react';
import api from '../services/api';

const POLL_INTERVAL_MS = 3000;

export default function RecordingPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Meeting info ────────────────────────────────────────────────────────────
  const currentInfo = JSON.parse(localStorage.getItem('currentMeetingInfo') || '{}');
  const meetingTitle  = currentInfo.title  || `Meeting ${id}`;
  const meetingAgenda = currentInfo.agenda || '';
  const passkey       = currentInfo.passkey || ''; // kept private — not displayed in UI
  const remoteMode    = currentInfo.remoteMode === true;
  const expectedParts = currentInfo.expectedParticipants || 0;

  // ── Speakers / participants ─────────────────────────────────────────────────
  const hostUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hostName = hostUser.name || hostUser.email?.split('@')[0] || 'Host';
  const hostEmail = hostUser.email || '';

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
  const [chunkStatus, setChunkStatus] = useState(null); // remote mode progress
  const [submitted, setSubmitted] = useState(false);    // remote: chunk uploaded

  // ── Audio refs ──────────────────────────────────────────────────────────────
  const audioChunksRef = useRef([]);
  const completedChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const startedAtRef = useRef(null);

  // ── Format timer ────────────────────────────────────────────────────────────
  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

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
    } catch (err) {
      setError('Microphone access denied. Please allow microphone and refresh.');
    }
  }, []);

  // ── Stop current chunk, save it ────────────────────────────────────────────
  const stopCurrentChunk = () => {
    return new Promise((resolve) => {
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
  };

  // ── Switch active speaker ────────────────────────────────────────────────
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
      setMicOn(false);
    } else {
      await startRecordingChunk();
      setMicOn(true);
    }
  };

  // ── Add Co-Recorder (invite) ─────────────────────────────────────────────
  const handleAddSpeaker = async () => {
    if (!newName.trim()) return;

    // Add to local speakers list immediately
    setSpeakers(prev => [...prev, { name: newName.trim(), email: newEmail.trim(), isHost: false }]);

    // If email provided, send passkey via email
    if (newEmail.trim()) {
      setInviteLoading(true);
      setInviteError('');
      try {
        await api.post(`/meetings/${id}/invite-speaker`, {
          name: newName.trim(),
          email: newEmail.trim(),
        });
        setInviteSuccess(true);
      } catch (err) {
        setInviteError(err.response?.data?.message || 'Failed to send invitation email.');
      } finally {
        setInviteLoading(false);
      }
    } else {
      // No email — close immediately
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

  // ── End meeting (LOCAL mode) ─────────────────────────────────────────────
  const handleEndMeeting = async () => {
    if (isEnding) return;
    setIsEnding(true);

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

  // ── Submit host chunk (REMOTE mode) ─────────────────────────────────────
  const handleSubmitRemoteChunk = async () => {
    if (isEnding) return;
    setIsEnding(true);
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
      // Merge all local chunks into one blob
      const allBlobs = chunks.map(c => c.blob);
      const merged   = new Blob(allBlobs, { type: 'audio/webm' });

      const formData = new FormData();
      formData.append('audio', merged, 'host_recording.webm');
      formData.append('participantName', hostName);
      formData.append('participantEmail', hostEmail);
      formData.append('startedAt', startedAtRef.current?.toISOString() || new Date().toISOString());

      await api.post(`/meetings/${id}/submit-chunk`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSubmitted(true);
      setIsProcessing(false);
      setIsEnding(false);

      // Poll until all chunks received and summary ready
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

  // ── Auto-start on mount ──────────────────────────────────────────────────
  useEffect(() => {
    startedAtRef.current = new Date();
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    startRecordingChunk();
    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
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

  // ── Submitted banner (remote host waiting for others) ────────────────────
  if (submitted) {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-6">
          <Upload className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Your Recording Submitted!</h2>
        <p className="text-slate-400 max-w-sm mb-6">Waiting for all participants to submit their recordings before AI generates the summary.</p>
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
                style={{ width: `${Math.min(100,(chunkStatus.chunksReceived/chunkStatus.expectedParticipants)*100)}%` }}
              />
            </div>
            {chunkStatus.submitters?.length > 0 && (
              <div className="mt-3 space-y-1 text-left">
                {chunkStatus.submitters.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {s.name}{s.isHost ? ' (You — Host)' : ''}
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

  // ── Main recording UI ────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] text-white overflow-hidden" style={{ minHeight: '100vh' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#111827]">
        <div className="flex items-center gap-3">
          {/* Back / leave button */}
          <button
            onClick={() => setShowBackConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white rounded-full text-xs font-medium transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Leave
          </button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{meetingTitle}</h1>
            {meetingAgenda && (
              <p className="text-xs text-slate-400 truncate">{meetingAgenda}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Remote mode badge */}
          {remoteMode && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 rounded-full text-xs font-bold">
              <Radio className="w-3 h-3" /> Host · Remote
            </span>
          )}

          {/* Timer */}
          <span className="bg-white/10 text-white font-mono font-bold text-sm px-3 py-1.5 rounded-full tabular-nums">
            {formatTime(timer)}
          </span>

          {/* End / Submit button */}
          {remoteMode ? (
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

      {/* ── Body: left transcript + right panel ──────────────────────────── */}
      <div className="recording-body flex flex-1 overflow-hidden">

        {/* ── LEFT: Live Transcript Area ───────────────────────────────── */}
        <div className="flex-1 flex flex-col p-5 overflow-hidden">

          {/* Transcript header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">Live Transcript</span>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${micOn ? 'text-green-400' : 'text-slate-500'}`}>
              <span className={`w-2 h-2 rounded-full ${micOn ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
              {micOn ? 'Recording' : 'Paused'}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 bg-red-900/40 border border-red-700/50 text-red-300 px-4 py-3 rounded-2xl text-sm flex items-start gap-2">
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Active speaker label */}
          <div className="mb-2">
            <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">
              Active Speaker — Click to Switch
            </span>
          </div>

          {/* Speaker switcher pills */}
          <div className="flex flex-wrap gap-2 mb-3">
            {speakers.map((sp, idx) => (
              <button
                key={idx}
                id={`speaker-pill-${idx}`}
                onClick={() => switchSpeaker(idx)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  idx === activeSpeakerIndex
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 ring-2 ring-indigo-400/50'
                    : 'bg-white/8 text-slate-300 hover:bg-white/15 border border-white/10'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                  {sp.name.charAt(0).toUpperCase()}
                </span>
                {sp.name}
              </button>
            ))}
          </div>

          {/* Transcript box */}
          <div className="flex-1 bg-[#161b27] rounded-2xl border border-white/8 p-5 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <Mic className="w-10 h-10 text-slate-600 mb-3" />
              <p className="text-slate-500 font-medium">Speak into your microphone…</p>
              <p className="text-slate-600 text-sm mt-1">Allow mic access when prompted</p>
            </div>
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

            <button
              id="add-speaker-btn"
              onClick={() => setShowAddSpeaker(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-600/40 text-indigo-300 rounded-full text-sm font-semibold transition-all ml-auto"
            >
              <UserPlus className="w-4 h-4" />
              Add Co-Recorder
            </button>
          </div>
        </div>

        {/* ── RIGHT: People / Notes panel ──────────────────────────────── */}
        <div className="recording-right-panel w-72 border-l border-white/10 flex flex-col bg-[#111827]">
          {/* Tab bar */}
          <div className="flex border-b border-white/10">
            {[
              { key: 'people', label: 'People', icon: <Users className="w-4 h-4" /> },
              { key: 'notes', label: 'Notes', icon: <FileText className="w-4 h-4" /> },
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
                {speakers.map((sp, idx) => (
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
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${idx === activeSpeakerIndex ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
                  </div>
                ))}

                <button
                  onClick={() => setShowAddSpeaker(true)}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 border border-dashed border-white/20 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 rounded-2xl text-sm font-medium transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Co-Recorder
                </button>
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

      {/* ── Add Co-Recorder Modal ─────────────────────────────────────────────── */}
      {showAddSpeaker && (
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
              /* Success state */
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

      {/* ── Back / Leave Confirmation ─────────────────────────────────────────── */}
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
