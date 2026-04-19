import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Users, FileText, ChevronRight, CalendarDays, Sparkles,
  ClipboardList, Trash2, AlertTriangle, X
} from 'lucide-react';
import api from '../services/api';

export default function DashboardPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const { data } = await api.get('/meetings');
      setMeetings(data);
    } catch (err) {
      setError('Failed to load meetings. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/meetings/${deleteTarget._id}`);
      setMeetings(prev => prev.filter(m => m._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err) {
      setError('Failed to delete meeting. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const completedMeetings = meetings.filter((m) => m.status === 'completed');
  const totalMeetings = meetings.length;

  return (
    <div className="flex-1 py-10 px-6 lg:px-8 min-h-screen bg-[#0d1117]">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ── */}
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Dashboard</h1>
          <p className="mt-1 text-slate-400">
            {user.name ? `Welcome back, ${user.name}!` : 'Welcome back!'} Start a meeting or review your completed summaries.
          </p>
        </div>

        {/* ── Primary Actions ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          <Link
            to="/meeting/create"
            className="group flex items-center gap-5 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-3xl p-6 shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/35 hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:bg-white/30 transition-colors">
              <Plus className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">Create Meeting</p>
              <p className="text-white/75 text-sm mt-0.5">Start a new session &amp; generate AI notes</p>
            </div>
            <ChevronRight className="w-5 h-5 text-white/60 ml-auto group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            to="/meeting/join"
            className="group flex items-center gap-5 bg-[#1e293b] rounded-3xl p-6 shadow-xl shadow-black/30 border border-white/10 hover:border-indigo-500/40 hover:-translate-y-1 transition-all duration-200"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 transition-colors">
              <Users className="w-7 h-7 text-slate-400 group-hover:text-indigo-400 transition-colors" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">Join Meeting</p>
              <p className="text-slate-400 text-sm mt-0.5">Enter a passkey to join an existing session</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500 ml-auto group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
          <StatCard
            icon={<ClipboardList className="w-6 h-6 text-indigo-400" />}
            label="Total Meetings"
            value={loading ? '…' : totalMeetings.toString()}
            color="indigo"
          />
          <StatCard
            icon={<Sparkles className="w-6 h-6 text-blue-400" />}
            label="Completed with Summary"
            value={loading ? '…' : completedMeetings.length.toString()}
            color="blue"
          />
        </div>

        {/* ── Completed Meetings ── */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <FileText className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-bold text-white">Completed Meetings</h2>
            {completedMeetings.length > 0 && (
              <span className="ml-auto text-xs font-semibold text-slate-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                {completedMeetings.length} {completedMeetings.length === 1 ? 'summary' : 'summaries'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="bg-[#1e293b] rounded-3xl border border-white/10 p-12 text-center">
              <p className="text-slate-400 text-sm">Loading meetings…</p>
            </div>
          ) : error ? (
            <div className="bg-red-900/30 border border-red-700/50 rounded-3xl p-6 text-center text-red-300 text-sm">
              {error}
            </div>
          ) : completedMeetings.length === 0 ? (
            <div className="bg-[#1e293b] rounded-3xl border border-white/10 p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white/10">
                <CalendarDays className="w-8 h-8 text-slate-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No completed meetings yet</h3>
              <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
                Once you finish a recording and the AI generates a summary, it will appear here.
              </p>
              <Link
                to="/meeting/create"
                className="inline-flex items-center gap-2 mt-6 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-full text-sm font-semibold shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all"
              >
                <Plus className="w-4 h-4" /> Start your first meeting
              </Link>
            </div>
          ) : (
            <div className="bg-[#1e293b] rounded-3xl shadow-xl border border-white/10 overflow-hidden">
              <ul className="divide-y divide-white/5">
                {completedMeetings.map((meeting) => (
                  <li key={meeting._id} className="hover:bg-white/5 transition-colors group">
                    <div className="flex items-center justify-between p-5 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">{meeting.title}</h3>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(meeting.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                          <Sparkles className="w-3 h-3" /> Summary ready
                        </span>
                        <Link
                          to={`/meeting/summary/${meeting._id}`}
                          className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-full text-xs font-bold shadow-sm shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all hover:-translate-y-0.5"
                        >
                          View Summary
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(meeting)}
                          className="p-2 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete recording"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      </div>

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-[#1e293b] rounded-3xl p-7 w-full max-w-sm shadow-2xl border border-white/10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Recording?</h3>
                <p className="text-sm text-slate-400 mt-0.5">This action cannot be undone.</p>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="ml-auto p-1.5 rounded-full hover:bg-white/10 text-slate-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-white/5 rounded-2xl px-4 py-3 mb-5 border border-white/10">
              <p className="text-sm font-semibold text-white truncate">{deleteTarget.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(deleteTarget.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-full font-semibold text-slate-300 bg-white/5 hover:bg-white/10 text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full font-bold text-white bg-red-600 hover:bg-red-700 text-sm transition-all disabled:opacity-60 shadow-lg shadow-red-500/20"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const borderMap = {
    indigo: 'border-indigo-500/20',
    blue: 'border-blue-500/20',
  };
  const bgMap = {
    indigo: 'from-indigo-500/10 to-indigo-500/5',
    blue: 'from-blue-500/10 to-blue-500/5',
  };
  return (
    <div className={`bg-gradient-to-br ${bgMap[color]} rounded-3xl p-6 border ${borderMap[color] || 'border-white/10'} flex items-center gap-4`}>
      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <p className="text-3xl font-extrabold text-white mt-0.5">{value}</p>
      </div>
    </div>
  );
}
