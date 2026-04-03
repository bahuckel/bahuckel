import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';

export type UserProfilePayload = {
  username: string;
  nameColor: string;
  aboutMe: string;
  hasAvatar: boolean;
  error?: string;
};

type ProfileModalProps = {
  username: string | null;
  myUsername: string;
  friends: string[];
  avatarCacheBust?: number;
  userColors?: Record<string, string>;
  send: (msg: Record<string, unknown>) => void;
  subscribe: (fn: (msg: Record<string, unknown>) => void) => () => void;
  onClose: () => void;
};

export function ProfileModal({
  username,
  myUsername,
  friends,
  avatarCacheBust,
  userColors = {},
  send,
  subscribe,
  onClose,
}: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setProfile(null);
    send({ type: 'get_user_profile', username });
    const unsub = subscribe((msg) => {
      if (msg.type !== 'user_profile') return;
      const u = typeof msg.username === 'string' ? msg.username : '';
      if (u.toLowerCase() !== username.toLowerCase()) return;
      if (msg.error === 'not_found') {
        setProfile({ username, nameColor: '#b5bac1', aboutMe: '', hasAvatar: false, error: 'not_found' });
      } else {
        setProfile({
          username: msg.username as string,
          nameColor: (msg.nameColor as string) || '#b5bac1',
          aboutMe: (msg.aboutMe as string) || '',
          hasAvatar: !!msg.hasAvatar,
        });
      }
      setLoading(false);
    });
    return unsub;
  }, [username, send, subscribe]);

  if (!username) return null;

  const isSelf = myUsername.toLowerCase() === username.toLowerCase();
  const isFriend = friends.some((f) => f.toLowerCase() === username.toLowerCase());
  const color = userColors[username] ?? profile?.nameColor;

  return createPortal(
    <div className="profile-modal-overlay" role="dialog" aria-modal aria-labelledby="profile-modal-title">
      <div className="profile-modal-backdrop" onClick={onClose} aria-hidden />
      <div className="profile-modal">
        <div className="profile-modal-header">
          <h2 id="profile-modal-title">Profile</h2>
          <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="profile-modal-body">
          {loading && <p className="profile-modal-loading">Loading…</p>}
          {!loading && profile?.error === 'not_found' && (
            <p className="profile-modal-error">User not found.</p>
          )}
          {!loading && profile && !profile.error && (
            <>
              <div className="profile-modal-hero">
                <Avatar
                  username={profile.username}
                  cacheBust={avatarCacheBust}
                  imgClassName="profile-modal-avatar-img"
                  initialClassName="profile-modal-avatar-initial"
                />
                <span className="profile-modal-name" style={color ? { color } : undefined}>
                  {profile.username}
                </span>
              </div>
              {profile.aboutMe ? (
                <div className="profile-modal-about">
                  <div className="profile-modal-about-label">About me</div>
                  <div className="profile-modal-about-text">{profile.aboutMe}</div>
                </div>
              ) : (
                <p className="profile-modal-empty-about">No about text yet.</p>
              )}
              {!isSelf && !isFriend && (
                <button
                  type="button"
                  className="profile-modal-friend-btn"
                  onClick={() => {
                    send({ type: 'request_friend', username: profile.username });
                    onClose();
                  }}
                >
                  Send friend request
                </button>
              )}
              {!isSelf && isFriend && <p className="profile-modal-friends-note">You are friends.</p>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.getElementById('portal-root') || document.body
  );
}
