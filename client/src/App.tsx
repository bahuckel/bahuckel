import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import { ServerList } from './components/ServerList';
import { ChannelList } from './components/ChannelList';
import { UserControlsBar } from './components/UserControlsBar';
import { ChatArea } from './components/ChatArea';
import { ChatEmptyState } from './components/ChatEmptyState';
import { ChatHeader } from './components/ChatHeader';
import { UsersPanel } from './components/UsersPanel';
import { RolesModal } from './components/RolesModal';
import { VoicePanel } from './components/VoicePanel';
import { LoginModal } from './components/LoginModal';
import { SettingsPanel } from './components/SettingsPanel';
import { useSocket } from './context/SocketContext';
import { SESSION_TOKEN_KEY } from './constants';
import { loadEmojiCodepointsFromServer } from './emoji';
import { TaskRecorderLog } from './components/TaskRecorderLog';
import { useSettings } from './context/SettingsContext';
import { taskLog, describeElement } from './utils/taskRecorder';
import { Avatar } from './components/Avatar';
import { IconUsers } from './components/UiIcons';
import { persistServerBaseFromUrl } from './utils/avatarUrl';
import { playVoiceLeaveSound } from './utils/sound';
import { normalizeVoiceChannelStateMap, sortVoiceMembersByJoinedAt, type VoiceChannelMemberRow } from './utils/voiceChannelOrder';
import { dmChannelId, dmVoiceChannelId, parseDmVoicePeer } from './utils/dmChannel';
import { ProfileModal } from './components/ProfileModal';
import { IncomingDmVoiceModal } from './components/IncomingDmVoiceModal';

export interface ServerInfo {
  id: string;
  name: string;
  ownerId?: string;
  members?: string[];
  kicked?: string[];
  canAccess?: boolean;
  canManageChannels?: boolean;
  myRoleWeight?: number;
  iconUrl?: string;
  roles?: { id: string; name: string; weight: number; permissions?: Record<string, boolean> }[];
  memberRoles?: Record<string, string>;
  onlineMembers?: string[];
}

export interface ChannelInfo {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  minRoleWeight?: number;
}

export const FRIENDS_SERVER_ID = 'friends';

