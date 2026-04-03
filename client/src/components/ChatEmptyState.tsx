import {
  IconHash,
  IconHeadphones,
  IconMessageSquare,
  IconServer,
  IconShield,
  IconUsers,
} from './UiIcons';

const ICON_MAP = {
  hash: IconHash,
  voice: IconHeadphones,
  messages: IconMessageSquare,
  shield: IconShield,
  server: IconServer,
  users: IconUsers,
} as const;

export type ChatEmptyIcon = keyof typeof ICON_MAP;

export function ChatEmptyState({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: ChatEmptyIcon;
}) {
  const I = icon ? ICON_MAP[icon] : null;
  return (
    <div className="chat-empty-inner">
      <div className="chat-empty-brand" aria-hidden>
        <span className="chat-empty-logo">Bahuckel</span>
      </div>
      {I && <I className="chat-empty-icon" />}
      <p className="chat-empty-title">{title}</p>
      {subtitle ? <p className="chat-empty-sub">{subtitle}</p> : null}
    </div>
  );
}
