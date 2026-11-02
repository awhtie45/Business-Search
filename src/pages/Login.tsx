import { useState } from 'react';
import { supabase } from '../lib/backend';
import { Field } from '../components/ui';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const res = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) setMsg({ kind: 'error', text: res.error.message });
    else if (mode === 'signup' && !res.data.session) setMsg({ kind: 'ok', text: 'Account created. Check your email to confirm, then sign in.' });
  }

  return (
    <div style={{ maxWidth: 380, margin: '10vh auto', padding: 16 }}>
      <div className="card">
        <h1>🔎 Business Search</h1>
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        <form className="stack" onSubmit={submit}>
          <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password"><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></Field>
          <button className="btn primary block" disabled={busy}>{busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="small muted" style={{ marginTop: 12 }}>
          {mode === 'signin' ? <>First time? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); }}>Create your account</a></> : <>Have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signin'); }}>Sign in</a></>}
        </p>
      </div>
    </div>
  );
}
