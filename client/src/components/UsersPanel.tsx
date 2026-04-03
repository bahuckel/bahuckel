import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';

interface UsersPanelProps {
  serverName?: string;
  serverId?: string | null;
  /** Lowercase username → server time they joined the current voice session (earliest if multiple channels). */
  voiceJoinedAtByUsername?: Record<string, number>;
  members: string[];
  onlineMembers?: string[];
  memberRoles?: Record<string, string>;
  roles: { id: string; name: string; weight: number }[];
  currentUsername?: string | null;
  serverOwnerId?: string;
  userColors?: Record<string, string>;
  avatarCacheBust?: number;
  canAssignRoles?: boolean;
  canKick?: boolean;
  onAssignRole?: (username: string, roleId: string) => void;
  onKick?: (username: string) => void;
  onBan?: (username: string) => void;
  onLeaveServer?: () => void;
  onRequestFriend?: (username: string) => void;
  onOpenProfile?: (username: string) => void;
  onClose?: () => void;
}

export function UsersPanel({
  serverName,
  serverId,
  voiceJoinedAtByUsername = {},
  members,
  onlineMembers = [],
  memberRoles = {},
  roles,
  currentUsername,
  serverOwnerId,
  userColors = {},
  avatarCacheBust,
  canAssignRoles,
  canKick,
  onAssignRole,
  onKick,
  onBan,
  onLeaveServer,
  onRequestFriend,
  onOpenProfile,
  onClose,
}: UsersPanelProps) {
  const [search, setSearch] = useState('');
  const [contextMenu, setContextMenu] = useState<{ username: string; x: number; y: number } | null>(null);
  const [rolesSubmenuOpen, setRolesSubmenuOpen] = useState(false);

  const CONTEXT_MENU_WIDTH = 200;
  const CONTEXT_MENU_HEIGHT = 280;

  const getContextMenuPosition = () => {
    if (!contextMenu) return { left: 0, top: 0 };
    const pad = 8;
    const menuW = CONTEXT_MENU_WIDTH;
    const menuH = CONTEXT_MENU_HEIGHT;
    const w = typeof window !== 'undefined' ? window.innerWidth : 9999;
    const h = typeof window !== 'undefined' ? window.innerHeight : 9999;
    let left = contextMenu.x + pad;
    let top = contextMenu.y + pad;
    if (left + menuW > w) left = contextMenu.x - menuW - pad;
    if (top + menuH > h) top = h - menuH - pad;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    return { left, top };
  };

  const rolesByPower = useMemo(() => [...roles].sort((a, b) => a.weight - b.weight), [roles]);
  // Exclude Owner role - only server owner has that; it can't be assigned
  const assignableRoles = useMemo(() => rolesByPower.filter((r) => r.id !== 'owner'), [rolesByPower]);

  const onlineSet = useMemo(() => new Set(onlineMembers.map((u) => u.toLowerCase())), [onlineMembers]);

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = !q.trim() ? [...members] : members.filter((m) => m.toLowerCase().includes(q));
    base.sort((a, b) => {
      const ja = voiceJoinedAtByUsername[a.toLowerCase()];
      const jb = voiceJoinedAtByUsername[b.toLowerCase()];
      const inVoiceA = ja != null && ja > 0;
      const inVoiceB = jb != null && jb > 0;
      if (inVoiceA !== inVoiceB) return inVoiceA ? -1 : 1;
      if (inVoiceA && inVoiceB && ja !== jb) return ja - jb;
      return a.localeCompare(b);
    });
    return base;
  }, [members, search, voiceJoinedAtByUsername]);

  const ownerRoleName = useMemo(() => roles.find((r) => r.id === 'owner')?.name ?? 'Owner', [roles]);
  const guestRoleName = useMemo(() => roles.find((r) => r.id === 'guest')?.name ?? 'Guest', [roles]);

  const membersByRole = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const username of filteredMembers) {
      const roleName = serverOwnerId?.toLowerCase() === username.toLowerCase()
        ? ownerRoleName
        : (() => {
            const roleId = memberRoles[username.toLowerCase()];
            const role = roles.find((r) => r.id === roleId);
            return role?.name ?? guestRoleName;
          })();
      const list = map.get(roleName) ?? [];
      list.push(username);
      map.set(roleName, list);
    }
    const customOrder = rolesByPower.filter((r) => r.id !== 'owner' && r.id !== 'guest').map((r) => r.name);
    const order = [ownerRoleName, ...customOrder, guestRoleName];
    return order.map((roleName) => ({ roleName, usernames: map.get(roleName) ?? [] })).filter((g) => g.usernames.length > 0);
  }, [filteredMembers, serverOwnerId, memberRoles, roles, rolesByPower, ownerRoleName, guestRoleName]);

  const getMemberRole = (username: string): string => {
    if (serverOwnerId?.toLowerCase() === username.toLowerCase()) return ownerRoleName;
    const roleId = memberRoles[username.toLowerCase()];
    const role = roles.find((r) => r.id === roleId);
    return role?.name ?? guestRoleName;
  };

  return (
    <div className="users-panel">
      <div className="users-panel-header">
        <span className="users-panel-title">
          <span className="users-panel-icon" aria-hidden>👥</span>
          Users
          {serverName && <span className="users-panel-server"> — {serverName}</span>}
        </span>
        {onClose && (
          <button
            type="button"
            className="users-panel-close"
            onClick={onClose}
            aria-label="Close users panel"
          >
            ×
          </button>
        )}
      </div>
      <div className="users-panel-search-wrap">
        <input
          type="text"
          className="users-panel-search"
          placeholder="Search users…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users"
        />
      </div>
      <div className="users-panel-list">
        {membersByRole.map(({ roleName, usernames }) => (
          <div key={roleName} className="users-panel-role-group">
            <div className="users-panel-role-header">{roleName}</div>
            <ul className="users-panel-role-members">
            {usernames.map((username) => (
          <li
            key={username}
            className="users-panel-member"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ username, x: e.clientX, y: e.clientY });
              setRolesSubmenuOpen(false);
            }}
          >
            <span
              className={`users-panel-status-dot ${onlineSet.has(username.toLowerCase()) ? 'online' : 'offline'}`}
              title={onlineSet.has(username.toLowerCase()) ? 'Online' : 'Offline'}
              aria-hidden
            />
            <span
              className="users-panel-avatar"
              style={userColors[username] ? { color: userColors[username] } : undefined}
            >
              <Avatar
                username={username}
                cacheBust={avatarCacheBust}
                imgClassName="users-panel-avatar-img"
                initialClassName="users-panel-avatar-initial"
              />
            </span>
            <span className="users-panel-member-name">{username}</span>
            {username === currentUsername && <span className="users-panel-you">you</span>}
            {serverOwnerId?.toLowerCase() === username.toLowerCase() && (
              <span className="users-panel-owner-badge" title="Server owner">👑</span>
            )}
            <span className="users-panel-role">{getMemberRole(username)}</span>
          </li>
            ))}
            </ul>
          </div>
        ))}
      </div>
      {contextMenu && createPortal(
        <>
          <div
            className="voice-member-popup-backdrop users-role-backdrop"
            aria-hidden
            onClick={() => { setContextMenu(null); setRolesSubmenuOpen(false); }}
          />
          <div
            className="voice-member-popup users-context-menu"
            role="menu"
            style={{
              position: 'fixed',
              ...getContextMenuPosition(),
              zIndex: 1001,
            }}
          >
            <div className="voice-member-popup-inner">
              {onOpenProfile && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenProfile(contextMenu.username);
                    setContextMenu(null);
                  }}
                >
                  Profile
                </button>
              )}
              {contextMenu.username === currentUsername && onLeaveServer && (
                <button
                  type="button"
                  role="menuitem"
                  className="users-context-menu-danger"
                  onClick={() => {
                    onLeaveServer();
                    setContextMenu(null);
                  }}
                >
                  Leave server
                </button>
              )}
              {contextMenu.username !== currentUsername && onRequestFriend && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onRequestFriend(contextMenu.username);
                    setContextMenu(null);
                  }}
                >
                  Send friend request
                </button>
              )}
              {contextMenu.username !== currentUsername && canKick && onKick && serverOwnerId?.toLowerCase() !== contextMenu.username.toLowerCase() && (
                <button
                  type="button"
                  role="menuitem"
                  className="users-context-menu-danger"
                  onClick={() => {
                    onKick(contextMenu.username);
                    setContextMenu(null);
                  }}
                >
                  Kick
                </button>
              )}
              {contextMenu.username !== currentUsername && canKick && onBan && serverOwnerId?.toLowerCase() !== contextMenu.username.toLowerCase() && (
                <button
                  type="button"
                  role="menuitem"
                  className="users-context-menu-danger"
                  onClick={() => {
                    onBan(contextMenu.username);
                    setContextMenu(null);
                  }}
                >
                  Ban
                </button>
              )}
              {contextMenu.username !== currentUsername && canAssignRoles && onAssignRole && (
                <div
                  className="users-context-menu-submenu-wrapper"
                  onMouseEnter={() => setRolesSubmenuOpen(true)}
                  onMouseLeave={() => setRolesSubmenuOpen(false)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!rolesSubmenuOpen) setRolesSubmenuOpen(true);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setRolesSubmenuOpen((v) => !v);
                    }
                  }}
                >
                  <div className="users-context-menu-submenu-trigger">
                    <span>Roles</span>
                    <span className="users-context-menu-arrow">{rolesSubmenuOpen ? '▾' : '›'}</span>
                  </div>
                  {rolesSubmenuOpen && (
                    <div className="users-context-menu-submenu">
                      {assignableRoles.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          role="menuitem"
                          className={memberRoles[contextMenu.username.toLowerCase()] === r.id ? 'active' : ''}
                          onClick={() => {
                            onAssignRole(contextMenu.username, r.id);
                            setContextMenu(null);
                          }}
                        >
                          {r.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        role="menuitem"
                        className={!memberRoles[contextMenu.username.toLowerCase()] || memberRoles[contextMenu.username.toLowerCase()] === 'guest' ? 'active' : ''}
                        onClick={() => {
                          onAssignRole(contextMenu.username, '');
                          setContextMenu(null);
                        }}
                      >
                        Default (Guest)
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button type="button" onClick={() => setContextMenu(null)}>Cancel</button>
            </div>
          </div>
        </>,
        document.getElementById('portal-root') || document.body
      )}
    </div>
  );
}
