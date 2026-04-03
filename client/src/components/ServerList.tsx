import { useState, useEffect, useRef, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { ServerInfo } from '../App';
import { IconLink } from './UiIcons';

interface ServerListProps {
  servers: ServerInfo[];
  /** First server created in this instance (main hub); sub-servers render below a divider. */
  mainServerId?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreateServer: (name: string) => void;
  onJoinClick?: () => void;
  onReorderServers?: (serverIds: string[]) => void;
  /** When false, hide "Add server" (only server owners / first-server bootstrap may create). */
  canAddServer?: boolean;
}

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

const REORDER_GRACE_MS = 1200;

export function ServerList({
  servers,
  mainServerId,
  selectedId,
  onSelect,
  onCreateServer,
  onJoinClick,
  onReorderServers,
  canAddServer = true,
}: ServerListProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [localServers, setLocalServers] = useState<ServerInfo[]>(servers);
  const lastReorderAtRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastReorderAtRef.current >= REORDER_GRACE_MS) {
      setLocalServers(servers);
    }
  }, [servers]);

  useEffect(() => {
    if (!canAddServer) {
      setShowCreate(false);
      setNewName('');
    }
  }, [canAddServer]);

  const main = useMemo(
    () => (mainServerId ? localServers.find((s) => s.id === mainServerId) : undefined),
    [localServers, mainServerId]
  );
  const subs = useMemo(() => {
    if (!mainServerId || !main) return localServers;
    return localServers.filter((s) => s.id !== mainServerId);
  }, [localServers, mainServerId, main]);

  const splitUi = !!(mainServerId && main);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (name) {
      onCreateServer(name);
      setNewName('');
      setShowCreate(false);
    }
  };

  const handleDragEnd = (result: { destination: { index: number } | null; source: { index: number } }) => {
    if (!onReorderServers || !result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;

    if (!splitUi || !main) {
      const reordered = reorder(localServers, source.index, destination.index);
      lastReorderAtRef.current = Date.now();
      setLocalServers(reordered);
      onReorderServers(reordered.map((s) => s.id));
      setTimeout(() => {
        lastReorderAtRef.current = 0;
      }, REORDER_GRACE_MS);
      return;
    }

    const reorderedSubs = reorder(subs, source.index, destination.index);
    lastReorderAtRef.current = Date.now();
    setLocalServers([main, ...reorderedSubs]);
    onReorderServers([main.id, ...reorderedSubs.map((s) => s.id)]);
    setTimeout(() => {
      lastReorderAtRef.current = 0;
    }, REORDER_GRACE_MS);
  };

  const canReorder = !!onReorderServers;

  return (
    <>
      {onJoinClick && (
        <button
          type="button"
          className="server-icon server-icon-join"
          title="Join a server"
          aria-label="Join a server"
          onClick={onJoinClick}
        >
          <IconLink />
        </button>
      )}
      {canReorder ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          {splitUi && main && (
            <div className="server-list-main-block">
              <button
                type="button"
                className={`server-icon server-icon-main ${selectedId === main.id ? 'active' : ''}`}
                onClick={() => onSelect(selectedId === main.id ? null : main.id)}
                title={main.name}
              >
                {main.iconUrl ? (
                  <img src={main.iconUrl} alt="" className="server-icon-img" />
                ) : (
                  main.name.slice(0, 1).toUpperCase()
                )}
              </button>
              {subs.length > 0 && <div className="server-list-main-sub-divider" role="separator" aria-hidden />}
            </div>
          )}
          <Droppable droppableId="servers" direction="vertical">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="servers-droppable"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                {(splitUi ? subs : localServers).map((s, index) => (
                  <Draggable key={s.id} draggableId={s.id} index={index} disableInteractiveElementBlocking>
                    {(dragProvided, snapshot) => (
                      <button
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        {...dragProvided.dragHandleProps}
                        type="button"
                        className={`server-icon ${selectedId === s.id ? 'active' : ''} ${snapshot.isDragging ? 'server-dragging' : ''}`}
                        onClick={() => onSelect(selectedId === s.id ? null : s.id)}
                        title={s.name}
                      >
                        {s.iconUrl ? (
                          <img src={s.iconUrl} alt="" className="server-icon-img" />
                        ) : (
                          s.name.slice(0, 1).toUpperCase()
                        )}
                      </button>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <>
          {splitUi && main && (
            <div className="server-list-main-block">
              <button
                type="button"
                className={`server-icon server-icon-main ${selectedId === main.id ? 'active' : ''}`}
                onClick={() => onSelect(selectedId === main.id ? null : main.id)}
                title={main.name}
              >
                {main.iconUrl ? (
                  <img src={main.iconUrl} alt="" className="server-icon-img" />
                ) : (
                  main.name.slice(0, 1).toUpperCase()
                )}
              </button>
              {subs.length > 0 && <div className="server-list-main-sub-divider" role="separator" aria-hidden />}
            </div>
          )}
          {(splitUi ? subs : localServers).map((s) => (
            <button
              key={s.id}
              type="button"
              className={`server-icon ${selectedId === s.id ? 'active' : ''}`}
              onClick={() => onSelect(selectedId === s.id ? null : s.id)}
              title={s.name}
            >
              {s.iconUrl ? (
                <img src={s.iconUrl} alt="" className="server-icon-img" />
              ) : (
                s.name.slice(0, 1).toUpperCase()
              )}
            </button>
          ))}
        </>
      )}
      {canAddServer &&
        (showCreate ? (
          <form onSubmit={handleCreate} className="server-create-form">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Server name"
              className="server-create-input"
              autoFocus
              maxLength={100}
              onBlur={() => {
                if (!newName.trim()) setShowCreate(false);
              }}
            />
            <button type="submit" className="server-create-submit">
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="server-icon"
            title="Add server"
            aria-label="Add server"
            onClick={() => setShowCreate(true)}
          >
            +
          </button>
        ))}
    </>
  );
}
