import { useState } from 'react';
import { login } from '../services/auth.js';

const inputClassName = 'mt-2 block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-cyan-700 focus:ring-4 focus:ring-cyan-700/10 disabled:bg-slate-50';

function EyeIcon({ hidden }) {
  return hidden ? (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.22A10.45 10.45 0 0 0 1.93 12c1.3 4.34 5.31 7.5 10.07 7.5 1 0 1.95-.14 2.86-.4M6.23 6.23A10.45 10.45 0 0 1 12 4.5c4.76 0 8.77 3.16 10.07 7.5a10.52 10.52 0 0 1-4.29 5.77M6.23 6.23 3 3m3.23 3.23 3.65 3.65m7.89 7.89L21 21m-3.23-3.23-3.65-3.65m0 0a3 3 0 1 0-4.24-4.24" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.04 12.32a1 1 0 0 1 0-.64C3.42 7.51 7.36 4.5 12 4.5s8.57 3.01 9.96 7.18a1 1 0 0 1 0 .64C20.58 16.49 16.64 19.5 12 19.5s-8.57-3.01-9.96-7.18Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export default function Login({ onLoginSuccess }) {
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { token, user } = await login({ login: loginField.trim(), password });
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      onLoginSuccess();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-[#edf5fc] px-4 py-10 font-sans text-slate-700 sm:py-14">
      <div className="my-auto flex w-full max-w-[420px] flex-col items-center">
        <header className="mb-7 text-center">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-800">ERP System Login</p>
          <h1 className="text-[25px] font-extrabold tracking-[0.08em] text-[#075d82] sm:text-[28px]">SINAR SELATAN BANTEN</h1>
          <div className="mx-auto mt-4 h-px w-10 bg-cyan-700/30" />
          <p className="mt-3 text-sm text-slate-500">Masuk dengan akun divisi Anda.</p>
        </header>

        <section className="w-full rounded-xl border border-white/80 bg-white p-7 shadow-[0_12px_35px_rgba(31,78,121,0.10)] sm:p-8" aria-labelledby="login-heading">
          <h2 id="login-heading" className="sr-only">Login ke sistem ERP</h2>
          {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-center text-xs text-red-700" role="alert">{error}</div>}
          {success && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center text-xs text-emerald-700" role="status">{success}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Username atau email</label>
              <input id="login" name="login" type="text" value={loginField} onChange={(event) => setLoginField(event.target.value)} placeholder="email@ssb.co.id atau username" required autoComplete="username" disabled={loading} className={inputClassName} />
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Password</label>
              <div className="relative">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan password" required autoComplete="current-password" disabled={loading} className={`${inputClassName} pr-11`} />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-700/20" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="mt-1 flex w-full items-center justify-center rounded-lg bg-[#076b92] px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white shadow-sm transition hover:bg-[#075a7b] focus:outline-none focus:ring-4 focus:ring-cyan-700/20 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? 'Memproses...' : 'Login'}
            </button>
          </form>
        </section>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/70 px-3.5 py-2 text-[11px] font-medium text-slate-600 shadow-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
          <span>System online: HQ-DB-SERVER-04</span>
        </div>
      </div>

      <footer className="mt-8 text-center text-[10px] tracking-wide text-slate-400">© 2026 CONSTRUCT_ERP Technical Infrastructure. Restricted access.</footer>
    </main>
  );
}
