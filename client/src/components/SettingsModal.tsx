import { useSettings } from '../context/SettingsContext';

interface SettingsModalProps {
  onClose: () => void;
  send: (msg: Record<string, unknown>) => void;
}

export function SettingsModal({ onClose, send }: SettingsModalProps) {
  const { settings, setMicVolume, setSpeakerVolume, setNameColor } = useSettings();
  const handleNameColorChange = (color: string) => {
    setNameColor(color);
    send({ type: 'set_my_name_color', color });
  };

  return (
    <div className="username-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" onClick={onClose}>
      <div className="username-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2 id="settings-modal-title">Settings</h2>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="settings-modal-body">
          <label className="settings-row">
            <span className="settings-label">Microphone volume</span>
            <input
              type="range"
              min="0"
              max="200"
              value={Math.round(settings.micVolume * 100)}
              onChange={(e) => setMicVolume(Number(e.target.value) / 100)}
            />
            <span className="settings-value">{Math.round(settings.micVolume * 100)}%</span>
          </label>
          <label className="settings-row">
            <span className="settings-label">Speaker volume</span>
            <input
              type="range"
              min="0"
              max="200"
              value={Math.round(settings.speakerVolume * 100)}
              onChange={(e) => setSpeakerVolume(Number(e.target.value) / 100)}
            />
            <span className="settings-value">{Math.round(settings.speakerVolume * 100)}%</span>
          </label>
          <label className="settings-row">
            <span className="settings-label">Your name color in chat</span>
            <input
              type="color"
              value={settings.nameColor}
              onChange={(e) => handleNameColorChange(e.target.value)}
              className="settings-color-input"
            />
            <input
              type="text"
              value={settings.nameColor}
              onChange={(e) => handleNameColorChange(e.target.value)}
              className="settings-color-text"
              maxLength={7}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
