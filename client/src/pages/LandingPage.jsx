import React from 'react';
import { Link } from 'react-router-dom';
import { Mic, FileText, Zap, Brain, Users, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0d1117] text-white">

      {/* ── Navbar ── */}
      <header className="w-full flex justify-between items-center px-8 py-5 border-b border-white/5 bg-[#0d1117]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 flex items-center justify-center">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-white text-base">Meet<span className="text-indigo-400"> Note</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="px-5 py-2 rounded-full font-semibold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white transition-all text-sm"
          >
            Log In
          </Link>
          <Link
            to="/register"
            className="px-5 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-500 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all text-sm"
          >
            Sign Up
          </Link>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 py-32 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-indigo-600/20 via-blue-600/10 to-transparent blur-3xl rounded-full" />
          <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] bg-gradient-to-t from-cyan-600/10 to-transparent blur-3xl rounded-full" />
          <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-gradient-to-t from-purple-600/10 to-transparent blur-3xl rounded-full" />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm font-semibold mb-8">
          <Zap className="w-4 h-4" /> AI-Powered Meeting Notes — Instantly
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          Focus on your{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">
            Meeting.
          </span>
          <br />
          We'll take the{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            Minutes.
          </span>
        </h1>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Record offline meetings instantly and let AI generate professional summaries,
          action items, and decisions — automatically.
        </p>

        <div className="flex justify-center gap-4 flex-wrap">
          <Link
            to="/register"
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-full font-bold shadow-[0_8px_30px_rgba(99,102,241,0.35)] hover:shadow-[0_8px_30px_rgba(99,102,241,0.55)] transition-all hover:-translate-y-1 text-lg flex items-center gap-2"
          >
            Sign Up <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            to="/login"
            className="px-8 py-4 bg-white/5 text-white rounded-full font-bold border border-white/10 hover:bg-white/10 transition-all hover:-translate-y-1 text-lg"
          >
            Log In
          </Link>
        </div>
      </section>

      {/* ── Key Features ── */}
      <section id="features" className="w-full bg-[#111827] border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white">Key Features</h2>
            <p className="text-slate-400 mt-4 max-w-2xl mx-auto">
              Everything you need to automate your meeting minutes.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<Mic className="w-8 h-8 text-indigo-400" />}
              title="Crystal Clear Recording"
              description="Record any physical meeting right from your browser interface with no extra software installation."
              accent="indigo"
            />
            <FeatureCard
              icon={<FileText className="w-8 h-8 text-blue-400" />}
              title="AI-Powered Summaries"
              description="Our advanced LLMs extract key points, action items, and decisions accurately from your transcripts."
              accent="blue"
            />
            <FeatureCard
              icon={<Users className="w-8 h-8 text-cyan-400" />}
              title="Multi-Speaker Recording"
              description="Support multiple co-recorders in the same meeting — audio is merged into one unified summary."
              accent="cyan"
            />
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="w-full bg-[#0d1117] border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-sm font-semibold mb-6">
            <Brain className="w-4 h-4" /> About Meetnote
          </div>

          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6 leading-tight">
            Transforming how teams{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-blue-400">
              document meetings
            </span>
          </h2>

          <p className="text-lg text-slate-400 mb-10 leading-relaxed max-w-2xl mx-auto">
            <strong className="text-white">Meetnote</strong> is an AI-powered meeting documentation platform built to eliminate the manual overhead of note-taking. Whether it's a boardroom session, team stand-up, or client presentation — our system records, transcribes, and summarises automatically.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <AboutStat number="10k+" label="Weekly Minutes Saved" color="text-indigo-400" />
            <AboutStat number="99.8%" label="Transcription Accuracy" color="text-blue-400" />
            <AboutStat number="3s" label="Avg. Summary Generation" color="text-cyan-400" />
          </div>

          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-500 text-white rounded-full font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all"
          >
            Start for Free <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 border-t border-white/5 bg-[#0d1117] w-full">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Meetnote. All rights reserved. Built with ❤️ and AI.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, accent }) {
  const borderMap = {
    indigo: 'border-indigo-500/20 hover:border-indigo-500/40',
    blue: 'border-blue-500/20 hover:border-blue-500/40',
    cyan: 'border-cyan-500/20 hover:border-cyan-500/40',
  };
  const bgMap = {
    indigo: 'bg-indigo-500/10',
    blue: 'bg-blue-500/10',
    cyan: 'bg-cyan-500/10',
  };
  return (
    <div className={`p-8 rounded-3xl bg-[#1e293b] border ${borderMap[accent] || 'border-white/10'} hover:shadow-2xl hover:-translate-y-1 transition-all duration-300`}>
      <div className={`w-14 h-14 ${bgMap[accent] || 'bg-white/5'} rounded-2xl flex items-center justify-center mb-6 border border-white/10`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
}

function AboutStat({ number, label, color }) {
  return (
    <div className="bg-[#1e293b] rounded-2xl p-6 border border-white/10 text-center">
      <p className={`text-4xl font-extrabold mb-1 ${color}`}>{number}</p>
      <p className="text-sm text-slate-400 font-medium">{label}</p>
    </div>
  );
}
