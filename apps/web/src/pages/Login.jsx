import { useState } from 'react';
import { login } from '../services/auth.js';

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
    <main className="page-enter flex min-h-screen flex-col items-center justify-between bg-slate-50 px-4 py-12 text-slate-800">
      <div className="my-auto flex w-full max-w-md flex-col items-center">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-2xl font-bold text-white shadow-md">
            ⚒
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">SINAR SELATAN BANTEN</h1>
          <p className="mt-2 text-sm text-slate-500">Enterprise Resource Planning Portal</p>
        </header>

        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm" aria-labelledby="login-heading">
          <h2 id="login-heading" className="text-lg font-semibold text-slate-900">Sign in to your account</h2>
          <p className="mt-1 text-xs text-slate-500">Enter your credentials to access your workspace.</p>

          {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</div>}
          {success && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700" role="status">{success}</div>}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Username or Email</label>
              <input id="login" name="login" type="text" value={loginField} onChange={(event) => setLoginField(event.target.value)} placeholder="name@ssb.co.id" required autoComplete="username" disabled={loading} className="input-control mt-1.5" />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-600">Password</label>
              <div className="relative mt-1.5">
                <input id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required autoComplete="current-password" disabled={loading} className="input-control pr-10" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5 text-sm font-semibold">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </section>

        <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>System operational · HQ-DB-SERVER-04</span>
        </div>
      </div>

      <footer className="mt-8 text-center text-xs text-slate-400">© 2026 ConstructERP Technical Infrastructure. Restricted access.</footer>
    </main>
  );
}

