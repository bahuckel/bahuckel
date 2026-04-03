import { useState, FormEvent, useEffect } from 'react';
import { CUSTOM_SECURITY_QUESTION_VALUE, SECURITY_QUESTION_PRESETS } from '../constants/securityQuestions';
import { sha256HexUtf8 } from '../utils/passwordTransport';

type ConnectionStatus = 'connecting' | 'connected' | 'unreachable';

const MIN_PASSWORD_LENGTH = 8;
function validatePassword(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain at least one letter';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  return null;
}

interface LoginModalProps {
  onLoggedIn: (username: string) => void;
  send: (msg: Record<string, unknown>) => void;
  subscribe: (listener: (msg: Record<string, unknown>) => void) => () => void;
  ready: boolean;
  connectionStatus: ConnectionStatus;
  loginError: string | null;
  loginLockedUntil: number | null;
  clearLoginError: () => void;
  resetToken: string | null;
  onPasswordChanged: () => void;
}

export function LoginModal({
  send,
  subscribe,
  ready,
  connectionStatus,
  loginError,
  loginLockedUntil,
  clearLoginError,
  resetToken,
  onPasswordChanged,
}: LoginModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTION_PRESETS[0] ?? '');
  const [customSecurityQuestion, setCustomSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'set_password'>('login');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  useEffect(() => {
    if (loginError) setLoading(false);
  }, [loginError]);

  useEffect(() => {
    if (resetToken) setMode('set_password');
  }, [resetToken]);

  useEffect(() => {
    return subscribe((msg: Record<string, unknown>) => {
      if (msg.type === 'password_changed') {
        setMode('login');
        setNewPassword('');
        setNewPasswordConfirm('');
        setLoading(false);
        onPasswordChanged();
      }
      if (msg.type === 'user_set') {
        setLoading(false);
      }
    });
  }, [subscribe, onPasswordChanged]);

  const error = loginError ?? localError;
  const lockedUntilMessage = loginLockedUntil != null
    ? ` Try again after ${new Date(loginLockedUntil).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.`
    : '';

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    clearLoginError();
    setLocalError('');
    if (!username.trim() || !password) {
      setLocalError('Enter username and password');
      return;
    }
    setLoading(true);
    const passwordSha256 = await sha256HexUtf8(password);
    send({ type: 'login', username: username.trim(), passwordSha256 });
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    clearLoginError();
    setLocalError('');
    if (!username.trim() || !password) {
      setLocalError('Enter username and password');
      return;
    }
    const pErr = validatePassword(password);
    if (pErr) {
      setLocalError(pErr);
      return;
    }
    const answer = securityAnswer.trim();
    if (!answer || answer.length < 2) {
      setLocalError('Security answer must be at least 2 characters (used to reset password later)');
      return;
    }
    const qRaw =
      securityQuestion === CUSTOM_SECURITY_QUESTION_VALUE ? customSecurityQuestion.trim() : securityQuestion.trim();
    if (securityQuestion === CUSTOM_SECURITY_QUESTION_VALUE) {
      if (qRaw.length < 4) {
        setLocalError('Custom security question must be at least 4 characters');
        return;
      }
    }
    setLoading(true);
    const passwordSha256 = await sha256HexUtf8(password);
    send({
      type: 'register',
      username: username.trim(),
      passwordSha256,
      securityQuestion: qRaw,
      securityAnswer: answer,
    });
  };

  const handleForgotSubmit = (e: FormEvent) => {
    e.preventDefault();
    clearLoginError();
    setLocalError('');
    if (!username.trim() || !securityAnswer.trim()) {
      setLocalError('Enter username and security answer');
      return;
    }
    setLoading(true);
    send({ type: 'request_password_reset', username: username.trim(), securityAnswer: securityAnswer.trim() });
  };

  const handleSetNewPassword = async (e: FormEvent) => {
    e.preventDefault();
    clearLoginError();
    setLocalError('');
    const pErr = validatePassword(newPassword);
    if (pErr) {
      setLocalError(pErr);
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setLocalError('Passwords do not match');
      return;
    }
    if (!resetToken) return;
    setLoading(true);
    const newPasswordSha256 = await sha256HexUtf8(newPassword);
    send({ type: 'set_new_password', resetToken, newPasswordSha256 });
  };

  const content = () => {
    if (mode === 'set_password' && resetToken) {
      return (
        <form onSubmit={handleSetNewPassword} className="username-modal-form login-form">
          <p className="username-modal-desc">Set your new password.</p>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 8 chars, letter + number)"
            className="username-modal-input"
            minLength={MIN_PASSWORD_LENGTH}
            autoFocus
          />
          <input
            type="password"
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="username-modal-input"
            minLength={MIN_PASSWORD_LENGTH}
          />
          {error && <p className="username-modal-error" role="alert">{error}{lockedUntilMessage}</p>}
          <div className="login-buttons">
            <button type="submit" className="username-modal-submit" disabled={!ready || loading}>
              Set password
            </button>
            <button type="button" className="login-register-btn" onClick={() => { onPasswordChanged(); setMode('login'); }}>
              Back to login
            </button>
          </div>
        </form>
      );
    }
    if (mode === 'forgot') {
      return (
        <form onSubmit={handleForgotSubmit} className="username-modal-form login-form">
          <p className="username-modal-desc">Enter your username and the answer to your security question.</p>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="username-modal-input"
            autoFocus
          />
          <input
            type="text"
            value={securityAnswer}
            onChange={(e) => setSecurityAnswer(e.target.value)}
            placeholder="Security answer"
            className="username-modal-input"
            autoComplete="off"
          />
          {error && <p className="username-modal-error" role="alert">{error}{lockedUntilMessage}</p>}
          <div className="login-buttons">
            <button type="submit" className="username-modal-submit" disabled={!ready || loading}>
              Verify & reset
            </button>
            <button type="button" className="login-register-btn" onClick={() => { setMode('login'); clearLoginError(); setLocalError(''); }}>
              Back to login
            </button>
          </div>
        </form>
      );
    }
    return (
      <form
        onSubmit={(e) => { if (mode === 'register') handleRegister(e); else handleLogin(e); }}
        className="username-modal-form login-form"
      >
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="username-modal-input"
          autoComplete="username"
          maxLength={64}
          autoFocus
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'Password (min 8 chars, letter + number)' : 'Password'}
          className="username-modal-input"
          autoComplete="current-password"
        />
        {mode === 'register' && (
          <>
            <label className="login-security-label">Security question (for password reset)</label>
            <select
              value={securityQuestion}
              onChange={(e) => setSecurityQuestion(e.target.value)}
              className="username-modal-input"
            >
              {SECURITY_QUESTION_PRESETS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
              <option value={CUSTOM_SECURITY_QUESTION_VALUE}>Custom (type your own question)</option>
            </select>
            {securityQuestion === CUSTOM_SECURITY_QUESTION_VALUE && (
              <input
                type="text"
                value={customSecurityQuestion}
                onChange={(e) => setCustomSecurityQuestion(e.target.value)}
                placeholder="Your security question (you will answer this to change or reset password)"
                className="username-modal-input"
                maxLength={200}
                autoComplete="off"
              />
            )}
            <input
              type="text"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              placeholder="Your answer (remember this to reset password later)"
              className="username-modal-input"
              autoComplete="off"
            />
          </>
        )}
        {error && <p className="username-modal-error" role="alert">{error}{lockedUntilMessage}</p>}
        <div className="login-buttons">
          <button
            type="submit"
            className="username-modal-submit"
            disabled={!ready || loading}
            title={!ready ? 'Waiting for server connection' : undefined}
          >
            {mode === 'register' ? 'Register' : 'Log in'}
          </button>
          <button
            type="button"
            className="login-register-btn"
            onClick={(e) => {
              e.preventDefault();
              if (mode === 'register') {
                setMode('login');
                setLocalError('');
              } else {
                setMode('register');
                setLocalError('');
              }
            }}
            disabled={loading}
          >
            {mode === 'register' ? 'Back to login' : 'Register'}
          </button>
        </div>
        {mode === 'login' && (
          <button
            type="button"
            className="login-forgot-link"
            onClick={() => { setMode('forgot'); setLocalError(''); clearLoginError(); }}
            disabled={loading}
          >
            Forgot password?
          </button>
        )}
      </form>
    );
  };

  const statusMessage = connectionStatus === 'connecting'
    ? 'Connecting to server…'
    : connectionStatus === 'unreachable'
      ? 'Server unreachable. Check that the server is running and you selected the right address (e.g. http://localhost:3001).'
      : null;

  return (
    <div className="username-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <div className="username-modal">
        <h2 id="login-modal-title" className="username-modal-title">Bahuckel</h2>
        {mode === 'login' && <p className="username-modal-desc">Log in or register to continue.</p>}
        {statusMessage && (
          <p className={`login-connection-status login-connection-status-${connectionStatus}`} role="status">
            {statusMessage}
          </p>
        )}
        {content()}
        {mode === 'login' && (
          <p className="login-hint">Register requires a security question and answer (used if you forget your password). Anyone can register; server access is managed by server owners.</p>
        )}
        {typeof window !== 'undefined' && typeof (window as { bahuckel?: { exitToServerSelect?: () => void } }).bahuckel?.exitToServerSelect === 'function' && (
          <button
            type="button"
            className="login-back-to-servers"
            onClick={() => (window as { bahuckel: { exitToServerSelect: () => void } }).bahuckel.exitToServerSelect()}
          >
            ← Back to server list
          </button>
        )}
      </div>
    </div>
  );
}
