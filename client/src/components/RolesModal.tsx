import { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const REORDER_GRACE_MS = 1200;

export type RolePermissions = {
  deleteMessages?: boolean;
  manageChannels?: boolean;
  manageRoles?: boolean;
  manageMembers?: boolean;
  approveJoinRequests?: boolean;
  accessAdminPanel?: boolean;
  createServer?: boolean;
};

interface RoleWithPerms {
  id: string;
  name: string;
  weight: number;
  permissions?: RolePermissions;
}

interface RolesModalProps {
  serverName?: string;
  roles: RoleWithPerms[];
  onCreateRole: (name: string, weight: number, permissions: RolePermissions) => void;
  onReorderRoles?: (roleIds: string[]) => void;
  onUpdateRoleName?: (roleId: string, newName: string) => void;
  onClose: () => void;
}

const PERM_LABELS: { key: keyof RolePermissions; label: string }[] = [
  { key: 'deleteMessages', label: 'Delete other users\' messages' },
  { key: 'manageChannels', label: 'Manage channels (create, rename, delete, reorder)' },
  { key: 'manageRoles', label: 'Manage roles (create, edit, assign)' },
  { key: 'manageMembers', label: 'Manage members (add, kick)' },
  { key: 'approveJoinRequests', label: 'Approve join requests' },
  { key: 'accessAdminPanel', label: 'Access admin panel & debug tools' },
  { key: 'createServer', label: 'Create servers (Add server button)' },
];

function reorderRoles<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

export function RolesModal({ serverName, roles, onCreateRole, onReorderRoles, onUpdateRoleName, onClose }: RolesModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPermissions, setNewPermissions] = useState<RolePermissions>({});
  const [error, setError] = useState<string | null>(null);
  const [localRoles, setLocalRoles] = useState<RoleWithPerms[]>(() => [...roles].sort((a, b) => a.weight - b.weight));
  const lastReorderAtRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastReorderAtRef.current >= REORDER_GRACE_MS) {
      setLocalRoles([...roles].sort((a, b) => a.weight - b.weight));
    }
  }, [roles]);

  const handleAddRole = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const name = newName.trim();
    if (!name) {
      setError('Enter a role name');
      return;
    }
    if (localRoles.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setError('A role with this name already exists');
      return;
    }
    const weight = 5000;
    onCreateRole(name, weight, newPermissions);
    setNewName('');
    setNewPermissions({});
    setShowAddForm(false);
  };

  const handleDragEnd = (result: { destination: { index: number } | null; source: { index: number } }) => {
    if (!onReorderRoles || !result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    const reordered = reorderRoles(localRoles, source.index, destination.index);
    lastReorderAtRef.current = Date.now();
    setLocalRoles(reordered);
    onReorderRoles(reordered.map((r) => r.id));
    setTimeout(() => { lastReorderAtRef.current = 0; }, REORDER_GRACE_MS);
  };

  const rolesByPower = localRoles;

  const togglePerm = (key: keyof RolePermissions) => {
    setNewPermissions((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-invite roles-modal" onClick={(e) => e.stopPropagation()}>
        <div className="roles-modal-header">
          <h3>👑 Roles — {serverName || 'Server'}</h3>
          <button type="button" className="roles-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="roles-modal-hint">
          Drag to reorder (Owner and Guest are locked). Assign roles in the Users panel (👥).
        </p>
        <div className="roles-modal-list-wrap">
          <h4>Roles by power</h4>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="roles">
              {(provided) => (
                <ul className="roles-modal-list" ref={provided.innerRef} {...provided.droppableProps}>
                  {rolesByPower.map((r, index) => {
                    const isLocked = r.id === 'owner' || r.id === 'guest';
                    const canDrag = !isLocked && !!onReorderRoles;
                    const canRename = !!onUpdateRoleName;
                    return (
                      <Draggable key={r.id} draggableId={r.id} index={index} isDragDisabled={!canDrag}>
                        {(provided, snapshot) => (
                          <li
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...(canDrag ? provided.dragHandleProps : {})}
                            className={`roles-modal-role ${canDrag ? 'draggable' : ''} ${snapshot.isDragging ? 'drop-target' : ''}`}
                          >
                            {canDrag && <span className="roles-modal-drag-handle" aria-hidden>⋮⋮</span>}
                            {canRename ? (
                              <input
                                type="text"
                                className="roles-modal-role-name-input"
                                key={`${r.id}-${r.name}`}
                                defaultValue={r.name}
                                onBlur={(e) => {
                                  const v = e.target.value.trim();
                                  if (v && v !== r.name) onUpdateRoleName(r.id, v);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                maxLength={32}
                                title="Change display name (e.g. King instead of Owner)"
                              />
                            ) : (
                              <span className="roles-modal-role-name">{r.name}</span>
                            )}
                            <span className="roles-modal-role-weight">
                              {r.id === 'owner' ? '(locked)' : r.id === 'guest' ? '(locked)' : ''}
                            </span>
                            {isLocked && <span className="roles-modal-lock" title="Locked">🔒</span>}
                          </li>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        </div>
        {!showAddForm ? (
          <div className="roles-modal-actions">
            <button type="button" className="roles-modal-add-btn" onClick={() => setShowAddForm(true)}>
              + Add new role
            </button>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleAddRole} className="roles-modal-add-form">
            <h4>New role</h4>
            {error && <p className="roles-modal-error">{error}</p>}
            <label>
              <span>Role name</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Admin, Moderator"
                className="roles-modal-input"
                maxLength={32}
              />
            </label>
            <div className="roles-modal-permissions">
              <strong>Permissions</strong>
              {PERM_LABELS.map(({ key, label }) => (
                <label key={key} className="roles-modal-perm-row">
                  <input
                    type="checkbox"
                    checked={!!newPermissions[key]}
                    onChange={() => togglePerm(key)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="roles-modal-form-actions">
              <button type="button" onClick={() => { setShowAddForm(false); setError(null); }}>Cancel</button>
              <button type="submit">Create role</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
