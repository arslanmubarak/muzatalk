import React, { useState } from 'react';
import { ArrowRight, AtSign, Lock, Mail, Phone, Smartphone } from 'lucide-react';
import { api, setAuthTokens } from '../services/api';
import { MuzTalkLogo } from './MuzTalkLogo';
import type { UserDTO } from '../../shared/types';

export function AuthScreen({
  onAuthenticated,
  onOpenAdmin,
}: {
  onAuthenticated: (user: UserDTO) => void;
  onOpenAdmin: () => void;
}) {
  const [authMode, setAuthMode] = useState<'email_otp' | 'password'>('email_otp');
  const [step, setStep] = useState<'form' | 'otp'>('form');

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.sendEmailOtp(email.trim(), username.trim() || undefined);
      setDevOtpHint(res.devOtpPreview || null);
      setStep('otp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyEmailOtp({
        email: email.trim(),
        otp: otp.trim(),
        username: username.trim() || undefined,
        displayName: displayName.trim() || undefined,
        password: password.trim() || undefined,
        deviceName: 'MuzTalk Web Client',
        platform: 'Web',
      });
      setAuthTokens(res.accessToken, res.refreshToken);
      onAuthenticated(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.loginWithPassword({
        identifier: loginIdentifier.trim(),
        password: loginPassword,
        deviceName: 'MuzTalk Web Client',
        platform: 'Web',
      });
      setEmail(res.email);
      setOtp('');
      setDevOtpHint(res.devOtpPreview || null);
      setAuthMode('email_otp');
      setStep('otp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7FAFC] dark:bg-[#101820] flex flex-col">
      <header className="w-full border-b border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-[#101820]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          <MuzTalkLogo size={34} />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <span className="whitespace-nowrap shrink-0">SMTP Email OTP</span>
            <span className="whitespace-nowrap shrink-0">WebRTC Calls</span>
            <span className="whitespace-nowrap shrink-0">Firebase Push</span>
            <span className="whitespace-nowrap shrink-0">MySQL 8 Engine</span>
          </nav>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-[#101C35] dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
          >
            Admin Console
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-6 space-y-6">
          <p className="text-sm font-semibold tracking-wide text-[#20BFA5]">
            Connect. Chat. Call.
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#101C35] dark:text-white leading-[1.12] [text-wrap:balance]">
            Real-time messaging and calls built on MySQL 8.
          </h1>
          <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
            Sign in with your Email and @Username via SMTP verification, keep chat media cached locally on mobile, and sync calls, statuses, and communities across Web and Android SDK 36.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800">
              <Lock className="w-5 h-5 text-[#20BFA5] mb-2" />
              <div className="text-sm font-semibold text-[#101C35] dark:text-white">End-to-End Keys</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ECDH P-256 identity verification and safety fingerprints.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800">
              <Phone className="w-5 h-5 text-[#20BFA5] mb-2" />
              <div className="text-sm font-semibold text-[#101C35] dark:text-white">WebRTC + LiveKit</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                1:1 P2P STUN/TURN calling and SFU group rooms.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800">
              <Smartphone className="w-5 h-5 text-[#20BFA5] mb-2" />
              <div className="text-sm font-semibold text-[#101C35] dark:text-white">Android SDK 36</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Kotlin + Java native app with local mobile storage & FCM.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="bg-white dark:bg-[#15202B] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm max-w-md mx-auto">
            <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-[#101820] mb-5">
              <button
                type="button"
                onClick={() => { setAuthMode('email_otp'); setStep('form'); setError(null); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  authMode === 'email_otp'
                    ? 'bg-white dark:bg-[#15202B] text-[#101C35] dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Email + Username OTP
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('password'); setError(null); }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
                  authMode === 'password'
                    ? 'bg-white dark:bg-[#15202B] text-[#101C35] dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Username / Password
              </button>
            </div>

            <div className="mb-5">
              <h2 className="font-display text-2xl font-bold text-[#101C35] dark:text-white">
                {authMode === 'password'
                  ? 'Sign in with Username'
                  : step === 'form'
                    ? 'Sign in with Email'
                    : 'Verify Email Code'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {authMode === 'password'
                  ? 'Enter your @username or email and password, then verify 6-digit OTP.'
                  : step === 'form'
                    ? 'Receive a one-time SMTP verification code via email on every login.'
                    : `Verification code sent to ${email}`}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {authMode === 'password' ? (
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Username or Email
                  </label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="username or you@example.com"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : step === 'form' ? (
              <form onSubmit={handleSendEmailOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Username (for new accounts)
                  </label>
                  <div className="relative">
                    <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="bilal_ahmed"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Display Name (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bilal Ahmed"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 min-h-[44px]"
                >
                  <span>{loading ? 'Sending Email Code...' : 'Send Email Code'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyEmailOtp} className="space-y-4">
                {devOtpHint && (
                  <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900 flex items-center justify-between gap-3">
                    <div className="text-xs text-teal-900 dark:text-teal-200">
                      Preview OTP (configure SMTP in Admin Console): <span className="font-mono font-bold text-sm">{devOtpHint}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtp(devOtpHint)}
                      className="text-xs font-semibold text-[#20BFA5] hover:underline whitespace-nowrap shrink-0"
                    >
                      Auto-fill
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    6-Digit Email Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-center font-mono text-xl tracking-[0.35em] text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Set Password (optional, enables Username + Password login)
                  </label>
                  <input
                    type="password"
                    minLength={6}
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#101820] text-sm text-[#101C35] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#20BFA5]"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[44px]"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="flex-1 py-3 px-4 rounded-xl bg-[#20BFA5] hover:bg-[#1aa891] text-white font-semibold text-sm transition-colors disabled:opacity-50 min-h-[44px]"
                  >
                    {loading ? 'Verifying...' : 'Verify & Continue'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      </main>
    </div>
  );
}
