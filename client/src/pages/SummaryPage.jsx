import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Target, Lightbulb,
  Loader, AlertCircle, FileDown, RefreshCw,
  Calendar, Clock, Timer, User2, Users2,
  MessageSquare, ShieldCheck, Download, Radio, ChevronDown
} from 'lucide-react';
import api from '../services/api';

export default function SummaryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [approved, setApproved] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const loggedInUser = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchMeeting = useCallback(async () => {
    try {
      const { data } = await api.get(`/meetings/${id}`);
      setMeeting(data);
      setApproved(data.hostApproved || false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load meeting summary.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchMeeting(); }, [fetchMeeting]);

  const handleApprove = async () => {
    setApproving(true);
    setApproveError('');
    try {
      await api.post(`/meetings/${id}/approve`, {});
      setApproved(true);
      await fetchMeeting();
    } catch (err) {
      setApproveError(err.response?.data?.message || 'Approval failed. Please try again.');
    } finally {
      setApproving(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await api.get(`/meetings/${id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      const safeTitle = (meeting?.title || 'meeting').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.href = url;
      link.setAttribute('download', `${safeTitle}_minutes.docx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <div className="relative w-14 h-14 mb-6">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500/30 animate-ping" />
          <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 border-indigo-500/10 animate-spin" />
        </div>
        <p className="text-slate-400 text-lg">Loading summary…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !meeting) {
    return (
      <div className="flex-1 bg-[#0d1117] flex flex-col items-center justify-center p-8 text-center min-h-screen">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-white text-lg font-semibold">Could not load summary</p>
        <p className="text-slate-400 mt-2">{error}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-6 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-sm font-semibold transition-all"
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const { title, agenda, summary, participants, createdAt, startedAt, updatedAt } = meeting;

  const formattedDate = startedAt
    ? new Date(startedAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : createdAt
    ? new Date(createdAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A';
  const startTime = startedAt
    ? new Date(startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : createdAt
    ? new Date(createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'N/A';
  // Duration = time from when recording started to when it was completed (updatedAt)
  const durationMin = (startedAt && updatedAt)
    ? Math.max(1, Math.round((new Date(updatedAt) - new Date(startedAt)) / 60000))
    : null;

  const hostParticipant = (participants || []).find((p) => p.isHost) || null;
  const hostName = hostParticipant?.name || loggedInUser?.name || loggedInUser?.email?.split('@')[0] || 'Host';
  const allPeople = participants && participants.length > 0
    ? participants
    : [{ name: hostName, email: loggedInUser?.email || '', isHost: true }];

  return (
    <div className="flex-1 bg-[#0d1117] text-white min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Top nav ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="p-2 bg-white/5 rounded-full border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-white">{title}</h1>
              {agenda && <p className="text-sm text-slate-400 mt-0.5">{agenda}</p>}
            </div>
          </div>
          <button
            onClick={fetchMeeting}
            className="flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-slate-400 hover:text-white rounded-full text-sm font-medium transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* ── Meeting metadata card ──────────────────────────────────────── */}
        <div className="bg-[#1e293b] rounded-3xl border border-white/10 p-6 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">{title} — Minutes</h2>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <MetaCard icon={<Calendar className="w-4 h-4" />} label="DATE" value={formattedDate} />
            {durationMin && (
              <MetaCard icon={<Timer className="w-4 h-4" />} label="DURATION" value={`${durationMin} min`} />
            )}
            <MetaCard icon={<Clock className="w-4 h-4" />} label="START" value={startTime} />
            <MetaCard icon={<User2 className="w-4 h-4" />} label="HOST" value={hostName} />
          </div>

          {/* Participants */}
          <div>
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              <Users2 className="w-4 h-4" />
              Participants
            </div>
            <div className="flex flex-wrap gap-2">
              {allPeople.map((p, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                    p.isHost
                      ? 'bg-indigo-600/20 border border-indigo-500/40 text-indigo-300'
                      : 'bg-blue-600/20 border border-blue-500/40 text-blue-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current" />
                  {p.name}
                  <span className="text-xs opacity-60">({p.isHost ? 'Host' : 'Co-Recorder'})</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Remote session badge ────────────────────────────────────────── */}
        {meeting.remoteMode && (
          <div className="flex items-center gap-2 px-4 py-3 bg-violet-500/10 border border-violet-500/30 rounded-2xl mb-4 text-sm text-violet-300">
            <Radio className="w-4 h-4 shrink-0" />
            <span><strong>Remote Session</strong> — {meeting.submittedChunks?.length || 0} participant recording{(meeting.submittedChunks?.length || 0) !== 1 ? 's' : ''} merged into this summary.</span>
          </div>
        )}

        {/* ── Editable banner ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-6 text-sm text-amber-300">
          <span>✏️</span>
          <span><strong>Editable draft</strong> — review the summary below before approving.</span>
        </div>

        {/* ── Summary sections ───────────────────────────────────────────── */}
        <div className="space-y-5">
          <SectionCard
            title="Discussion Points"
            icon={<MessageSquare className="w-5 h-5 text-yellow-400" />}
            color="yellow"
          >
            {summary?.keyPoints?.length > 0 ? (
              <ul className="space-y-2">
                {summary.keyPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-white/5 rounded-2xl px-4 py-3 border border-white/5">
                    <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-slate-300 text-sm leading-relaxed">{point}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 text-sm italic">No speech was recorded for this meeting</p>
            )}
          </SectionCard>

          <SectionCard
            title="Key Decisions"
            icon={<Target className="w-5 h-5 text-blue-400" />}
            color="blue"
          >
            {summary?.decisions?.length > 0 ? (
              <ul className="space-y-2">
                {summary.decisions.map((decision, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-white/5 rounded-2xl px-4 py-3 border border-white/5">
                    <span className="text-xs font-bold text-blue-400 bg-blue-400/10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-slate-300 text-sm leading-relaxed font-medium">{decision}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 text-sm italic">No decisions recorded</p>
            )}
          </SectionCard>

          <SectionCard
            title="Action Items"
            icon={<CheckCircle2 className="w-5 h-5 text-teal-400" />}
            color="teal"
          >
            {summary?.actionItems?.length > 0 ? (
              <ul className="space-y-2">
                {summary.actionItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-3 bg-white/5 rounded-2xl px-4 py-3 border border-white/5">
                    <span className="text-xs font-bold text-teal-400 bg-teal-400/10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-slate-300 text-sm leading-relaxed flex-1">
                      {item.task}
                      {item.assignee && <span className="ml-2 text-slate-500">— {item.assignee}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 text-sm italic">No action items recorded</p>
            )}
          </SectionCard>
        </div>

        {/* ── Per-speaker transcripts (remote mode) ──────────────────────── */}
        {meeting.remoteMode && meeting.submittedChunks?.length > 0 && (
          <div className="mt-5">
            <SectionCard
              title="Per-Speaker Transcripts"
              icon={<Radio className="w-5 h-5 text-violet-400" />}
              color="violet"
            >
              <div className="space-y-2">
                {meeting.submittedChunks.map((chunk, i) => (
                  <TranscriptAccordion key={i} chunk={chunk} />
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── Approval section ───────────────────────────────────────────── */}
        <div className="mt-6 bg-[#1e293b] rounded-3xl border border-white/10 p-6">
          <div className="flex items-start gap-3 mb-5">
            <ShieldCheck className="w-6 h-6 text-green-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-bold text-white">Approval</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                Host approves and the .docx minutes are emailed to all participants automatically.
              </p>
            </div>
          </div>

          <div className="space-y-3 mb-5">
            {allPeople.map((p, i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-sm font-bold text-white">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    {p.email && <p className="text-xs text-slate-400">{p.email}</p>}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  approved
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : p.isHost
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
                }`}>
                  {approved ? (p.isHost ? '✓ Approved' : '✓ Notified') : (p.isHost ? 'Pending' : 'Awaiting host')}
                </span>
              </div>
            ))}
          </div>

          {approveError && (
            <div className="mb-4 bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-3 rounded-2xl text-sm">
              {approveError}
            </div>
          )}

          {approved && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-500/10 border border-green-500/30 text-green-300 rounded-2xl text-sm font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              Minutes approved and emailed to all participants!
            </div>
          )}
        </div>

        {/* ── Bottom action bar ──────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 mt-6">
          <button
            onClick={() => navigate('/meeting/create')}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full font-bold text-sm transition-all"
          >
            ← New Meeting
          </button>

          {/* Approve — emails .docx to all participants */}
          <button
            id="approve-btn"
            onClick={handleApprove}
            disabled={approving || approved}
            className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-full font-bold text-sm transition-all ${
              approved
                ? 'bg-green-600/50 text-green-200 cursor-not-allowed border border-green-500/30'
                : 'bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50'
            }`}
          >
            {approving ? (
              <><Loader className="w-4 h-4 animate-spin" /> Approving…</>
            ) : approved ? (
              <><CheckCircle2 className="w-4 h-4" /> Approved & Sent</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Approve & Send</>
            )}
          </button>

          {/* Download — just downloads the .docx, no email */}
          <button
            id="download-btn"
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full font-bold text-sm transition-all disabled:opacity-50"
          >
            {downloading ? (
              <><Loader className="w-4 h-4 animate-spin" /> Downloading…</>
            ) : (
              <><Download className="w-4 h-4" /> Download .docx</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MetaCard({ icon, label, value }) {
  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 px-4 py-3">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">
        {icon} {label}
      </div>
      <p className="text-white font-semibold text-sm">{value}</p>
    </div>
  );
}

function SectionCard({ title, icon, color, children }) {
  const colorMap = {
    yellow: 'border-yellow-500/20',
    blue:   'border-blue-500/20',
    teal:   'border-teal-500/20',
    violet: 'border-violet-500/20',
  };
  return (
    <div className={`bg-[#1e293b] rounded-3xl border ${colorMap[color] || 'border-white/10'} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function TranscriptAccordion({ chunk }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {chunk.participantName?.charAt(0).toUpperCase()}
          </span>
          <span>{chunk.participantName}</span>
          {chunk.isHost && <span className="text-xs text-indigo-400 font-normal">(Host)</span>}
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">
            {chunk.transcript || '(No transcript available)'}
          </p>
        </div>
      )}
    </div>
  );
}
