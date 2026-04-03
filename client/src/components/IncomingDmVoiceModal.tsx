import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import { IconPhoneCall, IconPhoneOff } from './UiIcons';

type IncomingDmVoiceModalProps = {
  fromUsername: string;
  avatarCacheBust?: number;
  userColors?: Record<string, string>;
  onAnswer: () => void;
  onDecline: () => void;
};

export function IncomingDmVoiceModal({
  fromUsername,
  avatarCacheBust,
  userColors,
  onAnswer,
  onDecline,
}: IncomingDmVoiceModalProps) {
  const color = userColors?.[fromUsername];
  return createPortal(
    <div className="incoming-call-overlay" role="dialog" aria-modal aria-labelledby="incoming-call-title">
      <div className="incoming-call-backdrop" onClick={onDecline} aria-hidden />
      <div className="incoming-call-card">
        <div className="incoming-call-phone-frame">
          <p className="incoming-call-label" id="incoming-call-title">
            Incoming call
          </p>
          <div className="incoming-call-avatar-wrap">
            <Avatar
              username={fromUsername}
              cacheBust={avatarCacheBust}
              imgClassName="incoming-call-avatar-img"
              initialClassName="incoming-call-avatar-initial"
            />
          </div>
          <span className="incoming-call-name" style={color ? { color } : undefined}>
            {fromUsername}
          </span>
          <div className="incoming-call-actions">
            <button type="button" className="incoming-call-btn incoming-call-decline" onClick={onDecline} aria-label="Decline">
              <IconPhoneOff className="incoming-call-btn-icon" />
              <span>Decline</span>
            </button>
            <button type="button" className="incoming-call-btn incoming-call-answer" onClick={onAnswer} aria-label="Answer">
              <IconPhoneCall className="incoming-call-btn-icon" />
              <span>Answer</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('portal-root') || document.body
  );
}
