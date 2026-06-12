import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Square, ArrowLeft, CheckCircle2, Loader, AlertCircle, Upload, Radio } from 'lucide-react';
import api from '../services/api';

const POLL_INTERVAL_MS = 5000;

export default function ParticipantRecordPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Meeting info from localStorage ─────────────────────────────────────────
  const currentInfo = JSON.parse(localStorage.getItem('currentMeetingInfo') || '{}');
  const meetingTitle  = currentInfo.title   || `Meeting ${id}`;
  const meetingAgenda = currentInfo.agenda  || '';

  // ── Logged-in user ──────────────────────────────────────────────────────────
  const loggedInUser = JSON.parse(localStorage.getItem('user') || '{}');
  const myName  = loggedInUser.name  || loggedInUser.email?.split('@')[0] || 'Participant';
  const myEmail = loggedInUser.email || '';

  // ── UI state ────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('idle');
  // phases: idle | recording | stopped | uploading | submitted | error | processingPoll
  const [micOn, setMicOn]     = useState(false);
  const [timer, setTimer]     = useState(0);
  const [error, setError]     = useState('');
  const [blobReady, setBlobReady] = useState(null); // Blob after recording stops
  const [chunkStatus, setChunkStatus] = useState(null); // {chunksReceived, expectedParticipants, status}

  // ── Audio refs ──────────────────────────────────────────────────────────────
  const audioChunksRef    = useRef([]);
  const mediaRecorderRef  = useRef(null);
  const streamRef         = useRef(null);
  const timerRef          = useRef(null);
  const pollRef           = useRef(null);
  const startedAtRef      = useRef(null);

  const formatTime = (s) => {
    const m  = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${m}:${ss}`;
  };

  // ── Start recording ─────────────────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setBlobReady(blob);
        streamRef.current?.getTracks().forEach(t => t.stop());
        setPhase('stopped');
        clearInterval(timerRef.current);
      };

      mr.start();
      startedAtRef.current = new Date();
      setPhase('recording');
      setMicOn(true);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    } catch (err) {
      setError('Microphone access denied. Please allow microphone access and try again.');
    }
  }, []);

  // ── Stop recording ──────────────────────────────────────────────────────────
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setMicOn(false);
    }
  };

  // ── Upload chunk ─────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!blobReady) return;
    setPhase('uploading');
    setError('');

    try {
      const formData = new FormData();
      formData.append('audio', blobReady, 'recording.webm');
      formData.append('participantName', myName);
      formData.append('participantEmail', myEmail);
      formData.append('startedAt', startedAtRef.current?.toISOString() || new Date().toISOString());

      await api.post(`/meetings/${id}/submit-chunk`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPhase('submitted');

      // Start polling until summary is ready
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get(`/meetings/${id}/chunk-status`);
          setChunkStatus(data);
          if (data.status === 'completed') {
            clearInterval(pollRef.current);
            setPhase('processingPoll');
            setTimeout(() => navigate(`/meeting/summary/${id}`), 1500);
          }
        } catch (_) {}
      }, POLL_INTERVAL_MS);
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed. Please try again.';
      setError(msg);
      setPhase('stopped');
    }
  };

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearInterval(pollRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Submitted / waiting screen ──────────────────────────────────────────────
  if (phase === 'processingPoll') {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-violet-500/30 animate-ping" />
          <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 border-violet-500/10 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">All recordings received!</h2>
        <p className="text-slate-400">AI is merging and summarising… Redirecting to summary.</p>
      </div>
    );
  }

  if (phase === 'submitted') {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Recording Submitted!</h2>
        <p className="text-slate-400 max-w-sm mb-6">
          Your audio has been uploaded successfully. The AI summary will be generated once all participants submit their recordings.
        </p>

        {/* Live chunk counter */}
        {chunkStatus && (
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl px-6 py-4 mb-6 min-w-[220px]">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">Session Progress</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-black text-violet-400 tabular-nums">{chunkStatus.chunksReceived}</span>
              <span className="text-slate-500 font-bold text-xl">/</span>
              <span className="text-3xl font-black text-slate-400 tabular-nums">{chunkStatus.expectedParticipants}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">recordings received</p>

            {/* Progress bar */}
            <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (chunkStatus.chunksReceived / chunkStatus.expectedParticipants) * 100)}%` }}
              />
            </div>

            {/* Who submitted */}
            {chunkStatus.submitters?.length > 0 && (
              <div className="mt-3 space-y-1">
                {chunkStatus.submitters.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    {s.name} {s.isHost && <span className="text-indigo-400">(Host)</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-slate-500 text-sm animate-pulse">
          <Loader className="w-4 h-4 animate-spin" />
          Waiting for other participants…
        </div>
      </div>
    );
  }

  // ── Main recording UI ───────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-[#0d1117] text-white min-h-screen">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#111827]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
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
          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 rounded-full text-xs font-bold">
            <Radio className="w-3 h-3" /> Remote Session
          </span>

          {/* Timer (only when recording) */}
          {phase === 'recording' && (
            <span className="bg-red-600/20 border border-red-500/40 text-red-300 font-mono font-bold text-sm px-3 py-1.5 rounded-full tabular-nums animate-pulse">
              ● {formatTime(timer)}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6">

          {/* Participant info card */}
          <div className="bg-[#1e293b] border border-white/10 rounded-3xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-2xl font-black text-white mx-auto mb-3">
              {myName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white font-bold text-lg">{myName}</p>
            {myEmail && <p className="text-slate-400 text-sm">{myEmail}</p>}
            <span className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-600/20 border border-blue-500/30 text-blue-300">
              Participant
            </span>
          </div>

          {/* Instructions */}
          <div className="bg-[#161b27] border border-white/8 rounded-2xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold mb-2">How it works</p>
            <ol className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2"><span className="text-violet-400 font-bold shrink-0">1.</span> Click <strong className="text-white">Start Recording</strong> and speak normally.</li>
              <li className="flex items-start gap-2"><span className="text-violet-400 font-bold shrink-0">2.</span> When done, click <strong className="text-white">Stop Recording</strong>.</li>
              <li className="flex items-start gap-2"><span className="text-violet-400 font-bold shrink-0">3.</span> Click <strong className="text-white">Submit Recording</strong> to upload your audio.</li>
              <li className="flex items-start gap-2"><span className="text-violet-400 font-bold shrink-0">4.</span> Wait for all participants to submit — AI will merge everything automatically.</li>
            </ol>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-900/40 border border-red-700/50 text-red-300 px-4 py-3 rounded-2xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            {phase === 'idle' && (
              <button
                id="start-recording-btn"
                onClick={handleStartRecording}
                className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-700 hover:to-rose-600 text-white font-bold rounded-full text-base shadow-lg shadow-red-500/25 transition-all"
              >
                <Mic className="w-5 h-5" />
                Start Recording
              </button>
            )}

            {phase === 'recording' && (
              <button
                id="stop-recording-btn"
                onClick={handleStopRecording}
                className="w-full flex items-center justify-center gap-3 py-4 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-full text-base transition-all ring-2 ring-red-500/40 animate-pulse"
              >
                <Square className="w-5 h-5 fill-white" />
                Stop Recording
              </button>
            )}

            {phase === 'stopped' && (
              <>
                <div className="flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/30 text-green-300 rounded-2xl text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  Recording ready — {formatTime(timer)} captured
                </div>

                <button
                  id="submit-recording-btn"
                  onClick={handleUpload}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-700 hover:to-indigo-600 text-white font-bold rounded-full text-base shadow-lg shadow-violet-500/25 transition-all"
                >
                  <Upload className="w-5 h-5" />
                  Submit Recording
                </button>

                <button
                  onClick={() => { setPhase('idle'); setTimer(0); setBlobReady(null); }}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-400 font-semibold rounded-full text-sm transition-all"
                >
                  Re-record
                </button>
              </>
            )}

            {phase === 'uploading' && (
              <button disabled className="w-full flex items-center justify-center gap-3 py-4 bg-violet-600/50 text-white font-bold rounded-full text-base cursor-not-allowed">
                <Loader className="w-5 h-5 animate-spin" />
                Uploading…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
