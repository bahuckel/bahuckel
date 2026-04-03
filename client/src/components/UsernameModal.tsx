import { useState, FormEvent } from 'react';

interface UsernameModalProps {
  onSubmit: (username: string) => void;
}

const MIN_LENGTH = 1;
const MAX_LENGTH = 32;

export function UsernameModal({ onSubmit }: UsernameModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < MIN_LENGTH) {
      setError('Enter a name');
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`Name must be ${MAX_LENGTH} characters or less`);
      return;
    }
    setError('');
    onSubmit(trimmed);
  };

  return (
    <div className="username-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="username-modal-title">
      <div className="username-modal">
        <h2 id="username-modal-title" className="username-modal-title">Join Bahuckel</h2>
        <p className="username-modal-desc">Choose a display name to continue.</p>
        <form onSubmit={handleSubmit} className="username-modal-form">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Display name"
            className="username-modal-input"
            autoFocus
            maxLength={MAX_LENGTH}
            aria-invalid={!!error}
            aria-describedby={error ? 'username-error' : undefined}
          />
          {error && (
            <p id="username-error" className="username-modal-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="username-modal-submit">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
