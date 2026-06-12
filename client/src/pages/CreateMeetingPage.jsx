import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft, Radio, Users } from 'lucide-react';
import api from '../services/api';

export default function CreateMeetingPage() {
  const [title, setTitle]                       = useState('');
  const [agenda, setAgenda]                     = useState('');
  const [error, setError]                       = useState('');
  const [loading, setLoading]                   = useState(false);
  const [remoteMode, setRemoteMode]             = useState(false);
  const [expectedParticipants, setExpected]     = useState(2);
  const navigate = useNavigate();

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/meetings', {
        title,
        agenda,
        remoteMode,
        expectedParticipants: remoteMode ? expectedParticipants : 0,
      });

      localStorage.setItem('currentMeetingInfo', JSON.stringify({
        title:      data.title,
        passkey:    data.passkey,
        agenda:     data.agenda,
        remoteMode: data.remoteMode,
        expectedParticipants: data.expectedParticipants,
      }));

      // For remote mode → go straight to the remote host recording page
      // For local mode  → go to the regular recording room
      navigate(`/meeting/record/${data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create meeting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-[#0d1117] py-10 px-4 sm:px-6 lg:px-8 flex items-start justify-center min-h-screen">
      <div className="max-w-xl w-full">

        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors group mb-6"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>

        <div className="bg-[#1e293b] border border-white/10 p-8 rounded-3xl shadow-2xl">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Create New Meeting</h2>
            <p className="text-sm text-slate-400 mt-1">You'll be taken straight to the recording room.</p>
          </div>

          <form onSubmit={handleCreate} className="space-y-6">
            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-3 rounded-2xl text-sm">
                {error}
              </div>
            )}

            {/* Meeting Title */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                Meeting Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text" required
                className="block w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl shadow-sm focus:bg-white/8 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium text-sm text-white placeholder-slate-500"
                placeholder="e.g. Weekly Standup"
                value={title} onChange={e => setTitle(e.target.value)}
              />
            </div>

            {/* Agenda */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                Agenda <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                className="block w-full px-4 py-3 bg-white/5 border border-white/10 rounded-2xl shadow-sm focus:bg-white/8 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium text-white placeholder-slate-500"
                rows={3}
                placeholder="What will be discussed in this meeting?"
                value={agenda} onChange={e => setAgenda(e.target.value)}
              />
            </div>

            {/* ── Recording Mode toggle ─────────────────────────────────── */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-300">Recording Mode</p>

              {/* Local mode */}
              <button
                type="button"
                onClick={() => setRemoteMode(false)}
                className={`w-full flex items-start gap-4 p-4 rounded-2xl border transition-all text-left ${
                  !remoteMode
                    ? 'border-indigo-500/60 bg-indigo-600/10 ring-1 ring-indigo-500/40'
                    : 'border-white/10 bg-white/5 hover:bg-white/8'
                }`}
              >
                <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  !remoteMode ? 'border-indigo-500 bg-indigo-500' : 'border-slate-600'
                }`}>
                  {!remoteMode && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-white">Local Recording</p>
                  <p className="text-xs text-slate-400 mt-0.5">All participants record in the same room on this device. (Classic mode)</p>
                </div>
              </button>

              {/* Remote mode */}
              <button
                type="button"
                id="remote-mode-btn"
                onClick={() => setRemoteMode(true)}
                className={`w-full flex items-start gap-4 p-4 rounded-2xl border transition-all text-left ${
                  remoteMode
                    ? 'border-violet-500/60 bg-violet-600/10 ring-1 ring-violet-500/40'
                    : 'border-white/10 bg-white/5 hover:bg-white/8'
                }`}
              >
                <span className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  remoteMode ? 'border-violet-500 bg-violet-500' : 'border-slate-600'
                }`}>
                  {remoteMode && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
                <div>
                  <p className="text-sm font-bold text-white flex items-center gap-2">
                    Remote Recording
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">NEW</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Each participant records from their own device. All audio is merged automatically.
                  </p>
                </div>
              </button>
            </div>

            {/* Expected participants — only shown in remote mode */}
            {remoteMode && (
              <div className="bg-violet-900/20 border border-violet-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-violet-300 text-sm font-semibold">
                  <Radio className="w-4 h-4" />
                  Remote Session Settings
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Total Recorders (including you)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setExpected(v => Math.max(1, v - 1))}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center transition-all"
                    >−</button>
                    <span className="text-2xl font-black text-white w-10 text-center tabular-nums">{expectedParticipants}</span>
                    <button
                      type="button"
                      onClick={() => setExpected(v => Math.min(10, v + 1))}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center transition-all"
                    >+</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    The system will wait until all {expectedParticipants} recording{expectedParticipants > 1 ? 's' : ''} are submitted before generating the AI summary.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 rounded-xl px-3 py-2">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  After creating, share the passkey with participants. They join from "Join Meeting" and record from their devices.
                </div>
              </div>
            )}

            <button
              type="submit"
              id="create-meeting-btn"
              disabled={loading}
              className={`w-full flex justify-center items-center gap-2 py-3.5 px-4 font-bold rounded-full shadow-lg text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                remoteMode
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-500 hover:from-violet-700 hover:to-indigo-600 shadow-violet-500/25'
                  : 'bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 shadow-indigo-500/25'
              }`}
            >
              <Plus className="w-5 h-5" />
              {loading ? 'Creating room…' : remoteMode ? 'Create Remote Session' : 'Create & Enter Room'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
