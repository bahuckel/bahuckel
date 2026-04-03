import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocket } from '../context/SocketContext';
import { useSettings } from '../context/SettingsContext';
import {
  EMOJI_CATEGORY_ORDER,
  getRenderableEmojisForPicker,
  getCategoryTabFromPicker,
} from '../emojiByCategory';
import { formatChatMessageHtml, getTwemojiUrl, getEmojiImageUrlByCodepoint } from '../emoji';
import { IconPlus, IconPaperclip, IconSmile, IconImage } from './UiIcons';
import { GifPicker } from './GifPicker';
import { ChatEmptyState } from './ChatEmptyState';
import { Avatar } from './Avatar';
import { EmojiInput, type EmojiInputHandle } from './EmojiInput';
import { ChatHeader } from './ChatHeader';

const POPUP_WIDTH = 170;
const EMOJI_PICKER_WIDTH = 348;

function getPopupPosition(rect: DOMRect, popupWidth: number): { left: number; top: number } {
  const spaceRight = typeof window !== 'undefined' ? window.innerWidth - rect.right : 999;
  const left = spaceRight >= popupWidth + 12 ? rect.right + 6 : rect.left - popupWidth - 6;
  return { left, top: rect.top };
}

/** Case-insensitive lookup so avatars/colors work when server and message use different casing */
function getByUsername<T>(record: Record<string, T>, username: string): T | undefined {
  if (record[username] !== undefined) return record[username];
  const lower = username.toLowerCase();
  const key = Object.keys(record).find((k) => k.toLowerCase() === lower);
  return key ? record[key] : undefined;
}

const EMOJI_SHORTCUTS: [RegExp, string][] = [
  [/:D/g, '😄'],
  [/:\)/g, '😊'],
  [/:\(/g, '😢'],
  [/:'\s*\(/g, '😭'],
  [/;\)/g, '😉'],
  [/:P/gi, '😛'],
  [/:O/gi, '😮'],
  [/<3/g, '❤️'],
  [/:\*/g, '😘'],
  [/xD/gi, '😆'],
  [/:S/gi, '😖'],
  /* `:/` face — must not match `://` or every URL breaks */
  [/:\/(?!\/)/g, '😕'],
];

function replaceEmojiShortcuts(text: string): string {
  let out = text;
  for (const [re, emoji] of EMOJI_SHORTCUTS) {
    out = out.replace(re, emoji);
  }
  return out;
}

export interface ReplyToInfo {
  messageId: string;
  authorName: string;
  contentPreview: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  authorColor?: string;
  authorAvatar?: string;
  attachment?: { type: 'image'; url: string };
  replyTo?: ReplyToInfo;
  reactions?: Record<string, string[]>;
}

/** Max gap (ms) for grouping consecutive messages from same user. 5 minutes. */
const MESSAGE_GROUP_MAX_GAP_MS = 5 * 60 * 1000;

function trimMessages<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

/** Group consecutive messages from same author (within time window). Interruption by another user starts new group. */
function groupMessages<T extends { authorName: string; createdAt: string }>(messages: T[]): T[][] {
  if (messages.length === 0) return [];
  const groups: T[][] = [];
  let current: T[] = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const m = messages[i];
    const sameAuthor = prev.authorName === m.authorName;
    const gap = new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime();
    const withinWindow = gap <= MESSAGE_GROUP_MAX_GAP_MS;
    if (sameAuthor && withinWindow) {
      current.push(m);
    } else {
      groups.push(current);
      current = [m];
    }
  }
  groups.push(current);
  return groups;
}

/** Format timestamp: HH:MM for same day, DD/MM/YYYY HH:MM otherwise. Uses timeFormat setting. */
function formatMessageTime(iso: string, timeFormat: '12' | '24'): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = timeFormat === '24'
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : timeFormat === '12'
      ? { hour: '2-digit', minute: '2-digit', hour12: true }
      : { hour: '2-digit', minute: '2-digit' };
  if (sameDay) {
    return d.toLocaleTimeString(undefined, opts);
  }
  return d.toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', ...opts });
}

