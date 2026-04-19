import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, ArrowLeft } from 'lucide-react';
import api from '../services/api';

export default function JoinMeetingPage() {
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleJoin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data: meeting } = await api.post('/meetings/join', {
        passkey: passkey.trim().toUpperCase(),
      });

      localStorage.setItem('currentMeetingInfo', JSON.stringify({
        title: meeting.title,
        passkey: meeting.passkey,
        isJoined: true,
      }));

      navigate(`/meeting/record/${meeting._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join meeting. Check the passkey.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-[#0d1117] py-10 px-4 sm:px-6 lg:px-8 flex items-start justify-center min-h-screen">
      <div className="max-w-md w-full">

        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors group mb-6"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </button>

        <div className="bg-[#1e293b] border border-white/10 p-8 rounded-3xl shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5">
            <LogIn className="w-7 h-7 text-indigo-400 ml-0.5" />
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-2">Join a Meeting</h2>
          <p className="text-slate-400 text-center mb-8 text-sm">Enter the passkey sent to your email by the host.</p>

          <form onSubmit={handleJoin} className="space-y-5">
            {error && (
              <div className="bg-red-900/30 border border-red-700/50 text-red-300 px-4 py-3 rounded-2xl text-sm">
                {error}
              </div>
            )}

            {/* Passkey */}
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Meeting Passkey <span className="text-red-400">*</span>
              </label>
              <input
                type="text" required
                className="block w-full px-6 py-4 bg-white/5 border border-white/10 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-center text-3xl font-black tracking-widest text-white placeholder-slate-600 uppercase"
                placeholder="ABCDEF"
                maxLength={6}
                value={passkey}
                onChange={e => setPasskey(e.target.value.toUpperCase())}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-4 px-4 font-bold rounded-full shadow-lg shadow-indigo-500/25 text-white bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 transition-all text-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogIn className="w-5 h-5" />
              {loading ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
