import { IconClipboard, IconCrown, IconPhoneCall, IconPhoneOff, IconUsers } from './UiIcons';

interface ChatHeaderProps {
  title: string;
  /** Show Requests button (for users who can approve join requests) */
  showRequests?: boolean;
  requestsCount?: number;
  onOpenRequests?: () => void;
  requestsOpen?: boolean;
  /** Show Roles button (for server owner/admins) */
  showRoles?: boolean;
  onOpenRoles?: () => void;
  /** Show Users button (for everyone with guest+ access) */
  showUsers?: boolean;
  onToggleUsers?: () => void;
  usersPanelOpen?: boolean;
  /** Optional status text, e.g. "connecting..." */
  statusText?: string;
  /** Friends DM: start voice call with this friend */
  showVoiceCallButton?: boolean;
  onVoiceCall?: () => void;
  /** True when already in a friend DM voice session */
  inDmFriendVoice?: boolean;
  onLeaveDmVoice?: () => void;
}

export function ChatHeader({
  title,
  showRequests = false,
  requestsCount = 0,
  onOpenRequests,
  requestsOpen = false,
  showRoles = false,
  onOpenRoles,
  showUsers = false,
  onToggleUsers,
  usersPanelOpen = false,
  statusText,
  showVoiceCallButton = false,
  onVoiceCall,
  inDmFriendVoice = false,
  onLeaveDmVoice,
}: ChatHeaderProps) {
  return (
    <div className="chat-header chat-header-with-actions">
      <span className="chat-header-title">
        {title}
        {statusText && <span className="chat-status"> ({statusText})</span>}
      </span>
      <div className="chat-header-actions">
        {inDmFriendVoice && onLeaveDmVoice && (
          <button type="button" className="chat-header-btn chat-header-voice-call" onClick={onLeaveDmVoice} title="Leave voice" aria-label="Leave voice">
            <IconPhoneOff className="chat-header-btn-icon" />
          </button>
        )}
        {!inDmFriendVoice && showVoiceCallButton && onVoiceCall && (
          <button type="button" className="chat-header-btn chat-header-voice-call" onClick={onVoiceCall} title="Voice call" aria-label="Start voice call">
            <IconPhoneCall className="chat-header-btn-icon" />
          </button>
        )}
        {showRequests && onOpenRequests && (
          <button
            type="button"
            className={`chat-header-btn ${requestsOpen ? 'active' : ''}`}
            onClick={onOpenRequests}
            title="Join requests"
            aria-label="Join requests"
          >
            <IconClipboard className="chat-header-btn-icon" />
            <span>Requests</span>
            {requestsCount > 0 && (
              <span className="chat-header-badge">{requestsCount}</span>
            )}
          </button>
        )}
        {showRoles && onOpenRoles && (
          <button
            type="button"
            className="chat-header-btn"
            onClick={onOpenRoles}
            title="Roles"
            aria-label="Roles"
          >
            <IconCrown className="chat-header-btn-icon" />
            <span>Roles</span>
          </button>
        )}
        {showUsers && onToggleUsers && (
          <button
            type="button"
            className={`chat-header-btn chat-header-users-btn ${usersPanelOpen ? 'active' : ''}`}
            onClick={onToggleUsers}
            title="Users"
            aria-label="Users"
          >
            <IconUsers className="chat-header-btn-icon" />
            <span>Users</span>
          </button>
        )}
      </div>
    </div>
  );
}