interface ChatAreaProps {
  channelId: string | null;
  channelName?: string;
  serverId?: string | null;
  myUsername?: string;
  userColors?: Record<string, string>;
  avatarCacheBust?: number;
  emojiCodepointsList?: string[];
  isServerAdmin?: boolean;
  canAccessServer?: boolean;
  channelLocked?: boolean;
  onToggleUsers?: () => void;
  usersPanelOpen?: boolean;
  onOpenRoles?: () => void;
  onOpenRequests?: () => void;
  requestsOpen?: boolean;
  requestsCount?: number;
  showRoles?: boolean;
  showRequests?: boolean;
  showVoiceCallButton?: boolean;
  onVoiceCall?: () => void;
  inDmFriendVoice?: boolean;
  onLeaveDmVoice?: () => void;
}

const EMOJI_PICKER_HEIGHT = 280;

export function ChatArea({ channelId, channelName = 'general', serverId = null, myUsername = '', userColors = {}, avatarCacheBust, emojiCodepointsList = [], isServerAdmin = false, canAccessServer = true, channelLocked = false, onToggleUsers, usersPanelOpen = false, onOpenRoles, onOpenRequests, requestsOpen = false, requestsCount = 0, showRoles = false, showRequests = false, showVoiceCallButton = false, onVoiceCall, inDmFriendVoice = false, onLeaveDmVoice }: ChatAreaProps) {
  const emojiCodepointsSet = useMemo(
    () => new Set((emojiCodepointsList ?? []).map((cp) => cp.toLowerCase())),
    [emojiCodepointsList]
  );
  const { send, ready, subscribe } = useSocket();
  const { settings, getServerChatBackground } = useSettings();
  const serverBg = getServerChatBackground(serverId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageMenuAnchor, setMessageMenuAnchor] = useState<{ message: ChatMessage; rect: DOMRect } | null>(null);
  const [emojiPickerFor, setEmojiPickerFor] = useState<{ messageId: string; rect: DOMRect } | null>(null);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [inputEmojiCategory, setInputEmojiCategory] = useState(0);
  const [reactionEmojiCategory, setReactionEmojiCategory] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuWrapRef = useRef<HTMLDivElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<EmojiInputHandle>(null);
  const serverMaxMessagesRef = useRef(-1);
  const [sendBlockedUntil, setSendBlockedUntil] = useState(0);
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
  const MAX_IMAGE_URL_LENGTH = 2048;

  useEffect(() => {
    if (sendBlockedUntil <= Date.now()) return;
    const ms = sendBlockedUntil - Date.now();
    const t = setTimeout(() => setSendBlockedUntil(0), ms + 40);
    return () => clearTimeout(t);
  }, [sendBlockedUntil]);

  useEffect(() => {
    if (!channelId || !canAccessServer) return;
    setReplyToMessage(null);
    setEditingMessageId(null);
    setImagePreview(null);
    send({ type: 'subscribe_channel', channelId });
    return () => {
      send({ type: 'unsubscribe_channel', channelId });
    };
  }, [channelId, canAccessServer, send]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'server_config') {
        const m = typeof msg.maxMessagesPerChannel === 'number' ? msg.maxMessagesPerChannel : -1;
        serverMaxMessagesRef.current = m;
        if (m >= 0) {
          setMessages((prev) => trimMessages(prev, m));
        }
      }
      if (msg.type === 'send_rate_limited') {
        const ms = typeof msg.retryAfterMs === 'number' ? msg.retryAfterMs : 5000;
        setSendBlockedUntil(Date.now() + ms);
      }
      if (msg.type === 'message_list' && msg.channelId === channelId) {
        const raw = (Array.isArray(msg.messages) ? msg.messages : []) as ChatMessage[];
        const cap = serverMaxMessagesRef.current;
        setMessages(cap < 0 ? raw : trimMessages(raw, cap));
      }
      if (msg.type === 'new_message' && msg.message && (msg.message as ChatMessage).channelId === channelId) {
        setMessages((prev) => {
          const next = [...prev, msg.message as ChatMessage];
          const cap = serverMaxMessagesRef.current;
          return cap < 0 ? next : trimMessages(next, cap);
        });
      }
      if (msg.type === 'message_updated' && msg.message && (msg.message as ChatMessage).channelId === channelId) {
        const m = msg.message as ChatMessage;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        if (editingMessageId === m.id) setEditingMessageId(null);
      }
      if (msg.type === 'message_deleted' && msg.channelId === channelId && msg.messageId) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.messageId));
        if (editingMessageId === msg.messageId) { setEditingMessageId(null); setReplyToMessage(null); }
      }
      if (msg.type === 'reaction_updated' && msg.channelId === channelId && msg.messageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.messageId ? { ...m, reactions: msg.reactions as Record<string, string[]> } : m))
        );
      }
    });
  }, [channelId, subscribe, editingMessageId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const onDown = (e: MouseEvent) => {
      if (attachMenuWrapRef.current && !attachMenuWrapRef.current.contains(e.target as Node)) {
        window.setTimeout(() => setShowAttachMenu(false), 0);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showAttachMenu]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (channelLocked) return;
    if (sendBlockedUntil > Date.now()) return;
    let text = input.trim();
    text = replaceEmojiShortcuts(text);
    if (!channelId || (!text && !imagePreview) || !ready) return;
    if (editingMessageId) {
      const editPayload: Record<string, unknown> = {
        type: 'edit_message',
        channelId,
        messageId: editingMessageId,
        content: text,
      };
      if (imagePreview) {
        if (imagePreview.startsWith('https://')) {
          if (imagePreview.length <= MAX_IMAGE_URL_LENGTH) editPayload.imageUrl = imagePreview;
        } else if (imagePreview.length <= MAX_IMAGE_SIZE) {
          editPayload.imageDataUrl = imagePreview;
        }
      }
      send(editPayload);
      setEditingMessageId(null);
    } else {
      const payload: Record<string, unknown> = { type: 'send_message', channelId, content: text || '' };
      if (imagePreview) {
        if (imagePreview.startsWith('https://')) {
          if (imagePreview.length <= MAX_IMAGE_URL_LENGTH) payload.imageUrl = imagePreview;
        } else if (imagePreview.length <= MAX_IMAGE_SIZE) {
          payload.imageDataUrl = imagePreview;
        }
      }
      if (replyToMessage) payload.replyToMessageId = replyToMessage.id;
      send(payload);
      setReplyToMessage(null);
    }
    setInput('');
    setImagePreview(null);
  };

  const sendGifFromPicker = useCallback(
    (gifUrl: string) => {
      if (!channelId || !ready || !canAccessServer || channelLocked) return;
      if (sendBlockedUntil > Date.now()) return;
      if (!gifUrl.startsWith('https://') || gifUrl.length > MAX_IMAGE_URL_LENGTH) return;
      let text = input.trim();
      text = replaceEmojiShortcuts(text);
      if (editingMessageId) {
        const editPayload: Record<string, unknown> = {
          type: 'edit_message',
          channelId,
          messageId: editingMessageId,
          content: text,
          imageUrl: gifUrl,
        };
        send(editPayload);
        setEditingMessageId(null);
      } else {
        const payload: Record<string, unknown> = {
          type: 'send_message',
          channelId,
          content: text || '',
          imageUrl: gifUrl,
        };
        if (replyToMessage) payload.replyToMessageId = replyToMessage.id;
        send(payload);
        setReplyToMessage(null);
      }
      setInput('');
      setImagePreview(null);
      setShowGifPicker(false);
    },
    [
      channelId,
      ready,
      canAccessServer,
      channelLocked,
      sendBlockedUntil,
      input,
      editingMessageId,
      replyToMessage,
      send,
    ]
  );

  const lastMyMessage = messages.filter((m) => m.authorName === myUsername).pop();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLElement).closest('form')?.requestSubmit();
      return;
    }
    if (e.key !== 'ArrowUp' || input.trim() || editingMessageId) return;
    if (!lastMyMessage) return;
    e.preventDefault();
    setEditingMessageId(lastMyMessage.id);
    setInput(lastMyMessage.content);
    setImagePreview(
      lastMyMessage.attachment?.type === 'image' ? lastMyMessage.attachment.url : null
    );
    setReplyToMessage(null);
    inputRef.current?.focus();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl.length <= MAX_IMAGE_SIZE) setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const item = e.clipboardData?.items?.[0];
    if (!item || !item.type.startsWith('image/')) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (dataUrl.length <= MAX_IMAGE_SIZE) setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  if (!channelId) {
    return (
      <div className="chat-panel">
        <div className="chat-header">&nbsp;</div>
        <div className="chat-messages empty">
          <ChatEmptyState
            icon="hash"
            title="Select a text channel"
            subtitle="Choose a channel from the list to start chatting."
          />
        </div>
      </div>
    );
  }

  if (!canAccessServer) {
    return (
      <div className="chat-panel">
        <div className="chat-header">&nbsp;</div>
        <div className="chat-messages empty">
          <ChatEmptyState
            icon="shield"
            title="You are not a member of this server"
            subtitle="The owner can accept or decline your join request from the admin panel."
          />
        </div>
      </div>
    );
  }

  const useBubbles = serverBg.background !== 'default' && serverBg.background !== 'custom';
  const bubblesVariant = useBubbles && (serverBg.background === 'bubbles-dark' || serverBg.background === 'bubbles-light') ? serverBg.background : null;
  const hasCustomImage = serverBg.background === 'custom' && serverBg.imageUrl;
  const fit = serverBg.imageFit || 'fill';
  const customBgStyle: React.CSSProperties | undefined = hasCustomImage
    ? (() => {
        const base: React.CSSProperties = { backgroundImage: `url(${serverBg.imageUrl})` };
        switch (fit) {
          case 'fill':
            base.backgroundSize = 'cover';
            base.backgroundPosition = 'center';
            base.backgroundRepeat = 'no-repeat';
            break;
          case 'fit':
            base.backgroundSize = 'contain';
            base.backgroundPosition = 'center';
            base.backgroundRepeat = 'no-repeat';
            break;
          case 'stretch':
            base.backgroundSize = '100% 100%';
            base.backgroundPosition = 'center';
            base.backgroundRepeat = 'no-repeat';
            break;
          case 'center':
            base.backgroundSize = 'auto';
            base.backgroundPosition = 'center';
            base.backgroundRepeat = 'no-repeat';
            break;
          case 'tile':
            base.backgroundSize = 'auto';
            base.backgroundPosition = '0 0';
            base.backgroundRepeat = 'repeat';
            break;
          default:
            base.backgroundSize = 'cover';
            base.backgroundPosition = 'center';
            base.backgroundRepeat = 'no-repeat';
        }
        return base;
      })()
    : undefined;

  return (
    <div
      className={`chat-panel ${useBubbles ? `chat-panel-bubbles chat-panel-bubbles-${bubblesVariant}` : ''} ${hasCustomImage ? 'chat-panel-custom-bg' : ''}`}
      style={customBgStyle}
    >
      <ChatHeader
        title={`# ${channelName}`}
        statusText={!ready ? 'connecting…' : undefined}
        showRequests={showRequests}
        requestsCount={requestsCount}
        onOpenRequests={onOpenRequests}
        requestsOpen={requestsOpen}
        showRoles={showRoles}
        onOpenRoles={onOpenRoles}
        showUsers={!!onToggleUsers}
        onToggleUsers={onToggleUsers}
        usersPanelOpen={usersPanelOpen}
        showVoiceCallButton={showVoiceCallButton}
        onVoiceCall={onVoiceCall}
        inDmFriendVoice={inDmFriendVoice}
        onLeaveDmVoice={onLeaveDmVoice}
      />
      <div
        className={`chat-messages ${messages.length === 0 ? 'empty' : ''} ${useBubbles ? 'chat-messages-bubbles' : ''}`}
        style={{ fontSize: `${settings.chatFontSize}px` }}
      >
        {messages.length === 0 && (
          <ChatEmptyState
            icon="messages"
            title="No messages yet"
            subtitle="Say hello to start the conversation."
          />
        )}
        {useMemo(() => groupMessages(messages), [messages]).map((group) => {
          const first = group[0];
          const authorColor = getByUsername(userColors, first.authorName) ?? first.authorColor;
          const isOwn = myUsername !== '' && first.authorName === myUsername;
          return (
            <div
              key={first.id}
              className={`chat-message-wrapper ${useBubbles ? 'chat-message-bubble' : ''} ${useBubbles ? `chat-message-bubble-${bubblesVariant}` : ''} ${group.length > 1 ? 'chat-message-group' : ''} ${isOwn ? 'chat-message-own' : 'chat-message-other'}`}
              style={{ '--msg-font-size': `${settings.chatFontSize}px` } as React.CSSProperties}
            >
              <div className="chat-message-avatar">
                <Avatar
                  username={first.authorName}
                  cacheBust={avatarCacheBust}
                  imgClassName="chat-message-avatar-img"
                  initialClassName="chat-message-avatar-initial"
                />
              </div>
              <div className="chat-message-group-content">
                {group.map((m, idx) => {
                  const replyAuthorColor = m.replyTo ? getByUsername(userColors, m.replyTo.authorName) : undefined;
                  const isFirst = idx === 0;
                  return (
                    <div key={m.id} className={`chat-message-row ${!isFirst ? 'chat-message-row-continuation' : ''}`}>
                      <div className={`chat-message ${!isFirst ? 'chat-message-continuation' : ''}`}>
                        {m.replyTo && (
                          <div className="chat-message-reply-to">
                            <span className="chat-message-reply-author" style={replyAuthorColor ? { color: replyAuthorColor } : undefined}>
                              {m.replyTo.authorName}
                            </span>
                            <span className="chat-message-reply-preview">{m.replyTo.contentPreview}</span>
                          </div>
                        )}
                        {isFirst && (
                          <div className="chat-message-header">
                            <span
                              className="chat-message-author"
                              style={authorColor ? { color: authorColor } : undefined}
                            >
                              {m.authorName}
                            </span>
                            {m.editedAt && <span className="chat-message-edited">(edited)</span>}
                            <span className="chat-message-time">{formatMessageTime(m.createdAt, settings.timeFormat ?? '24')}</span>
                          </div>
                        )}
                        <div className="chat-message-body">
                          {m.content && (
                            <span
                              className="chat-message-content"
                              dangerouslySetInnerHTML={{ __html: formatChatMessageHtml(m.content, { className: 'chat-twemoji' }) }}
                            />
                          )}
                          {m.attachment?.type === 'image' && (
                            <div className="chat-message-image">
                              <img src={m.attachment.url} alt="Attachment" />
                            </div>
                          )}
                          {m.reactions && Object.keys(m.reactions).length > 0 && (
                          <div className="chat-message-reactions">
                            {Object.entries(m.reactions)
                              .filter(([emoji]) => getTwemojiUrl(emoji))
                              .map(([emoji, usernames]) => (
                              <button
                                key={emoji}
                                type="button"
                                className={`chat-reaction ${usernames.includes(myUsername) ? 'reacted' : ''}`}
                                onClick={() => {
                                  if (usernames.includes(myUsername)) {
                                    send({ type: 'remove_reaction', channelId, messageId: m.id, emoji });
                                  } else {
                                    send({ type: 'add_reaction', channelId, messageId: m.id, emoji });
                                  }
                                }}
                                title={usernames.join(', ')}
                              >
                                {getTwemojiUrl(emoji) ? (
                                  <span className="emoji-img-wrap">
                                    <img
                                      src={getTwemojiUrl(emoji)}
                                      alt=""
                                      className="chat-twemoji chat-reaction-emoji"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  </span>
                                ) : null}
                                <span className="chat-reaction-count">{usernames.length}</span>
                              </button>
                            ))}
                          </div>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="chat-message-menu-btn"
                        onClick={(e) => setMessageMenuAnchor({ message: m, rect: e.currentTarget.getBoundingClientRect() })}
                        aria-label="Message options"
                      >
                        ⋮
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div ref={listEndRef} />
      </div>
      <div className="chat-input-area-wrap" style={{ position: 'relative' }}>
        {channelLocked && (
          <div
            className="chat-input-locked-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 8,
              pointerEvents: 'all',
              zIndex: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            This channel is locked
          </div>
        )}
      <form className="chat-input-area" onSubmit={handleSubmit} style={channelLocked ? { pointerEvents: 'none', opacity: 0.7 } : undefined}>
        {replyToMessage && (
          <div className="chat-reply-preview">
            <span className="chat-reply-preview-label">Replying to {replyToMessage.authorName}</span>
            <span className="chat-reply-preview-text">{replyToMessage.content.slice(0, 60)}{replyToMessage.content.length > 60 ? '…' : ''}</span>
            <button type="button" className="chat-reply-preview-remove" onClick={() => setReplyToMessage(null)} aria-label="Cancel reply">×</button>
          </div>
        )}
        {editingMessageId && (
          <div className="chat-reply-preview chat-edit-preview">
            <span className="chat-reply-preview-label">Editing message</span>
            <button
              type="button"
              className="chat-reply-preview-remove"
              onClick={() => {
                setEditingMessageId(null);
                setInput('');
                setImagePreview(null);
              }}
              aria-label="Cancel edit"
            >
              ×
            </button>
          </div>
        )}
        {imagePreview && (
          <div className="chat-image-preview">
            <img src={imagePreview} alt="Preview" />
            <button type="button" className="chat-image-remove" onClick={() => setImagePreview(null)} aria-label="Remove image">×</button>
          </div>
        )}
        <div className="chat-input-row">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageSelect}
            className="chat-file-input"
            aria-label="Attach image"
          />
          <div className="chat-input-attach-wrap" ref={attachMenuWrapRef}>
            <button
              type="button"
              className="chat-attach-btn chat-input-tool-btn"
              onClick={() => {
                setShowInputEmojiPicker(false);
                setShowAttachMenu((v) => !v);
              }}
              title="Attach or GIF"
              aria-label="Attach or GIF"
              aria-expanded={showAttachMenu}
            >
              <IconPlus />
            </button>
            {showAttachMenu && (
              <div className="chat-attach-menu-popover" role="menu">
                <button
                  type="button"
                  className="chat-attach-menu-item"
                  role="menuitem"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setShowAttachMenu(false);
                  }}
                >
                  <IconPaperclip />
                  <span>Attach image</span>
                </button>
                <button
                  type="button"
                  className="chat-attach-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setShowAttachMenu(false);
                    setShowInputEmojiPicker(false);
                    setShowGifPicker(true);
                  }}
                >
                  <IconImage />
                  <span>Search GIFs</span>
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="chat-attach-btn chat-input-tool-btn"
            onClick={() => {
              setShowAttachMenu(false);
              setShowInputEmojiPicker((v) => !v);
            }}
            title="Insert emoji"
            aria-label="Insert emoji"
          >
            <IconSmile />
          </button>
          {showInputEmojiPicker && (
            <div className="chat-input-emoji-picker chat-emoji-picker-categorized">
              <div className="emoji-picker-categories">
                {EMOJI_CATEGORY_ORDER.map((cat, i) => (
                  <button
                    key={cat}
                    type="button"
                    className={`emoji-picker-cat-btn ${i === inputEmojiCategory ? 'active' : ''}`}
                    onClick={() => setInputEmojiCategory(i)}
                    title={cat}
                    aria-label={cat}
                  >
                    {(() => {
                      const tab = getCategoryTabFromPicker(cat, emojiCodepointsSet);
                      const url = tab ? getEmojiImageUrlByCodepoint(tab.codepoint) : '';
                      return url ? <img src={url} alt="" className="emoji-picker-twemoji" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null;
                    })()}
                  </button>
                ))}
              </div>
              <div className="emoji-picker-grid-wrap">
                <div className="emoji-picker-grid" key={emojiCodepointsSet.size}>
                  {getRenderableEmojisForPicker(EMOJI_CATEGORY_ORDER[inputEmojiCategory] ?? '', emojiCodepointsSet).map(({ codepoint, character }, idx) => (
                    <button
                      key={`${inputEmojiCategory}-${idx}-${codepoint}`}
                      type="button"
                      className="emoji-picker-btn"
                      onClick={() => {
                        const el = inputRef.current;
                        if (el) {
                          el.focus();
                          el.insertEmojiAtCursor(codepoint);
                        }
                        setShowInputEmojiPicker(false);
                      }}
                      title={codepoint}
                      aria-label={`Emoji ${codepoint}`}
                    >
                      <span className="emoji-picker-emoji-wrap">
                        <img
                          src={getEmojiImageUrlByCodepoint(codepoint)}
                          alt=""
                          className="emoji-picker-twemoji"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="emoji-picker-attribution" aria-hidden>
                Emoji artwork by <a href="https://twemoji.twitter.com/" target="_blank" rel="noopener noreferrer">Twemoji</a>
              </p>
            </div>
          )}
          <EmojiInput
            ref={inputRef}
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={editingMessageId ? 'Edit message (Enter to save)' : `Message #${channelName} (Enter to send)`}
            aria-label="Message channel"
            disabled={!ready || sendBlockedUntil > Date.now()}
            className="chat-text-input"
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!ready || sendBlockedUntil > Date.now()}
            aria-label="Send message"
          >
            SEND
          </button>
        </div>
      </form>
      </div>
      {messageMenuAnchor && createPortal(
        (() => {
          const { left, top } = getPopupPosition(messageMenuAnchor.rect, POPUP_WIDTH);
          return (
        <>
          <div className="voice-member-popup-backdrop" aria-hidden onClick={() => setMessageMenuAnchor(null)} />
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
              <button type="button" onClick={() => { setEmojiPickerFor({ messageId: messageMenuAnchor.message.id, rect: messageMenuAnchor.rect }); setMessageMenuAnchor(null); }}>
                React
              </button>
              <button type="button" onClick={() => { setReplyToMessage(messageMenuAnchor.message); setMessageMenuAnchor(null); inputRef.current?.focus(); }}>
                Reply
              </button>
              {(messageMenuAnchor.message.authorName === myUsername || isServerAdmin) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const m = messageMenuAnchor.message;
                      setEditingMessageId(m.id);
                      setInput(m.content);
                      setImagePreview(m.attachment?.type === 'image' ? m.attachment.url : null);
                      setMessageMenuAnchor(null);
                      inputRef.current?.focus();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      send({ type: 'delete_message', channelId: channelId!, messageId: messageMenuAnchor.message.id });
                      setMessageMenuAnchor(null);
                    }}
                  >
                    Delete
                  </button>
                </>
              )}
              <button type="button" onClick={() => setMessageMenuAnchor(null)}>Close</button>
            </div>
          </div>
        </>
          );
        })(),
        document.getElementById('portal-root') || document.body
      )}
      {emojiPickerFor && createPortal(
        (() => {
          const { left, top } = getPopupPosition(emojiPickerFor.rect, EMOJI_PICKER_WIDTH);
          return (
        <>
          <div className="voice-member-popup-backdrop" aria-hidden onClick={() => setEmojiPickerFor(null)} />
          <div
            className="voice-member-popup channel-options-popup emoji-picker-popup emoji-picker-popup-categorized"
            style={{
              position: 'fixed',
              left,
              top,
              zIndex: 1001,
              width: EMOJI_PICKER_WIDTH,
              maxHeight: EMOJI_PICKER_HEIGHT,
            }}
          >
            <div className="emoji-picker-categories">
              {EMOJI_CATEGORY_ORDER.map((cat, i) => (
                <button
                  key={cat}
                  type="button"
                  className={`emoji-picker-cat-btn ${i === reactionEmojiCategory ? 'active' : ''}`}
                  onClick={() => setReactionEmojiCategory(i)}
                  title={cat}
                  aria-label={cat}
                >
                  {(() => {
                    const tab = getCategoryTabFromPicker(cat, emojiCodepointsSet);
                    const url = tab ? getEmojiImageUrlByCodepoint(tab.codepoint) : '';
                    return url ? <img src={url} alt="" className="emoji-picker-twemoji" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null;
                  })()}
                </button>
              ))}
            </div>
            <div className="emoji-picker-grid-wrap">
              <div className="emoji-picker-grid" key={emojiCodepointsSet.size}>
                {getRenderableEmojisForPicker(EMOJI_CATEGORY_ORDER[reactionEmojiCategory] ?? '', emojiCodepointsSet).map(({ codepoint, character }, idx) => (
                  <button
                    key={`react-${reactionEmojiCategory}-${idx}-${codepoint}`}
                    type="button"
                    className="emoji-picker-btn"
                    onClick={() => {
                      send({ type: 'add_reaction', channelId: channelId!, messageId: emojiPickerFor.messageId, emoji: character });
                      setEmojiPickerFor(null);
                    }}
                    title={codepoint}
                    aria-label={`Emoji ${codepoint}`}
                  >
                    <span className="emoji-picker-emoji-wrap">
                      <img
                        src={getEmojiImageUrlByCodepoint(codepoint)}
                        alt=""
                        className="emoji-picker-twemoji"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <p className="emoji-picker-attribution" aria-hidden>
              Emoji artwork by <a href="https://twemoji.twitter.com/" target="_blank" rel="noopener noreferrer">Twemoji</a>
            </p>
            <button type="button" className="emoji-picker-close" onClick={() => setEmojiPickerFor(null)}>Close</button>
          </div>
        </>
          );
        })(),
        document.getElementById('portal-root') || document.body
      )}
      <GifPicker
        open={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onPick={(url) => {
          sendGifFromPicker(url);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
}