export default function App() {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelInfo | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLockedUntil, setLoginLockedUntil] = useState<number | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [joinRequestMessage, setJoinRequestMessage] = useState<string | null>(null);
  const [userColors, setUserColors] = useState<Record<string, string>>({});
  const [avatarCacheBust, setAvatarCacheBust] = useState(() => Date.now());
  const [voiceChannelState, setVoiceChannelState] = useState<Record<string, VoiceChannelMemberRow[]>>({});
  /** First server in the instance (main hub); sub-servers follow in the sidebar after a divider. */
  const [mainServerId, setMainServerId] = useState<string>('');
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const currentVoiceChannelIdRef = useRef<string | null>(null);
  const [incomingDmVoiceCall, setIncomingDmVoiceCall] = useState<{ channelId: string; fromUsername: string } | null>(null);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceDeafened, setVoiceDeafened] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<string[]>([]);
  const [lastMessageByFriend, setLastMessageByFriend] = useState<Record<string, string>>({});
  const [inviteResult, setInviteResult] = useState<{ code: string; link: string; webLink?: string } | null>(null);
  const [showJoinInvite, setShowJoinInvite] = useState(false);
  const [usersPanelOpen, setUsersPanelOpen] = useState(false);
  const [rolesModalOpen, setRolesModalOpen] = useState(false);
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false);
  const [profileModalUsername, setProfileModalUsername] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<{ id: string; serverId: string; serverName: string; username: string; requestedAt: string }[]>([]);
  const [joinInviteCode, setJoinInviteCode] = useState('');
  const [joinInviteError, setJoinInviteError] = useState<string | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const [hasLocalScreenShare, setHasLocalScreenShare] = useState(false);
  const [screenShareOptions, setScreenShareOptions] = useState<{ bitrate?: number } | null>(null);
  const [speakingClientIds, setSpeakingClientIds] = useState<Set<string>>(new Set());
  const [screenShareVideoCount, setScreenShareVideoCount] = useState(0);
  const [screenSharingClientIds, setScreenSharingClientIds] = useState<Set<string>>(new Set());
  const [viewingSharedFromClientId, setViewingSharedFromClientId] = useState<string | null>(null);
  const [screenShareFullscreen, setScreenShareFullscreen] = useState(false);
  const hasScreenShare = screenShareVideoCount > 0 || hasLocalScreenShare;
  const { settings, setScreenShareVolume, setAvatar } = useSettings();

  const { clientId, send, ready, connectionStatus, subscribe, pingMs } = useSocket();
  const restoreSentRef = useRef(false);

  useEffect(() => {
    currentVoiceChannelIdRef.current = currentVoiceChannelId;
  }, [currentVoiceChannelId]);

  useEffect(() => {
    if (!incomingDmVoiceCall) return;
    const raw = voiceChannelState[incomingDmVoiceCall.channelId];
    if (raw === undefined) return;
    const callerStillThere = raw.some(
      (m) => m.userName.toLowerCase() === incomingDmVoiceCall.fromUsername.toLowerCase(),
    );
    if (!callerStillThere) setIncomingDmVoiceCall(null);
  }, [voiceChannelState, incomingDmVoiceCall]);
  const screenShareContainerRef = useRef<HTMLDivElement | null>(null);
  const screenShareAreaRef = useRef<HTMLDivElement | null>(null);

  // Clear screen share container when no one is sharing (TASK 1 & 3)
  useEffect(() => {
    if (!hasScreenShare) {
      const el = screenShareContainerRef.current ?? document.getElementById('voice-screen-share-main');
      if (el) {
        el.innerHTML = '';
      }
      setViewingSharedFromClientId(null);
      setScreenShareFullscreen(false);
    }
  }, [hasScreenShare]);

  // viewingSharedFromClientId logic: first share auto-select, viewed share ends => switch or null (TASK 2)
  // When we're sharing (screenShareStream) but server hasn't updated yet, optimistically show own share
  useEffect(() => {
    const ids = [...screenSharingClientIds];
    if (ids.length === 0) {
      if (hasLocalScreenShare && screenShareStreamRef.current && clientId) {
        setViewingSharedFromClientId(clientId);
      } else {
        setViewingSharedFromClientId(null);
      }
      return;
    }
    setViewingSharedFromClientId((prev) => {
      if (prev === null) return ids[0];
      if (ids.includes(prev)) return prev;
      return ids[0] ?? null;
    });
  }, [screenSharingClientIds, hasLocalScreenShare, clientId]);

  // Fullscreen: use Electron window fullscreen when available (fixes click handling); otherwise Fullscreen API
  const bahuckel = typeof window !== 'undefined' ? (window as Window & { bahuckel?: { setWindowFullscreen?: (v: boolean) => void; onWindowFullscreenChange?: (cb: (v: boolean) => void) => () => void; exitFullscreen?: () => void } }).bahuckel : undefined;

  useEffect(() => {
    if (bahuckel?.onWindowFullscreenChange) {
      return bahuckel.onWindowFullscreenChange((v) => setScreenShareFullscreen(v));
    }
    const getFullscreenEl = () =>
      document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    const onFullscreenChange = () => setScreenShareFullscreen(!!getFullscreenEl());
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [bahuckel?.onWindowFullscreenChange]);

  useEffect(() => {
    const getFullscreenEl = () =>
      document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (bahuckel?.exitFullscreen) {
          (window as Window & { bahuckel?: { exitFullscreen?: () => void } }).bahuckel?.exitFullscreen?.();
        } else if (getFullscreenEl()) {
          (document.exitFullscreen || (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen)?.();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bahuckel?.exitFullscreen]);
  const [emojiCodepointsList, setEmojiCodepointsList] = useState<string[]>([]);
  const emojiCodepointsReady = emojiCodepointsList.length > 0;

  useEffect(() => {
    persistServerBaseFromUrl();
  }, []);

  // Load emoji codepoint list from server (same origin as /emoji/*.png). Picker and images use this list only.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 5;
    const tryLoad = () => {
      loadEmojiCodepointsFromServer().then((list) => {
        if (cancelled) return;
        if (list.length > 0) setEmojiCodepointsList(list);
        else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryLoad, 1200);
        }
      });
    };
    tryLoad();
    return () => { cancelled = true; };
  }, []);

  // User has debug/admin panel access: global owner, or server owner, or role with accessAdminPanel
  const hasDebugPermission =
    userRole === 'owner' ||
    (!!username && servers.some((s) => s.ownerId === username)) ||
    (!!username &&
      servers.some((s) => {
        if (!s.canAccess) return false;
        const roleId = s.memberRoles?.[username.toLowerCase()];
        const role = s.roles?.find((r) => r.id === roleId);
        return !!role?.permissions?.accessAdminPanel;
      }));
  const taskRecorderActive = settings.taskRecorderEnabled && hasDebugPermission;

  /** Earliest voice join time per username on this server (for Users tab ordering). */
  const voiceJoinedAtByUsername = useMemo(() => {
    const map: Record<string, number> = {};
    if (!selectedServerId) return map;
    const serverChIds = new Set(channels.filter((c) => c.serverId === selectedServerId).map((c) => c.id));
    for (const [chId, members] of Object.entries(voiceChannelState)) {
      if (!serverChIds.has(chId)) continue;
      for (const m of members) {
        const key = m.userName.toLowerCase();
        const t = m.joinedAt ?? 0;
        if (t <= 0) continue;
        if (map[key] === undefined || t < map[key]) map[key] = t;
      }
    }
    return map;
  }, [selectedServerId, channels, voiceChannelState]);

  useEffect(() => {
    if (!taskRecorderActive) return;
    const onMouseDown = (e: MouseEvent) => {
      taskLog('input', 'mousedown', { target: describeElement(e.target) });
    };
    const onClick = (e: MouseEvent) => {
      taskLog('input', 'click', { target: describeElement(e.target) });
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [taskRecorderActive]);

  useEffect(() => {
    if (!taskRecorderActive) return;
    (window as Window & { __onPickerLog?: (d: { type: string; message: string; detail?: Record<string, unknown> }) => void }).__onPickerLog = (d) => {
      taskLog('picker', d.message, d.detail);
    };
    return () => {
      delete (window as Window & { __onPickerLog?: () => void }).__onPickerLog;
    };
  }, [taskRecorderActive]);

  // Open join modal when landing with ?invite=CODE (e.g. shared web link).
  useEffect(() => {
    if (typeof location === 'undefined' || typeof URLSearchParams === 'undefined') return;
    const params = new URLSearchParams(location.search);
    const code = params.get('invite')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (code) {
      setJoinInviteCode(code);
      setShowJoinInvite(true);
      const next = new URLSearchParams(params);
      next.delete('invite');
      const newSearch = next.toString();
      const newUrl = newSearch ? `${location.pathname || '/'}?${newSearch}` : location.pathname || '/';
      window.history.replaceState(null, '', newUrl);
    }
  }, []);

  // On disconnect, clear user state and restore flag so reconnect sends restore_session and server re-associates this clientId.
  useEffect(() => {
    if (!ready) {
      restoreSentRef.current = false;
      setUsername(null);
      setUserRole(null);
    }
  }, [ready]);

  const switchToFirstTextChannel = () => {
    if (selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && !canAccessSelected) {
      setSelectedChannel(null);
      return;
    }
    const chs = selectedServerId === FRIENDS_SERVER_ID
      ? [...friends].sort((a, b) => (lastMessageByFriend[b] ?? '').localeCompare(lastMessageByFriend[a] ?? ''))
          .map((friendName, position) => ({ id: dmChannelId(username ?? '', friendName), serverId: FRIENDS_SERVER_ID, name: friendName, type: 'text' as const, position }))
      : channels.filter((c) => c.serverId === selectedServerId).sort((a, b) => a.position - b.position);
    const firstText = chs.find((c) => c.type === 'text');
    setSelectedChannel(firstText ?? null);
  };

  const handleVoiceLeave = () => {
    playVoiceLeaveSound(settings.voiceLeaveSound, settings.voiceLeaveSoundUrl);
    const wasDmVoice = currentVoiceChannelId?.startsWith('dm-voice:');
    setCurrentVoiceChannelId(null);
    setVoiceMuted(false);
    setVoiceDeafened(false);
    if (!wasDmVoice) switchToFirstTextChannel();
  };

  const answerIncomingDmVoiceCall = useCallback(() => {
    if (!incomingDmVoiceCall || !username) return;
    const { channelId } = incomingDmVoiceCall;
    const friend = parseDmVoicePeer(channelId, username);
    if (!friend) return;
    setIncomingDmVoiceCall(null);
    setSelectedServerId(FRIENDS_SERVER_ID);
    setSelectedChannel({
      id: dmChannelId(username, friend),
      serverId: FRIENDS_SERVER_ID,
      name: friend,
      type: 'text',
      position: 0,
    });
    setCurrentVoiceChannelId(channelId);
  }, [incomingDmVoiceCall, username]);

  const setPeerVolume = (peerClientId: string, volume: number) => {
    setPeerVolumes((prev) => ({ ...prev, [peerClientId]: volume }));
  };

  useEffect(() => {
    if (!ready) return;
    if (username) {
      send({ type: 'get_servers_and_channels' });
      send({ type: 'get_friends_and_requests' });
      return;
    }
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
    if (token && !restoreSentRef.current) {
      restoreSentRef.current = true;
      send({ type: 'restore_session', token });
    }
  }, [ready, username, send]);

  useEffect(() => {
    if (!ready || !username) return;
    const canApprove = userRole === 'owner' || servers.some((s) => s.ownerId === username);
    if (canApprove) send({ type: 'get_join_requests' });
  }, [ready, username, servers, userRole, send]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'servers_and_channels') {
        setServers((msg.servers as ServerInfo[]) ?? []);
        setChannels((msg.channels as ChannelInfo[]) ?? []);
        setUserColors((msg.userColors as Record<string, string>) ?? {});
        setVoiceChannelState(normalizeVoiceChannelStateMap((msg.voiceState as Record<string, VoiceChannelMemberRow[]>) ?? {}));
        setMainServerId(typeof msg.mainServerId === 'string' ? msg.mainServerId : '');
      }
      if (msg.type === 'user_avatars_update') {
        setAvatarCacheBust(Date.now()); // Bust cache so all avatars (including old messages) re-fetch with new image
      }
      if (msg.type === 'voice_channel_state' && msg.channels && typeof msg.channels === 'object') {
        setVoiceChannelState(normalizeVoiceChannelStateMap(msg.channels as Record<string, VoiceChannelMemberRow[]>));
      }
      if (
        msg.type === 'incoming_dm_voice_call' &&
        typeof msg.channelId === 'string' &&
        typeof msg.fromUsername === 'string'
      ) {
        if (currentVoiceChannelIdRef.current === msg.channelId) return;
        setIncomingDmVoiceCall({ channelId: msg.channelId, fromUsername: msg.fromUsername });
      }
      if (msg.type === 'screen_share_ended' && typeof msg.clientId === 'string') {
        const endedId = msg.clientId as string;
        setScreenSharingClientIds((prev) => {
          const next = new Set(prev);
          next.delete(endedId);
          return next;
        });
        setViewingSharedFromClientId((prev) => (prev === endedId ? null : prev));
      }
      if (msg.type === 'user_color_changed' && typeof msg.username === 'string') {
        const u = msg.username;
        setUserColors((prev) => ({ ...prev, [u]: typeof msg.color === 'string' ? msg.color : '' }));
      }
      if (msg.type === 'user_set' && typeof msg.username === 'string') {
        setUsername(msg.username);
        setUserRole(typeof msg.role === 'string' ? msg.role : null);
        setLoginError(null);
        setAvatar(''); // Clear localStorage avatar - it's per-session, prevents new account inheriting previous user's avatar
        setAvatarCacheBust(Date.now()); // Bust cache so new account never sees previous user's cached avatar
        if (typeof msg.sessionToken === 'string' && msg.sessionToken && typeof localStorage !== 'undefined') {
          localStorage.setItem(SESSION_TOKEN_KEY, msg.sessionToken);
        }
      }
      if (msg.type === 'auth_error') {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_TOKEN_KEY);
        setLoginError(typeof msg.message === 'string' ? msg.message : 'Authentication failed');
        setLoginLockedUntil(typeof msg.lockedUntil === 'number' ? msg.lockedUntil : null);
      }
      if (msg.type === 'password_reset_token' && typeof msg.resetToken === 'string') {
        setResetToken(msg.resetToken);
      }
      if (msg.type === 'password_changed') {
        setResetToken(null);
      }
      if (msg.type === 'join_request_result') {
        setJoinRequestMessage(msg.ok ? 'Request sent. The server owner can accept or decline in the admin panel.' : (msg.error as string) ?? 'Request failed');
        if (msg.ok) send({ type: 'get_servers_and_channels' });
      }
      if (msg.type === 'join_requests' && Array.isArray(msg.requests)) {
        setJoinRequests(msg.requests as { id: string; serverId: string; serverName: string; username: string; requestedAt: string }[]);
      }
      if (msg.type === 'join_request_processed') {
        send({ type: 'get_join_requests' });
        send({ type: 'get_servers_and_channels' });
      }
      if (msg.type === 'friends_and_requests') {
        setFriends((msg.friends as string[]) ?? []);
        setIncomingFriendRequests((msg.incomingRequests as string[]) ?? []);
        setLastMessageByFriend((msg.lastMessageByFriend as Record<string, string>) ?? {});
      }
      if (msg.type === 'friend_request_processed') {
        send({ type: 'get_friends_and_requests' });
      }
      if (msg.type === 'new_message' && msg.message) {
        const m = msg.message as { channelId?: string; createdAt?: string };
        if (m.channelId?.startsWith('dm:') && m.createdAt && username) {
          const parts = m.channelId.split(':');
          if (parts.length === 3) {
            const other = parts[1] === username ? parts[2] : parts[1];
            setLastMessageByFriend((prev) => ({ ...prev, [other]: m.createdAt! }));
          }
        }
      }
      if (msg.type === 'invite_created' && msg.code && msg.link) {
        const code = msg.code as string;
        const base = typeof location !== 'undefined' ? `${location.origin}${location.pathname || '/'}` : '';
        const webLink = base ? `${base}${base.includes('?') ? '&' : '?'}invite=${encodeURIComponent(code)}` : '';
        setInviteResult({ code, link: msg.link as string, webLink });
      }
      if (msg.type === 'join_invite_result') {
        setJoinInviteError(msg.ok ? null : (msg.error as string) ?? null);
        if (msg.ok && msg.serverId) {
          setSelectedServerId(msg.serverId as string);
          setShowJoinInvite(false);
          setJoinInviteCode('');
          send({ type: 'get_servers_and_channels' });
        }
      }
    });
  }, [subscribe, send, username]);

  useEffect(() => {
    if (selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && !servers.some((s) => s.id === selectedServerId)) {
      setSelectedServerId(null);
      setSelectedChannel(null);
    }
  }, [servers, selectedServerId]);

  useEffect(() => {
    if (selectedChannel && selectedChannel.serverId !== FRIENDS_SERVER_ID && !channels.some((c) => c.id === selectedChannel.id)) {
      setSelectedChannel(null);
    }
  }, [channels, selectedChannel]);

  // Auto-open top text channel when selecting a server


  const handleLoggedIn = (_name: string) => {
    // Username is set from user_set in subscribe
  };

  const handleLogout = () => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
    if (token) send({ type: 'logout', token });
    if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_TOKEN_KEY);
    setAvatar(''); // Clear localStorage avatar immediately on logout - prevents next user inheriting it
    setUsername(null);
    setUserRole(null);
    setSettingsPanelOpen(false);
  };

  const channelsForServer = selectedServerId === FRIENDS_SERVER_ID
    ? [...friends]
        .sort((a, b) => {
          const ta = lastMessageByFriend[a] ?? '';
          const tb = lastMessageByFriend[b] ?? '';
          return tb.localeCompare(ta);
        })
        .map((friendName, position) => ({
          id: dmChannelId(username ?? '', friendName),
          serverId: FRIENDS_SERVER_ID,
          name: friendName,
          type: 'text' as const,
          position,
        }))
    : selectedServerId
      ? channels.filter((c) => c.serverId === selectedServerId).sort((a, b) => a.position - b.position)
      : [];
  const selectedServer = selectedServerId && selectedServerId !== FRIENDS_SERVER_ID ? servers.find((s) => s.id === selectedServerId) : null;

  // User has access to the selected server (Friends always; otherwise explicit canAccess === true)
  const canAccessSelected = selectedServerId === FRIENDS_SERVER_ID || selectedServer?.canAccess === true;

  const inDmFriendVoice = useMemo(
    () =>
      selectedServerId === FRIENDS_SERVER_ID &&
      selectedChannel?.type === 'text' &&
      !!username &&
      !!selectedChannel?.name &&
      !!currentVoiceChannelId &&
      currentVoiceChannelId === dmVoiceChannelId(username, selectedChannel.name),
    [selectedServerId, selectedChannel, username, currentVoiceChannelId]
  );

  const showVoiceConnectedPanel = !!(
    canAccessSelected &&
    selectedChannel &&
    ((selectedChannel.type === 'voice' && currentVoiceChannelId === selectedChannel.id) || inDmFriendVoice)
  );

  const voicePanelChannelName = useMemo(() => {
    if (!currentVoiceChannelId) return 'Voice';
    if (inDmFriendVoice && selectedChannel?.type === 'text') return `Voice — ${selectedChannel.name}`;
    return channels.find((c) => c.id === currentVoiceChannelId)?.name ?? 'Voice';
  }, [currentVoiceChannelId, inDmFriendVoice, selectedChannel, channels]);

  const voiceUiStateKey = useMemo(() => {
    if (!selectedChannel) return '';
    if (inDmFriendVoice && currentVoiceChannelId) return currentVoiceChannelId;
    return selectedChannel.id;
  }, [selectedChannel, inDmFriendVoice, currentVoiceChannelId]);

  /** Add server: global owner, empty instance, any server owner, or role with createServer on a server you belong to. */
  const canAddServer = useMemo(() => {
    if (!username) return false;
    if (userRole === 'owner') return true;
    const nonFriends = servers.filter((s) => s.id !== FRIENDS_SERVER_ID);
    if (nonFriends.length === 0) return true;
    const un = username.trim().toLowerCase();
    if (nonFriends.some((s) => s.ownerId && s.ownerId.trim().toLowerCase() === un)) return true;
    return nonFriends.some((server) => {
      const roleId = server.memberRoles?.[un];
      if (!roleId) return false;
      const role = server.roles?.find((r) => r.id === roleId);
      return !!(role?.permissions as { createServer?: boolean } | undefined)?.createServer;
    });
  }, [username, userRole, servers]);

  // Clear channel when no access or no server. Auto-select is done in click handlers.
  // This effect handles: server data updates (e.g. access revoked), or late-loading channels.
  useEffect(() => {
    if (!selectedServerId) {
      setSelectedChannel(null);
      return;
    }
    if (!canAccessSelected) {
      setSelectedChannel(null);
      return;
    }
    // When we have access but no channel selected yet (e.g. channels loaded after click), pick first text channel only
    if (channelsForServer.length > 0 && !selectedChannel) {
      const firstText = channelsForServer.find((c) => c.type === 'text');
      setSelectedChannel(firstText ?? null);
    }
  }, [selectedServerId, canAccessSelected, channels.length, friends.length, selectedChannel]);

  // Do NOT auto-join voice when selecting a voice channel - user must explicitly join

  return (
    <div className={`app ${currentVoiceChannelId ? 'voice-active' : ''}`}>
      {!username && (
        <LoginModal
          onLoggedIn={handleLoggedIn}
          send={send}
          subscribe={subscribe}
          ready={ready}
          connectionStatus={connectionStatus}
          loginError={loginError}
          loginLockedUntil={loginLockedUntil}
          clearLoginError={() => { setLoginError(null); setLoginLockedUntil(null); }}
          resetToken={resetToken}
          onPasswordChanged={() => setResetToken(null)}
        />
      )}
      {username && (
      <>
      {settingsPanelOpen && createPortal(
        <SettingsPanel
          onClose={() => setSettingsPanelOpen(false)}
          onLogout={handleLogout}
          send={send}
          subscribe={subscribe}
          isAdmin={userRole === 'owner' || (!!username && servers.some((s) => s.ownerId === username))}
          isGlobalOwner={userRole === 'owner'}
          hasDebugPermission={hasDebugPermission}
          servers={servers.filter((s) => s.ownerId === username || userRole === 'owner')}
          currentUsername={username ?? ''}
          avatarCacheBust={avatarCacheBust}
          onAvatarUpdate={() => setAvatarCacheBust(Date.now())}
        />,
        document.getElementById('portal-root') || document.body
      )}
      {profileModalUsername && username && (
        <ProfileModal
          username={profileModalUsername}
          myUsername={username}
          friends={friends}
          avatarCacheBust={avatarCacheBust}
          userColors={userColors}
          send={send}
          subscribe={subscribe}
          onClose={() => setProfileModalUsername(null)}
        />
      )}
      {incomingDmVoiceCall && username && (
        <IncomingDmVoiceModal
          fromUsername={incomingDmVoiceCall.fromUsername}
          avatarCacheBust={avatarCacheBust}
          userColors={userColors}
          onAnswer={answerIncomingDmVoiceCall}
          onDecline={() => setIncomingDmVoiceCall(null)}
        />
      )}
      {inviteResult && (
        <div className="modal-overlay" onClick={() => setInviteResult(null)}>
          <div className="modal-invite" onClick={(e) => e.stopPropagation()}>
            <h3>Invite to server</h3>
            <p>Share this link or code. Anyone with it can join.</p>
            {inviteResult.webLink && (
              <div className="modal-invite-row">
                <label className="modal-invite-label">Web link (open in browser)</label>
                <input readOnly value={inviteResult.webLink} className="modal-invite-input" />
                <button type="button" onClick={() => { navigator.clipboard.writeText(inviteResult.webLink!); }}>Copy link</button>
              </div>
            )}
            <div className="modal-invite-row">
              <input readOnly value={inviteResult.code} className="modal-invite-input modal-invite-code" />
              <button type="button" onClick={() => { navigator.clipboard.writeText(inviteResult.code); }}>Copy code</button>
            </div>
            <button type="button" onClick={() => setInviteResult(null)}>Close</button>
          </div>
        </div>
      )}
      {joinRequestsOpen && (
        <div className="modal-overlay" onClick={() => setJoinRequestsOpen(false)}>
          <div className="modal-invite join-requests-modal" onClick={(e) => e.stopPropagation()}>
            <h3>📋 Join requests</h3>
            <p>People requesting to join your servers.</p>
            {joinRequests.length === 0 ? (
              <p className="join-requests-empty">No pending requests</p>
            ) : (
              <ul className="join-requests-list">
                {joinRequests.map((r) => (
                  <li key={r.id} className="join-requests-item">
                    <div className="join-requests-item-info">
                      <span className="join-requests-username">{r.username}</span>
                      <span className="join-requests-server"> → {r.serverName}</span>
                    </div>
                    <div className="join-requests-actions">
                      <button
                        type="button"
                        onClick={() => {
                          send({ type: 'accept_join_request', requestId: r.id });
                          send({ type: 'get_join_requests' });
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          send({ type: 'decline_join_request', requestId: r.id });
                          send({ type: 'get_join_requests' });
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setJoinRequestsOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {showJoinInvite && (
        <div className="modal-overlay" onClick={() => { setShowJoinInvite(false); setJoinInviteError(null); }}>
          <div className="modal-invite" onClick={(e) => e.stopPropagation()}>
            <h3>Join a server</h3>
            <p>Enter an invite code or paste a link.</p>
            {!username && <p className="modal-invite-error">Log in first, then click Join.</p>}
            {joinInviteError && <p className="modal-invite-error">{joinInviteError}</p>}
            <input
              type="text"
              value={joinInviteCode}
              onChange={(e) => {
                let v = e.target.value;
                const match = v.match(/invite\/([A-Za-z0-9]+)/);
                if (match) v = match[1];
                setJoinInviteCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                const match = pasted.match(/invite\/([A-Za-z0-9]+)/);
                if (match) {
                  e.preventDefault();
                  setJoinInviteCode(match[1].toUpperCase().slice(0, 8));
                }
              }}
              placeholder="Invite code or paste link"
              className="modal-invite-input"
              maxLength={8}
            />
            <div className="modal-invite-buttons">
              <button type="button" onClick={() => { setShowJoinInvite(false); setJoinInviteError(null); }}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  const code = joinInviteCode.trim();
                  if (code) send({ type: 'join_by_invite', code });
                }}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="app-left">
        <div className="app-left-top">
          <aside className="servers-panel">
            {username && (
              <button
                type="button"
                className={`server-icon server-icon-friends ${selectedServerId === FRIENDS_SERVER_ID ? 'active' : ''}`}
                onClick={() => {
                  if (selectedServerId === FRIENDS_SERVER_ID) {
                    setSelectedServerId(null);
                    setSelectedChannel(null);
                  } else {
                    setSelectedServerId(FRIENDS_SERVER_ID);
                    send({ type: 'get_friends_and_requests' });
                    const sorted = [...friends].sort((a, b) => (lastMessageByFriend[b] ?? '').localeCompare(lastMessageByFriend[a] ?? ''));
                    const first = sorted[0];
                    const firstCh = first ? { id: dmChannelId(username ?? '', first), serverId: FRIENDS_SERVER_ID, name: first, type: 'text' as const, position: 0 } : null;
                    setSelectedChannel(firstCh);
                  }
                }}
                title="Friends"
                aria-label="Friends"
              >
                <IconUsers />
              </button>
            )}
            <ServerList
              servers={servers}
              mainServerId={mainServerId || undefined}
              selectedId={selectedServerId}
              onSelect={(id) => {
                setSelectedServerId(id);
                if (!id || id === FRIENDS_SERVER_ID) {
                  setSelectedChannel(null);
                  return;
                }
                const server = servers.find((s) => s.id === id);
                if (!server || server.canAccess !== true) {
                  setSelectedChannel(null);
                  return;
                }
                const chs = channels.filter((c) => c.serverId === id).sort((a, b) => a.position - b.position);
                const firstText = chs.find((c) => c.type === 'text');
                setSelectedChannel(firstText ?? null);
              }}
              onCreateServer={(name) => send({ type: 'create_server', name })}
              canAddServer={canAddServer}
              onJoinClick={() => setShowJoinInvite(true)}
              onReorderServers={username ? (serverIds) => {
                flushSync(() => {
                  setServers((prev) => {
                    const order = new Map(serverIds.map((id, i) => [id, i]));
                    return [...prev].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
                  });
                });
                send({ type: 'reorder_servers', serverIds });
                setTimeout(() => send({ type: 'get_servers_and_channels' }), 700);
              } : undefined}
            />
          </aside>
          <aside className="channels-panel">
            <div className="channels-panel-scroll">
        <ChannelList
          taskRecorderActive={taskRecorderActive}
          serverId={selectedServerId}
          serverName={selectedServerId === FRIENDS_SERVER_ID ? 'Friends' : selectedServer?.name}
          serverOwnerId={selectedServer?.ownerId}
          serverIconUrl={selectedServer?.iconUrl}
          canAccessServer={canAccessSelected}
          currentUsername={username}
          channels={channelsForServer}
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          isFriendsView={selectedServerId === FRIENDS_SERVER_ID}
          incomingFriendRequests={incomingFriendRequests}
          onAcceptFriendRequest={(fromUsername) => send({ type: 'accept_friend_request', username: fromUsername })}
          onDeclineFriendRequest={(fromUsername) => send({ type: 'decline_friend_request', username: fromUsername })}
          onRequestFriend={(toUsername) => send({ type: 'request_friend', username: toUsername })}
          onRefreshFriends={() => send({ type: 'get_friends_and_requests' })}
          onCreateInvite={selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && (servers.find((s) => s.id === selectedServerId)?.ownerId === username || userRole === 'owner') ? () => send({ type: 'create_invite', serverId: selectedServerId }) : undefined}
          voiceChannelState={voiceChannelState}
          speakingClientIds={speakingClientIds}
          screenSharingClientIds={screenSharingClientIds}
          currentVoiceChannelId={currentVoiceChannelId}
          myClientId={clientId}
          onJoinVoiceChannel={(channelId) => setCurrentVoiceChannelId(channelId)}
          userColors={userColors}
          avatarCacheBust={avatarCacheBust}
          voiceMuted={voiceMuted}
          voiceDeafened={voiceDeafened}
          onVoiceMute={() => setVoiceMuted((m) => !m)}
          onVoiceDeafen={() => {
            setVoiceDeafened((d) => {
              const next = !d;
              setVoiceMuted(next);
              return next;
            });
          }}
          onVoiceLeave={handleVoiceLeave}
          peerVolumes={peerVolumes}
          onPeerVolumeChange={setPeerVolume}
          onCreateChannel={(name, channelType) =>
            selectedServerId &&
            selectedServerId !== FRIENDS_SERVER_ID &&
            selectedServer?.canManageChannels &&
            send({ type: 'create_channel', serverId: selectedServerId, name, channelType })}
          onRenameChannel={(channelId, name) => send({ type: 'rename_channel', channelId, name })}
          onDeleteChannel={(channelId) => send({ type: 'delete_channel', channelId })}
          canManageChannels={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && selectedServer?.canManageChannels)}
          canDeleteServer={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && (selectedServer?.ownerId === username || userRole === 'owner'))}
          onDeleteServer={() => selectedServerId && send({ type: 'delete_server', serverId: selectedServerId })}
          onAddMember={(memberUsername) => selectedServerId && send({ type: 'add_member', serverId: selectedServerId, username: memberUsername })}
          joinRequestMessage={joinRequestMessage}
          onRequestJoin={() => selectedServerId && send({ type: 'request_join_server', serverId: selectedServerId })}
          onClearJoinRequestMessage={() => setJoinRequestMessage(null)}
          onOpenSettings={() => setSettingsPanelOpen(true)}
          serverRoles={selectedServer?.roles ?? []}
          onSetChannelMinRole={
            selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && (selectedServer?.ownerId === username || userRole === 'owner')
              ? (channelId, minRoleWeight) => {
                  send({ type: 'set_channel_min_role', channelId, minRoleWeight });
                  send({ type: 'get_servers_and_channels' });
                }
              : undefined
          }
          onOpenRolesModal={
            selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && (selectedServer?.ownerId === username || userRole === 'owner')
              ? () => setRolesModalOpen(true)
              : undefined
          }
          onSetServerIcon={
            selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && (selectedServer?.ownerId === username || userRole === 'owner')
              ? (serverId, iconUrl) => {
                  send({ type: 'set_server_icon', serverId, iconUrl });
                  send({ type: 'get_servers_and_channels' });
                }
              : undefined
          }
          onReorderChannels={
            selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && selectedServer?.canManageChannels
              ? (channelIds) => {
                  flushSync(() => {
                    setChannels((prev) =>
                      prev.map((c) => ({
                        ...c,
                        position: channelIds.indexOf(c.id) >= 0 ? channelIds.indexOf(c.id) : c.position,
                      }))
                    );
                  });
                  send({ type: 'reorder_channels', serverId: selectedServerId, channelIds });
                  setTimeout(() => send({ type: 'get_servers_and_channels' }), 700);
                }
              : undefined
          }
          onOpenProfile={(u) => setProfileModalUsername(u)}
        />
            </div>
          </aside>
        </div>
        {username && (
          <div className="app-left-bottom">
            <UserControlsBar
              currentUsername={username}
              userColors={userColors}
              avatarCacheBust={avatarCacheBust}
              voiceMuted={voiceMuted}
              voiceDeafened={voiceDeafened}
              onVoiceMute={() => setVoiceMuted((m) => !m)}
              onVoiceDeafen={() => {
                setVoiceDeafened((d) => {
                  const next = !d;
                  setVoiceMuted(next);
                  return next;
                });
              }}
              voiceChannelName={currentVoiceChannelId ? voicePanelChannelName : null}
              pingMs={pingMs}
              onLeaveVoice={handleVoiceLeave}
              onOpenSettings={() => setSettingsPanelOpen(true)}
              onStartScreenShare={(stream, kind, options) => {
                screenShareStreamRef.current = stream;
                setHasLocalScreenShare(true);
                setScreenShareOptions(options ?? null);
              }}
              onStopScreenShare={() => {
                screenShareStreamRef.current?.getTracks().forEach((t) => t.stop());
                screenShareStreamRef.current = null;
                setHasLocalScreenShare(false);
                setScreenShareOptions(null);
                if (currentVoiceChannelId) send({ type: 'screen_share_ended', channelId: currentVoiceChannelId });
                /* Switch to another sharer if we were viewing our own, so friend's share stays viewable */
                setViewingSharedFromClientId((prev) => {
                  if (prev !== clientId) return prev;
                  const others = [...screenSharingClientIds].filter((id) => id !== clientId);
                  return others[0] ?? null;
                });
                /* Do NOT clear container: VoicePanel manages peer videos; clearing would remove others' shares */
              }}
              screenSharing={hasLocalScreenShare}
              showScreenShare={
                !!currentVoiceChannelId &&
                ((selectedChannel?.type === 'voice' && currentVoiceChannelId === selectedChannel?.id) || inDmFriendVoice)
              }
              hasScreenShare={hasScreenShare}
            />
          </div>
        )}
      </div>
      <main className={`chat-panel ${usersPanelOpen ? 'chat-panel-with-users' : ''} ${((selectedChannel?.type === 'voice' && hasScreenShare) || (inDmFriendVoice && hasScreenShare)) ? 'chat-panel-voice-screen-share' : ''}`}>
        <div className="chat-content-wrap">
        {(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && selectedServer?.canAccess !== true) ? (
          <>
            <div className="chat-header">&nbsp;</div>
            <div className="chat-messages empty">
              <ChatEmptyState
                icon="shield"
                title="You are not a member of this server"
                subtitle="The owner can accept or decline your join request from the admin panel."
              />
            </div>
          </>
        ) : selectedChannel?.type === 'text' && canAccessSelected && selectedChannel.serverId === selectedServerId ? (
          <ChatArea
            channelId={selectedChannel.id}
            channelName={selectedChannel.name}
            serverId={selectedServerId}
            canAccessServer={canAccessSelected}
            channelLocked={
              selectedServerId === FRIENDS_SERVER_ID
                ? false
                : (selectedServer?.myRoleWeight ?? 9999) > (selectedChannel.minRoleWeight ?? 9998)
            }
            myUsername={username ?? ''}
            userColors={userColors}
            avatarCacheBust={avatarCacheBust}
            emojiCodepointsList={emojiCodepointsList}
            isServerAdmin={
              selectedChannel.serverId === FRIENDS_SERVER_ID
                ? false
                : !!(
                    username &&
                    (userRole === 'owner' || servers.find((s) => s.id === selectedChannel.serverId)?.ownerId === username)
                  )
            }
            onToggleUsers={selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected ? () => setUsersPanelOpen((v) => !v) : undefined}
            usersPanelOpen={usersPanelOpen}
            showRequests={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected && (selectedServer?.ownerId === username || userRole === 'owner'))}
            requestsCount={joinRequests.filter((r) => r.serverId === selectedServerId).length}
            onOpenRequests={() => setJoinRequestsOpen((v) => !v)}
            requestsOpen={joinRequestsOpen}
            showRoles={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected && (selectedServer?.ownerId === username || userRole === 'owner'))}
            onOpenRoles={() => setRolesModalOpen(true)}
            showVoiceCallButton={
              selectedServerId === FRIENDS_SERVER_ID &&
              !!username &&
              !!selectedChannel?.name &&
              selectedChannel.type === 'text'
            }
            inDmFriendVoice={inDmFriendVoice}
            onVoiceCall={() => {
              if (!username || !selectedChannel?.name || selectedChannel.type !== 'text') return;
              setCurrentVoiceChannelId(dmVoiceChannelId(username, selectedChannel.name));
            }}
            onLeaveDmVoice={() => {
              handleVoiceLeave();
            }}
          />
        ) : showVoiceConnectedPanel ? (
          <div className={`voice-connected-panel ${hasScreenShare ? 'voice-has-screen-share' : ''}`}>
            <ChatHeader
              title={voicePanelChannelName}
              showRequests={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected && (selectedServer?.ownerId === username || userRole === 'owner'))}
              requestsCount={joinRequests.filter((r) => r.serverId === selectedServerId).length}
              onOpenRequests={() => setJoinRequestsOpen((v) => !v)}
              requestsOpen={joinRequestsOpen}
              showRoles={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected && (selectedServer?.ownerId === username || userRole === 'owner'))}
              onOpenRoles={() => setRolesModalOpen(true)}
              showUsers={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected)}
              onToggleUsers={() => setUsersPanelOpen((v) => !v)}
              usersPanelOpen={usersPanelOpen}
            />
            <div className="voice-connected-content">
            <div className="voice-connected-members-wrap">
            <div className="voice-connected-members-row">
              {sortVoiceMembersByJoinedAt(voiceChannelState[voiceUiStateKey] ?? []).map((m) => {
                const isSpeaking = speakingClientIds.has(m.clientId);
                const isSharing = screenSharingClientIds.has(m.clientId);
                return (
                  <div
                    key={m.clientId}
                    className={`voice-connected-member ${isSharing ? 'voice-connected-member-share-click' : ''}`}
                    onClick={isSharing && hasScreenShare ? () => setViewingSharedFromClientId(m.clientId) : undefined}
                    role={isSharing && hasScreenShare ? 'button' : undefined}
                    title={
                      hasScreenShare
                        ? `${m.userName === username ? 'You' : m.userName}${isSharing ? ' — sharing screen' : ''}`
                        : undefined
                    }
                  >
                    <div className={`voice-connected-member-avatar ${isSpeaking ? 'speaking' : ''}`}>
                      <Avatar
                        username={m.userName}
                        cacheBust={avatarCacheBust}
                        imgClassName="voice-connected-member-avatar-img"
                        initialClassName="voice-connected-member-avatar-initial"
                      />
                      {hasScreenShare && isSharing && (
                        <span className="voice-connected-share-pip" title="Sharing screen" aria-hidden />
                      )}
                    </div>
                    <span className="voice-connected-member-name" style={userColors[m.userName] ? { color: userColors[m.userName] } : undefined}>
                      {m.userName === username ? 'You' : m.userName}
                      {isSharing && !hasScreenShare && (
                        <span className="voice-member-sharing-icon" title="Sharing screen">
                          📺
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            </div>
            {!hasScreenShare && <div className="voice-connected-filler" aria-hidden />}
            <div
              ref={screenShareAreaRef}
              className={`voice-screen-share-area ${hasScreenShare && viewingSharedFromClientId ? '' : 'voice-screen-share-area-hidden'} ${screenShareFullscreen ? 'voice-screen-share-area-fullscreen' : ''}`}
            >
              {hasScreenShare && (
                <>
                  {screenShareFullscreen && (
                    <button
                      type="button"
                      className="voice-screen-share-fullscreen-close"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const b = (window as Window & { bahuckel?: { exitFullscreen?: () => void } }).bahuckel;
                        if (b?.exitFullscreen) b.exitFullscreen();
                        else (document.exitFullscreen || (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen)?.();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const b = (window as Window & { bahuckel?: { exitFullscreen?: () => void } }).bahuckel;
                        if (b?.exitFullscreen) b.exitFullscreen();
                        else (document.exitFullscreen || (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen)?.();
                      }}
                      title="Exit fullscreen"
                      aria-label="Exit fullscreen"
                    >
                      ✕
                    </button>
                  )}
                  {viewingSharedFromClientId && (
                    <div className="voice-screen-share-toolbar">
                      <div className="voice-screen-share-toolbar-row">
                        {[...screenSharingClientIds].map((cid) => {
                          const m = (voiceChannelState[voiceUiStateKey] ?? []).find((x) => x.clientId === cid);
                          const name = m?.userName ?? cid;
                          return (
                            <button
                              key={cid}
                              type="button"
                              className={`voice-screen-share-toolbar-user ${viewingSharedFromClientId === cid ? 'active' : ''}`}
                              onClick={() => setViewingSharedFromClientId(cid)}
                            >
                              {name === username ? 'You' : name}
                            </button>
                          );
                        })}
                        <button type="button" className="voice-screen-share-toolbar-stop" onClick={() => setViewingSharedFromClientId(null)} title="Stop viewing">
                          Stop viewing
                        </button>
                        <button
                          type="button"
                          className="voice-screen-share-toolbar-fullscreen"
                          onClick={async () => {
                            const b = (window as Window & { bahuckel?: { setWindowFullscreen?: (v: boolean) => void } }).bahuckel;
                            if (screenShareFullscreen) {
                              if (b?.setWindowFullscreen) b.setWindowFullscreen(false);
                              else (document.exitFullscreen || (document as Document & { webkitExitFullscreen?: () => void }).webkitExitFullscreen)?.();
                            } else {
                              if (b?.setWindowFullscreen) {
                                setScreenShareFullscreen(true);
                                b.setWindowFullscreen(true);
                              } else {
                                const el = screenShareAreaRef.current;
                                if (el?.requestFullscreen) {
                                  await el.requestFullscreen();
                                } else if ((el as HTMLElement & { webkitRequestFullscreen?: () => void })?.webkitRequestFullscreen) {
                                  (el as HTMLElement & { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen!();
                                }
                              }
                            }
                          }}
                          title={screenShareFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        >
                          {screenShareFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        </button>
                      </div>
                      <label className="voice-screen-share-volume-row">
                        <span className="voice-screen-share-volume-label">Screen volume</span>
                        <input
                          type="range"
                          min={0}
                          max={200}
                          value={Math.round((settings.screenShareVolume ?? 1) * 100)}
                          onChange={(e) => {
                            const v = Number(e.target.value) / 100;
                            setScreenShareVolume(v);
                          }}
                        />
                      </label>
                    </div>
                  )}
                  <div ref={screenShareContainerRef} id="voice-screen-share-main" className="voice-screen-share-main" />
                </>
              )}
            </div>
            </div>
          </div>
        ) : (
          <>
            <ChatHeader
              title={selectedServerId === FRIENDS_SERVER_ID ? '' : selectedServerId ? 'Select a channel' : ''}
              showRequests={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected && (selectedServer?.ownerId === username || userRole === 'owner'))}
              requestsCount={joinRequests.filter((r) => r.serverId === selectedServerId).length}
              onOpenRequests={() => setJoinRequestsOpen((v) => !v)}
              requestsOpen={joinRequestsOpen}
              showRoles={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected && (selectedServer?.ownerId === username || userRole === 'owner'))}
              onOpenRoles={() => setRolesModalOpen(true)}
              showUsers={!!(selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && canAccessSelected)}
              onToggleUsers={() => setUsersPanelOpen((v) => !v)}
              usersPanelOpen={usersPanelOpen}
            />
            <div className="chat-messages empty">
              {selectedServerId === FRIENDS_SERVER_ID ? (
                <ChatEmptyState
                  icon="users"
                  title="Select a friend"
                  subtitle="Pick someone from the list to open the conversation."
                />
              ) : selectedServerId ? (
                <ChatEmptyState
                  icon="hash"
                  title="Select a channel"
                  subtitle="Choose a channel from the list, or add a new one."
                />
              ) : (
                <ChatEmptyState
                  icon="server"
                  title="Welcome"
                  subtitle="Create or select a server to get started."
                />
              )}
            </div>
          </>
        )}
        </div>
        {usersPanelOpen && selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && selectedServer && selectedServer.canAccess && (
          <UsersPanel
            serverName={selectedServer.name}
            serverId={selectedServerId}
            voiceJoinedAtByUsername={voiceJoinedAtByUsername}
            members={selectedServer.members ?? []}
            onlineMembers={selectedServer.onlineMembers ?? []}
            memberRoles={selectedServer.memberRoles}
            roles={selectedServer.roles ?? []}
            currentUsername={username}
            serverOwnerId={selectedServer.ownerId}
            userColors={userColors}
            avatarCacheBust={avatarCacheBust}
            canAssignRoles={!!(selectedServer.ownerId === username || userRole === 'owner')}
            canKick={!!(selectedServer.ownerId === username || userRole === 'owner')}
            onAssignRole={(memberUsername, roleId) => {
              send({ type: 'assign_member_role', serverId: selectedServerId, username: memberUsername, roleId });
              send({ type: 'get_servers_and_channels' });
            }}
            onKick={(memberUsername) => {
              send({ type: 'kick_member', serverId: selectedServerId, username: memberUsername });
              send({ type: 'get_servers_and_channels' });
            }}
            onBan={(memberUsername) => {
              send({ type: 'kick_member', serverId: selectedServerId, username: memberUsername });
              send({ type: 'get_servers_and_channels' });
            }}
            onLeaveServer={() => {
              send({ type: 'leave_server', serverId: selectedServerId });
              send({ type: 'get_servers_and_channels' });
              setUsersPanelOpen(false);
            }}
            onRequestFriend={(toUsername) => send({ type: 'request_friend', username: toUsername })}
            onOpenProfile={(u) => setProfileModalUsername(u)}
            onClose={() => setUsersPanelOpen(false)}
          />
        )}
      </main>
      {rolesModalOpen && selectedServerId && selectedServerId !== FRIENDS_SERVER_ID && selectedServer && (
        <RolesModal
          serverName={selectedServer.name}
          roles={selectedServer.roles ?? []}
          onCreateRole={(name, weight, permissions) => {
            send({ type: 'create_role', serverId: selectedServerId, name, weight, permissions });
            send({ type: 'get_servers_and_channels' });
          }}
          onUpdateRoleName={
            selectedServer?.ownerId === username || userRole === 'owner'
              ? (roleId, newName) => {
                  send({ type: 'update_role_name', serverId: selectedServerId, roleId, name: newName });
                  send({ type: 'get_servers_and_channels' });
                }
              : undefined
          }
          onReorderRoles={
            selectedServer?.ownerId === username || userRole === 'owner'
              ? (roleIds) => {
                  flushSync(() => {
                    setServers((prev) =>
                      prev.map((s) => {
                        if (s.id !== selectedServerId) return s;
                        const roles = s.roles ?? [];
                        const order = new Map(roleIds.map((id, i) => [id, i]));
                        const reordered = [...roles].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
                        const withWeights = reordered.map((r, i) => ({
                          ...r,
                          weight: r.id === 'owner' ? 0 : r.id === 'guest' ? 9998 : i,
                        }));
                        return { ...s, roles: withWeights };
                      })
                    );
                  });
                  send({ type: 'reorder_roles', serverId: selectedServerId, roleIds });
                  setTimeout(() => send({ type: 'get_servers_and_channels' }), 700);
                }
              : undefined
          }
          onClose={() => setRolesModalOpen(false)}
        />
      )}
      {currentVoiceChannelId && (() => {
        return (
          <VoicePanel
            channelId={currentVoiceChannelId}
            channelName={voicePanelChannelName}
            myClientId={clientId}
            send={send}
            subscribe={subscribe}
            voiceMuted={voiceMuted}
            voiceDeafened={voiceDeafened}
            peerVolumes={peerVolumes}
            screenShareStream={hasLocalScreenShare ? screenShareStreamRef.current : null}
            screenShareBitrate={screenShareOptions?.bitrate}
            onSpeakingChange={setSpeakingClientIds}
            onScreenShareCountChange={setScreenShareVideoCount}
            onScreenShareClientsChange={setScreenSharingClientIds}
            screenShareThumbnailContainerId={undefined}
            screenShareContainerRef={screenShareContainerRef}
            viewingSharedFromClientId={viewingSharedFromClientId}
            onViewingChange={setViewingSharedFromClientId}
          />
        );
      })()}
      {taskRecorderActive && <TaskRecorderLog />}
      </>
      )}
    </div>
  );
}
