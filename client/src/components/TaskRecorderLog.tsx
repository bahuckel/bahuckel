import { useState, useEffect } from 'react';
import { getTaskLog, clearTaskLog, subscribeTaskLog, type TaskLogEntry } from '../utils/taskRecorder';

export function TaskRecorderLog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TaskLogEntry[]>(() => getTaskLog());

  // Only subscribe when panel is open to avoid re-renders on every click when closed
  useEffect(() => {
    if (!open) return;
    setEntries(getTaskLog());
    const unsub = subscribeTaskLog(() => setEntries(getTaskLog()));
    return unsub;
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      {open && (
        <div className="task-recorder-panel">
          <div className="task-recorder-header">
            <span>Task recorder (click vs app response)</span>
            <button type="button" onClick={clearTaskLog}>Clear</button>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="task-recorder-list">
            {entries.length === 0 ? (
              <p className="task-recorder-empty">No entries yet. Click the three dots next to the server name, then check here.</p>
            ) : (
              entries.slice().reverse().map((entry) => (
                <div key={entry.id} className="task-recorder-entry" data-type={entry.type}>
                  <span className="task-recorder-time">{entry.time}</span>
                  <span className="task-recorder-type">[{entry.type}]</span>
                  <span className="task-recorder-message">{entry.message}</span>
                  {entry.detail && Object.keys(entry.detail).length > 0 && (
                    <pre className="task-recorder-detail">{JSON.stringify(entry.detail, null, 0)}</pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
