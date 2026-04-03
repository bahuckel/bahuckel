import { useState, useEffect } from 'react';

interface ResetRequest {
  id: string;
  username: string;
  requestedAt: string;
  status: 'approved' | 'failed';
  answerMatch: boolean;
}

interface JoinRequest {
  id: string;
  serverId: string;
  serverName: string;
  username: string;
  requestedAt: string;
}

interface ServerInfo {
  id: string;
  name: string;
  ownerId?: string;
  members?: string[];
  kicked?: string[];
}

interface AdminPanelProps {
  onClose: () => void;
  send: (msg: Record<string, unknown>) => void;
  subscribe: (listener: (msg: Record<string, unknown>) => void) => () => void;
  isGlobalOwner?: boolean;
  servers?: ServerInfo[];
  currentUsername?: string;
}

export function AdminPanel({ onClose, send, subscribe, isGlobalOwner = false, servers = [], currentUsername = '' }: AdminPanelProps) {
  const [requests, setRequests] = useState<ResetRequest[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  const loadResetRequests = () => {
    send({ type: 'get_reset_requests' });
  };

  const loadJoinRequests = () => {
    send({ type: 'get_join_requests' });
  };

  const loadAll = () => {
    if (isGlobalOwner) loadResetRequests();
    loadJoinRequests();
  };

  useEffect(() => {
    loadAll();
    return subscribe((msg: Record<string, unknown>) => {
      if (msg.type === 'reset_requests' && Array.isArray(msg.requests)) {
        setRequests(msg.requests as ResetRequest[]);
      }
      if (msg.type === 'join_requests' && Array.isArray(msg.requests)) {
        setJoinRequests(msg.requests as JoinRequest[]);
      }
      if (msg.type === 'join_request_processed') {
        loadJoinRequests();
      }
    });
  }, [send, subscribe, isGlobalOwner]);

  return (
    <div className="username-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="username-modal admin-panel admin-panel-wide" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2 className="username-modal-title">Admin panel</h2>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <button type="button" className="admin-panel-refresh" onClick={loadAll}>Refresh all</button>

        {isGlobalOwner && (
          <>
            <h3 className="admin-panel-section-title">Password reset requests</h3>
            <p className="admin-panel-desc">Users who requested a password reset. Approved = answer matched; Failed = wrong answer.</p>
            <div className="admin-panel-list">
              {requests.length === 0 ? (
                <p className="admin-panel-empty">No reset requests yet.</p>
              ) : (
                <table className="admin-panel-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td>{r.username}</td>
                        <td>{new Date(r.requestedAt).toLocaleString()}</td>
                        <td className={r.status === 'approved' ? 'admin-status-ok' : 'admin-status-fail'}>
                          {r.status === 'approved' ? 'Approved' : 'Failed'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <h3 className="admin-panel-section-title">Join requests</h3>
        <p className="admin-panel-desc">Users who requested to join a server you own. Accept to add them to the server.</p>
        <div className="admin-panel-list">
          {joinRequests.length === 0 ? (
            <p className="admin-panel-empty">No pending join requests.</p>
          ) : (
            <table className="admin-panel-table">
              <thead>
                <tr>
                  <th>Server</th>
                  <th>User</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {joinRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.serverName}</td>
                    <td>{r.username}</td>
                    <td>{new Date(r.requestedAt).toLocaleString()}</td>
                    <td className="admin-panel-actions">
                      <button type="button" className="admin-btn-accept" onClick={() => send({ type: 'accept_join_request', requestId: r.id })}>Accept</button>
                      <button type="button" className="admin-btn-decline" onClick={() => send({ type: 'decline_join_request', requestId: r.id })}>Decline</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <h3 className="admin-panel-section-title">Server members &amp; kick</h3>
        <p className="admin-panel-desc">Kick removes a user from the server; they cannot re-join until you allow them back.</p>
        {servers.length === 0 ? (
          <p className="admin-panel-empty">You don&apos;t own any servers.</p>
        ) : (
          <div className="admin-panel-list">
            {servers.map((server) => (
              <div key={server.id} className="admin-server-block">
                <h4 className="admin-server-name">{server.name}</h4>
                <div className="admin-server-members">
                  <span className="admin-server-label">Members:</span>
                  {(server.members ?? []).length === 0 ? (
                    <span className="admin-panel-empty">None</span>
                  ) : (
                    <ul className="admin-member-list">
                      {(server.members ?? []).map((u) => (
                        <li key={u}>
                          {u}
                          {u !== currentUsername && (
                            <button type="button" className="admin-btn-kick" onClick={() => send({ type: 'kick_member', serverId: server.id, username: u })}>Kick</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="admin-server-kicked">
                  <span className="admin-server-label">Kicked (allow back to re-join):</span>
                  {(server.kicked ?? []).length === 0 ? (
                    <span className="admin-panel-empty">None</span>
                  ) : (
                    <ul className="admin-member-list">
                      {(server.kicked ?? []).map((u) => (
                        <li key={u}>
                          {u}
                          <button type="button" className="admin-btn-allow" onClick={() => send({ type: 'allow_back_member', serverId: server.id, username: u })}>Allow back</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
