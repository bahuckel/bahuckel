import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { ChannelInfo } from '../App';
import { ServerIconEditor } from './ServerIconEditor';
import { useSettings } from '../context/SettingsContext';
import { CHAT_BACKGROUND_OPTIONS, BACKGROUND_IMAGE_FIT_OPTIONS, type ChatBackgroundId, type BackgroundImageFit } from '../constants';
import { Avatar } from './Avatar';
import { IconHash, IconHeadphones, IconMicOff, IconVolumeX } from './UiIcons';
import { taskLog, describeElement } from '../utils/taskRecorder';
import { sortVoiceMembersByJoinedAt, type VoiceChannelMemberRow } from '../utils/voiceChannelOrder';

interface ChannelListProps {
  taskRecorderActive?: boolean;
  serverId: string | null;
  serverName?: string;
  serverOwnerId?: string;
  serverIconUrl?: string;
  canAccessServer?: boolean;
  currentUsername?: string | null;
  channels: ChannelInfo[];
  selectedChannel: ChannelInfo | null;
  onSelectChannel: (ch: ChannelInfo | null) => void;
  onCreateChannel: (name: string, type: 'text' | 'voice') => void;
  onRenameChannel: (channelId: string, name: string) => void;
  onDeleteChannel: (channelId: string) => void;
  onDeleteServer: () => void;
  onAddMember?: (username: string) => void;
  joinRequestMessage?: string | null;
  onRequestJoin?: () => void;
  onClearJoinRequestMessage?: () => void;
  voiceChannelState?: Record<string, VoiceChannelMemberRow[]>;
  speakingClientIds?: Set<string>;
  screenSharingClientIds?: Set<string>;
  currentVoiceChannelId?: string | null;
  myClientId?: string | null;
  onJoinVoiceChannel?: (channelId: string) => void;
  userColors?: Record<string, string>;
  avatarCacheBust?: number;
  voiceMuted?: boolean;
  voiceDeafened?: boolean;
  onVoiceMute?: () => void;
  onVoiceDeafen?: () => void;
  onVoiceLeave?: () => void;
  peerVolumes?: Record<string, number>;
  onPeerVolumeChange?: (clientId: string, volume: number) => void;
  isFriendsView?: boolean;
  incomingFriendRequests?: string[];
  onAcceptFriendRequest?: (fromUsername: string) => void;
  onDeclineFriendRequest?: (fromUsername: string) => void;
  onRequestFriend?: (username: string) => void;
  onRefreshFriends?: () => void;
  onCreateInvite?: () => void;
  canDeleteServer?: boolean;
  /** Create/rename/delete/reorder channels; from server (owner or manageChannels role). */
  canManageChannels?: boolean;
  onOpenSettings?: () => void;
  serverRoles?: { id: string; name: string; weight: number }[];
  onSetChannelMinRole?: (channelId: string, minRoleWeight: number | undefined) => void;
  onOpenRolesModal?: () => void;
  onReorderChannels?: (channelIds: string[]) => void;
  onSetServerIcon?: (serverId: string, iconUrl: string) => void;
  onOpenProfile?: (userName: string) => void;
}

function reorderChannels<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

const POPUP_WIDTH = 170;

function getPopupPosition(rect: DOMRect, popupWidth: number, overlap = 0): { left: number; top: number } {
  const spaceRight = typeof window !== 'undefined' ? window.innerWidth - rect.right : 999;
  const gap = 6 - overlap;
  const left = spaceRight >= popupWidth + 12 ? rect.right + gap : rect.left - popupWidth - gap;
  return { left, top: rect.top };
}

/** Position context menu near cursor without leaving the viewport. */
function getVoicePopupPositionAtCursor(clientX: number, clientY: number, popupWidth: number): { left: number; top: number } {
  const pad = 6;
  const estHeight = 140;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
  let left = clientX;
  let top = clientY;
  if (left + popupWidth + pad > vw) left = Math.max(pad, vw - popupWidth - pad);
  if (top + estHeight + pad > vh) top = Math.max(pad, vh - estHeight - pad);
  if (left < pad) left = pad;
  if (top < pad) top = pad;
  return { left, top };
}

