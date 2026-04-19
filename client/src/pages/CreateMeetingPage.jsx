import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowLeft } from 'lucide-react';
import api from '../services/api';

export default function CreateMeetingPage() {
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/meetings', { title, agenda });

      localStorage.setItem('currentMeetingInfo', JSON.stringify({
        title: data.title,
        passkey: data.passkey,
        agenda: data.agenda,
      }));

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
                rows={4}
                placeholder="What will be discussed in this meeting?"
                value={agenda} onChange={e => setAgenda(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 font-bold rounded-full shadow-lg shadow-indigo-500/25 text-white bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 hover:shadow-indigo-500/35 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              {loading ? 'Creating room…' : 'Create & Enter Room'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