export function ChannelList({
  taskRecorderActive = false,
  serverId,
  serverName,
  serverOwnerId,
  serverIconUrl,
  canAccessServer = true,
  currentUsername,
  channels,
  selectedChannel,
  onSelectChannel,
  onCreateChannel,
  onRenameChannel,
  onDeleteChannel,
  onDeleteServer,
  onAddMember,
  joinRequestMessage,
  onRequestJoin,
  onClearJoinRequestMessage,
  voiceChannelState = {},
  speakingClientIds = new Set(),
  screenSharingClientIds = new Set(),
  currentVoiceChannelId,
  onJoinVoiceChannel,
  myClientId,
  userColors = {},
  avatarCacheBust,
  voiceMuted = false,
  voiceDeafened = false,
  onVoiceMute,
  onVoiceDeafen,
  onVoiceLeave,
  peerVolumes = {},
  onPeerVolumeChange,
  isFriendsView = false,
  incomingFriendRequests = [],
  onAcceptFriendRequest,
  onDeclineFriendRequest,
  onRequestFriend,
  onRefreshFriends,
  onCreateInvite,
  canDeleteServer = false,
  canManageChannels = false,
  onOpenSettings,
  serverRoles = [],
  onSetChannelMinRole,
  onOpenRolesModal,
  onReorderChannels,
  onSetServerIcon,
  onOpenProfile,
}: ChannelListProps) {
  const { getServerChatBackground, setServerChatBackground, serverChatBackgroundVersion } = useSettings()!;
  const serverBg = getServerChatBackground(serverId);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const customBgInputRef = useRef<HTMLInputElement>(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [menuChannelId, setMenuChannelId] = useState<string | null>(null);
  const [channelMenuPosition, setChannelMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [voiceMemberMenu, setVoiceMemberMenu] = useState<{ clientId: string; userName: string; isSelf: boolean } | null>(null);
  const [voicePopupPosition, setVoicePopupPosition] = useState<{ left: number; top: number } | null>(null);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const [serverMenuAnchor, setServerMenuAnchor] = useState<DOMRect | null>(null);
  const [serverIconEditorOpen, setServerIconEditorOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberUsername, setNewMemberUsername] = useState('');
  const [renameChannelId, setRenameChannelId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [friendRequestUsername, setFriendRequestUsername] = useState('');
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [volumeSliderValue, setVolumeSliderValue] = useState(100); // 0–200 scale for peer volume
  const [localChannels, setLocalChannels] = useState<ChannelInfo[]>(channels);
  const lastReorderAtRef = useRef<number>(0);
  const isServerOwner = serverOwnerId && currentUsername === serverOwnerId;

  const REORDER_GRACE_MS = 1200;
  useEffect(() => {
    const now = Date.now();
    if (now - lastReorderAtRef.current >= REORDER_GRACE_MS) {
      setLocalChannels(channels);
    }
  }, [channels]);
  useEffect(() => {
    setLocalChannels(channels);
    lastReorderAtRef.current = 0;
  }, [serverId]);

  useEffect(() => {
    if (!canManageChannels) {
      setMenuChannelId(null);
      setChannelMenuPosition(null);
      setShowAddChannel(false);
    }
  }, [canManageChannels]);

  const canReorder = !!onReorderChannels;

  // Keep volume slider in sync when opening the popup for a peer (avoids controlled-input fighting re-renders during drag)
  useEffect(() => {
    if (voiceMemberMenu && !voiceMemberMenu.isSelf && voiceMemberMenu.clientId) {
      const v = (peerVolumes[voiceMemberMenu.clientId] ?? 1) * 100;
      setVolumeSliderValue(Math.min(200, Math.max(0, Number.isFinite(v) ? v : 100)));
    }
  }, [voiceMemberMenu?.clientId, voiceMemberMenu?.isSelf, peerVolumes]);

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newChannelName.trim();
    if (name && serverId) {
      onCreateChannel(name, newChannelType);
      setNewChannelName('');
      setShowAddChannel(false);
    }
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (name && renameChannelId) {
      onRenameChannel(renameChannelId, name);
      setRenameChannelId(null);
      setRenameValue('');
    }
  };

  useEffect(() => {
    const closeMenus = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.channel-context-menu') || t.closest('.channel-item-menu') || t.closest('.channel-options-popup') || t.closest('.voice-member-popup') || t.closest('.channel-voice-member') || t.closest('.server-menu-portal') || t.closest('.channels-header-with-menu') || t.closest('.channel-header-actions') || t.closest('[data-server-menu-trigger]') || t.closest('.user-controls-bar') || t.closest('.user-ctrl-dropdown')) return;
      if (taskRecorderActive) taskLog('app', 'Document mousedown: closing all menus (deferred click outside)', { target: describeElement(t), phase: 'capture' });
      window.setTimeout(() => {
        setMenuChannelId(null);
        setChannelMenuPosition(null);
        setServerMenuOpen(false);
        setServerMenuAnchor(null);
        setVoiceMemberMenu(null);
        setVoicePopupPosition(null);
      }, 0);
    };
    document.addEventListener('mousedown', closeMenus, true);
    return () => {
      document.removeEventListener('mousedown', closeMenus, true);
    };
  }, [taskRecorderActive]);

  useEffect(() => {
    if (taskRecorderActive && serverMenuOpen && serverMenuAnchor) {
      taskLog('app', 'Server menu portal: rendering (createPortal to body)', {
        left: serverMenuAnchor.left,
        top: serverMenuAnchor.bottom + 4,
      });
    }
  }, [taskRecorderActive, serverMenuOpen, serverMenuAnchor]);

  if (!serverId) {
    return (
      <div className="channels-panel">
        <div className="channels-header">Channels</div>
        <div className="channel-list">
          <p style={{ padding: 16, color: 'var(--text-secondary)' }}>
            Select or create a server
          </p>
        </div>
      </div>
    );
  }

  if (!canAccessServer && !isFriendsView) {
    return (
      <div className="channels-panel">
        <div className="channels-header">{serverName || 'Server'}</div>
        <div className="channel-list channel-list-no-access">
          <button
            type="button"
            className="channel-list-request-join"
            onClick={() => { onRequestJoin?.(); onClearJoinRequestMessage?.(); }}
            disabled={!onRequestJoin}
          >
            Request to join
          </button>
          <p className="channel-list-not-whitelisted">
            You don&apos;t have access to this server. The server owner can accept or decline in the admin panel (🛡).
          </p>
          {joinRequestMessage && (
            <p className="channel-list-join-msg">{joinRequestMessage}</p>
          )}
        </div>
      </div>
    );
  }

  if (isFriendsView) {
    return (
      <div className="channels-panel">
        <div className="channels-header">{serverName || 'Friends'}</div>
        <div className="channel-list">
          <div className="friends-section">
            <button
              type="button"
              className="friends-section-header"
              onClick={() => setShowFriendRequests(!showFriendRequests)}
              aria-expanded={showFriendRequests}
            >
              Friend requests
              {incomingFriendRequests.length > 0 && (
                <span className="friends-badge">{incomingFriendRequests.length}</span>
              )}
            </button>
            {showFriendRequests && (
              <div className="friends-requests-list">
                {incomingFriendRequests.length === 0 ? (
                  <p className="friends-empty">No pending requests</p>
                ) : (
                  incomingFriendRequests.map((fromUsername) => (
                    <div key={fromUsername} className="friends-request-item">
                      <span style={userColors[fromUsername] ? { color: userColors[fromUsername] } : undefined}>{fromUsername}</span>
                      <div className="friends-request-actions">
                        <button type="button" onClick={() => { onAcceptFriendRequest?.(fromUsername); onRefreshFriends?.(); }}>Accept</button>
                        <button type="button" onClick={() => { onDeclineFriendRequest?.(fromUsername); onRefreshFriends?.(); }}>Decline</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <form
            className="channel-add-form friends-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              const u = friendRequestUsername.trim();
              if (u && onRequestFriend) {
                onRequestFriend(u);
                setFriendRequestUsername('');
              }
            }}
          >
            <input
              type="text"
              value={friendRequestUsername}
              onChange={(e) => setFriendRequestUsername(e.target.value)}
              placeholder="Add friend by username"
              className="channel-add-input"
              maxLength={64}
            />
            <button type="submit" className="channel-add-submit-inline">Request</button>
          </form>
          <div className="channel-list-category">Direct messages</div>
          {channels.map((ch) => (
            <div key={ch.id} className="channel-item-wrap">
              <div
                role="button"
                tabIndex={0}
                className={`channel-item ${selectedChannel?.id === ch.id ? 'active' : ''}`}
                onClick={() => onSelectChannel(selectedChannel?.id === ch.id ? null : ch)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectChannel(selectedChannel?.id === ch.id ? null : ch);
                  }
                }}
              >
                <span className="icon" aria-hidden><IconHash /></span>
                <span className="channel-item-name-wrap" style={userColors[ch.name] ? { color: userColors[ch.name] } : undefined}>
                  {ch.name}
                </span>
              </div>
            </div>
          ))}
          {channels.length === 0 && (
            <p className="friends-empty">No friends yet. Send a request above.</p>
          )}
        </div>
      </div>
    );
  }

  const closeServerMenu = () => {
    setServerMenuOpen(false);
    setServerMenuAnchor(null);
  };

  const handleChannelDragEnd = (result: { destination: { index: number } | null; source: { index: number } }) => {
    if (!onReorderChannels || !result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    const reordered = reorderChannels(localChannels, source.index, destination.index);
    lastReorderAtRef.current = Date.now();
    setLocalChannels(reordered);
    onReorderChannels(reordered.map((c) => c.id));
    setTimeout(() => { lastReorderAtRef.current = 0; }, REORDER_GRACE_MS);
  };

  return (
    <div className="channels-panel">
      <div className="channels-header-wrap">
        <div className="channels-header channels-header-with-menu">
          <span>{serverName || 'Server'}</span>
          <div className="channel-header-actions">
            {canManageChannels && (
              <button
                type="button"
                className="channel-header-btn"
                onClick={() => setShowAddChannel(true)}
                title="Add channel"
                aria-label="Add channel"
              >
                +
              </button>
            )}
            <button
              type="button"
              className="channel-header-btn server-menu-trigger-btn"
              data-server-menu-trigger
              title="Server options"
              aria-label="Server options"
              aria-haspopup="menu"
              aria-expanded={serverMenuOpen}
              onMouseDown={(e) => {
                if (taskRecorderActive) taskLog('click', 'Server menu trigger: mousedown fired', { serverMenuOpen });
                e.preventDefault();
                e.stopPropagation();
                if (serverMenuOpen) {
                  if (taskRecorderActive) taskLog('app', 'Server menu: closing (toggle)');
                  closeServerMenu();
                  return;
                }
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                if (taskRecorderActive) taskLog('app', 'Server menu: scheduling open (setTimeout 0)', { left: rect.left, top: rect.bottom });
                setTimeout(() => {
                  setServerMenuAnchor(rect);
                  setServerMenuOpen(true);
                  if (taskRecorderActive) taskLog('app', 'Server menu: setState(open=true, anchor=rect)');
                }, 0);
              }}
              onClick={(e) => {
                if (taskRecorderActive) taskLog('click', 'Server menu trigger: click fired', { serverMenuOpen });
                e.preventDefault();
                e.stopPropagation();
                if (serverMenuOpen) return;
                const el = e.currentTarget;
                const rect = el.getBoundingClientRect();
                setServerMenuAnchor(rect);
                setServerMenuOpen(true);
                if (taskRecorderActive) taskLog('app', 'Server menu: setState(open=true) from onClick');
              }}
            >
              ⋮
            </button>
          </div>
        </div>
      </div>
      {serverIconEditorOpen && serverId && onSetServerIcon && createPortal(
        <ServerIconEditor
          serverName={serverName}
          onApply={(dataUrl) => {
            onSetServerIcon(serverId, dataUrl);
            setServerIconEditorOpen(false);
          }}
          onCancel={() => setServerIconEditorOpen(false)}
        />,
        document.getElementById('portal-root') || document.body
      )}
      {serverMenuOpen && serverMenuAnchor && createPortal(
        <>
          <div
            className="voice-member-popup-backdrop server-menu-backdrop"
            style={{ zIndex: 10000 }}
            aria-hidden
            onClick={closeServerMenu}
          />
          <div
            className="channel-context-menu server-context-menu server-menu-portal"
            style={{
              position: 'fixed',
              left: serverMenuAnchor.left,
              top: serverMenuAnchor.bottom + 4,
              zIndex: 10001,
              minWidth: POPUP_WIDTH,
            }}
            role="menu"
          >
            <div className="server-menu-customize-row" onMouseDown={(e) => e.stopPropagation()}>
              <label className="server-menu-label">Chat background (this server)</label>
              <select
                className="server-menu-select"
                value={serverBg.background}
                onChange={(e) => {
                  const v = (e.target.value as ChatBackgroundId) || 'default';
                  setServerChatBackground(serverId, v);
                  if (v === 'custom') customBgInputRef.current?.click();
                }}
                aria-label="Chat background"
              >
                {CHAT_BACKGROUND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {serverBg.background === 'custom' && (
                <div className="server-menu-custom-image">
                  <input
                    ref={customBgInputRef}
                    type="file"
                    accept="image/*"
                    className="server-menu-file-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && serverId) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = reader.result as string;
                          if (dataUrl.startsWith('data:image/')) setServerChatBackground(serverId, 'custom', dataUrl, serverBg.imageFit);
                        };
                        reader.readAsDataURL(file);
                      }
                      e.target.value = '';
                    }}
                    aria-label="Upload background image"
                  />
                  <button
                    type="button"
                    className="server-menu-upload-btn"
                    onClick={() => customBgInputRef.current?.click()}
                  >
                    {serverBg.imageUrl ? 'Change image' : 'Upload image'}
                  </button>
                  <label className="server-menu-label" style={{ marginTop: 8 }}>Image fit</label>
                  <select
                    className="server-menu-select"
                    value={serverBg.imageFit}
                    onChange={(e) => {
                      const fit = (e.target.value as BackgroundImageFit) || 'fill';
                      setServerChatBackground(serverId, 'custom', serverBg.imageUrl || undefined, fit);
                    }}
                    aria-label="Background image fit"
                  >
                    {BACKGROUND_IMAGE_FIT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {isServerOwner && serverId && onSetServerIcon && (
              <button
                type="button"
                onClick={() => {
                  setServerIconEditorOpen(true);
                  closeServerMenu();
                }}
              >
                Upload server icon
              </button>
            )}
            {isServerOwner && serverIconUrl && onSetServerIcon && (
              <button
                type="button"
                onClick={() => {
                  serverId && onSetServerIcon(serverId, '');
                  closeServerMenu();
                }}
              >
                Remove server icon
              </button>
            )}
            {isServerOwner && onCreateInvite && (
              <button type="button" onClick={() => { onCreateInvite(); closeServerMenu(); }}>
                Invite people
              </button>
            )}
            {isServerOwner && onAddMember && (
              <button type="button" onClick={() => { setShowAddMember(true); closeServerMenu(); }}>
                Add member
              </button>
            )}
            {isServerOwner && onOpenRolesModal && (
              <button type="button" onClick={() => { onOpenRolesModal(); closeServerMenu(); }}>
                Roles
              </button>
            )}
            {canDeleteServer && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Delete this server? This cannot be undone.')) {
                    onDeleteServer();
                  }
                  closeServerMenu();
                }}
              >
                Delete server
              </button>
            )}
            <button type="button" onClick={closeServerMenu}>Cancel</button>
          </div>
        </>,
        document.getElementById('portal-root') || document.body
      )}
      {showAddMember && onAddMember && (
        <form
          className="channel-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            const u = newMemberUsername.trim();
            if (u) { onAddMember(u); setNewMemberUsername(''); setShowAddMember(false); }
          }}
        >
          <input
            type="text"
            value={newMemberUsername}
            onChange={(e) => setNewMemberUsername(e.target.value)}
            placeholder="Username to add"
            className="channel-add-input"
          />
          <div className="channel-add-buttons">
            <button type="button" onClick={() => setShowAddMember(false)}>Cancel</button>
            <button type="submit">Add</button>
          </div>
        </form>
      )}
      <div className="channel-list">
        {canManageChannels && showAddChannel && (
          <form onSubmit={handleAddChannel} className="channel-add-form">
            <div className="channel-add-type-row" role="group" aria-label="Channel type">
              <button
                type="button"
                className={`channel-add-type-btn ${newChannelType === 'text' ? 'channel-add-type-btn-active' : ''}`}
                onClick={() => setNewChannelType('text')}
              >
                Text
              </button>
              <button
                type="button"
                className={`channel-add-type-btn ${newChannelType === 'voice' ? 'channel-add-type-btn-active' : ''}`}
                onClick={() => setNewChannelType('voice')}
              >
                Voice
              </button>
            </div>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Channel name"
              className="channel-add-input"
              autoFocus
              maxLength={100}
            />
            <div className="channel-add-buttons">
              <button type="button" onClick={() => setShowAddChannel(false)}>Cancel</button>
              <button type="submit">Add</button>
            </div>
          </form>
        )}
        <DragDropContext onDragEnd={handleChannelDragEnd}>
          <Droppable droppableId="channels">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {localChannels.map((ch, index) => (
                  <Draggable key={ch.id} draggableId={ch.id} index={index} isDragDisabled={!canReorder} disableInteractiveElementBlocking={canReorder}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...(canReorder && provided.dragHandleProps ? provided.dragHandleProps : {})}
                        className={`channel-item-wrap ${selectedChannel?.id === ch.id ? 'active' : ''} ${snapshot.isDragging ? 'channel-dragging' : ''} ${canReorder ? 'channel-draggable' : ''}`}
                      >
                        {canReorder && (
                          <span
                            className="channel-drag-handle channel-drag-handle-invisible"
                            title="Drag to reorder"
                            aria-label="Drag to reorder channel"
                          />
                        )}
                          {renameChannelId === ch.id ? (
              <form onSubmit={handleRenameSubmit} className="channel-rename-form">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="channel-rename-input"
                  autoFocus
                  onBlur={() => {
                    if (renameValue.trim()) onRenameChannel(ch.id, renameValue.trim());
                    setRenameChannelId(null);
                    setRenameValue('');
                  }}
                />
              </form>
            ) : (
              <>
                <div className="channel-item-outer">
                  <div className="channel-item-row">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`channel-item ${selectedChannel?.id === ch.id ? 'active' : ''} ${ch.type === 'voice' && currentVoiceChannelId === ch.id ? 'in-voice' : ''}`}
                      onClick={() => {
                        if (ch.type === 'voice') {
                          if (currentVoiceChannelId === ch.id) {
                            onSelectChannel(ch);
                          } else {
                            onSelectChannel(ch);
                            onJoinVoiceChannel?.(ch.id);
                          }
                        } else {
                          onSelectChannel(selectedChannel?.id === ch.id ? null : ch);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (ch.type === 'voice') {
                            if (currentVoiceChannelId === ch.id) onSelectChannel(ch);
                            else { onSelectChannel(ch); onJoinVoiceChannel?.(ch.id); }
                          } else {
                            onSelectChannel(selectedChannel?.id === ch.id ? null : ch);
                          }
                        }
                      }}
                    >
                      <span className="icon" aria-hidden>{ch.type === 'voice' ? <IconHeadphones /> : <IconHash />}</span>
                      <span className="channel-item-name-wrap">{ch.name}</span>
                    </div>
                    {canManageChannels && (
                      <button
                        type="button"
                        className="channel-item-menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuChannelId === ch.id) {
                            setMenuChannelId(null);
                            setChannelMenuPosition(null);
                          } else {
                            setMenuChannelId(ch.id);
                            setChannelMenuPosition(getPopupPosition(e.currentTarget.getBoundingClientRect(), POPUP_WIDTH));
                          }
                        }}
                        aria-label="Channel options"
                      >
                        ⋮
                      </button>
                    )}
                  </div>
                  {ch.type === 'voice' && (voiceChannelState[ch.id]?.length ?? 0) > 0 && (
                    <ul className="channel-voice-members">
                      {sortVoiceMembersByJoinedAt(voiceChannelState[ch.id] ?? []).map((m) => (
                        <li
                          key={m.clientId}
                          className={`channel-voice-member ${voiceMemberMenu?.clientId === m.clientId ? 'menu-open' : ''}`}
                          title="Right-click for volume / disconnect"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setVoiceMemberMenu({ clientId: m.clientId, userName: m.userName, isSelf: m.clientId === myClientId });
                            setVoicePopupPosition(getVoicePopupPositionAtCursor(e.clientX, e.clientY, POPUP_WIDTH));
                          }}
                        >
                          <div className={`channel-voice-member-avatar ${speakingClientIds.has(m.clientId) ? 'speaking' : ''}`}>
                            <Avatar
                              username={m.userName}
                              cacheBust={avatarCacheBust}
                              imgClassName="channel-voice-member-avatar-img"
                              initialClassName="channel-voice-member-avatar-initial"
                            />
                          </div>
                          <span className="channel-voice-member-name">
                            <span
                              className="channel-voice-member-name-text"
                              style={userColors[m.userName] ? { color: userColors[m.userName] } : undefined}
                            >
                              {m.userName}
                            </span>
                            {m.deafened ? (
                              <span className="channel-voice-member-state-icon" title="Deafened" aria-hidden>
                                <IconVolumeX />
                              </span>
                            ) : m.muted ? (
                              <span className="channel-voice-member-state-icon" title="Microphone muted" aria-hidden>
                                <IconMicOff />
                              </span>
                            ) : null}
                            {currentVoiceChannelId === ch.id && screenSharingClientIds.has(m.clientId) && <span className="voice-member-sharing-icon" title="Sharing screen">📺</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
      </div>
      {menuChannelId && channelMenuPosition && (() => {
        const ch = channels.find((c) => c.id === menuChannelId);
        if (!ch) return null;
        const close = () => { setMenuChannelId(null); setChannelMenuPosition(null); };
        const { left, top } = channelMenuPosition;
        const rolesSorted = [...serverRoles].sort((a, b) => a.weight - b.weight);
        const canSetMinRole = canManageChannels && ch.type === 'text';
        return createPortal(
          <>
            <div className="voice-member-popup-backdrop" aria-hidden onClick={close} />
            <div
              className="voice-member-popup channel-options-popup"
              style={{
                position: 'fixed',
                left,
                top,
                zIndex: 1001,
              }}
            >
              <div className="voice-member-popup-inner">
                {canManageChannels && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameChannelId(ch.id);
                      setRenameValue(ch.name);
                      close();
                    }}
                  >
                    Rename
                  </button>
                )}
                {canSetMinRole && onSetChannelMinRole && (
                  <div className="channel-lock-row" onClick={(e) => e.stopPropagation()}>
                    <label className="channel-lock-label">Minimum role to send:</label>
                    <select
                      className="channel-lock-select"
                      value={ch.minRoleWeight ?? 9998}
                      onChange={(e) => {
                        const v = e.target.value;
                        onSetChannelMinRole(ch.id, v === '9998' ? undefined : Number(v));
                        close();
                      }}
                    >
                      <option value={9998}>Everyone</option>
                      {rolesSorted.filter((r) => r.weight < 9998).map((r) => (
                        <option key={r.id} value={r.weight}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {canManageChannels && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteChannel(ch.id);
                      if (selectedChannel?.id === ch.id) onSelectChannel(null);
                      close();
                    }}
                  >
                    Delete channel
                  </button>
                )}
                <button type="button" onClick={close}>Cancel</button>
          </div>
        </div>
        </>,
        document.getElementById('portal-root') || document.body
        );
      })()}
      {voiceMemberMenu && voicePopupPosition && (() => {
        const { left, top } = voicePopupPosition;
        const closeVoice = () => {
          setVoiceMemberMenu(null);
          setVoicePopupPosition(null);
        };
        return createPortal(
        <>
          <div className="voice-member-popup-backdrop voice-member-popup-backdrop--pass-through" aria-hidden />
          <div
            className="voice-member-popup"
            style={{
              position: 'fixed',
              left,
              top,
              zIndex: 1001,
            }}
          >
          <div
            className="voice-member-popup-inner"
          >
            {onOpenProfile && (
              <button
                type="button"
                onClick={() => {
                  onOpenProfile(voiceMemberMenu.userName);
                  closeVoice();
                }}
              >
                Profile
              </button>
            )}
            {voiceMemberMenu.isSelf ? (
              <button type="button" onClick={() => { onVoiceLeave?.(); closeVoice(); }}>
                Disconnect
              </button>
            ) : (
              <div className="channel-voice-volume-row" onMouseDown={(e) => e.stopPropagation()}>
                <label>Volume</label>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={Number.isFinite(volumeSliderValue) ? Math.min(200, Math.max(0, volumeSliderValue)) : 100}
                  onChange={(e) => {
                    try {
                      const id = voiceMemberMenu?.clientId;
                      if (typeof id !== 'string' || !id) return;
                      const raw = Number((e.target as HTMLInputElement).value);
                      const val = Math.min(200, Math.max(0, Number.isFinite(raw) ? raw : 100));
                      setVolumeSliderValue(val);
                      const vol = val / 100;
                      onPeerVolumeChange?.(id, Math.min(2, Math.max(0, vol)));
                    } catch (_) {}
                  }}
                />
              </div>
            )}
            <button type="button" onClick={closeVoice}>
              Close
            </button>
          </div>
        </div>
        </>,
        document.getElementById('portal-root') || document.body
        );
      })()}
    </div>
  );
}
