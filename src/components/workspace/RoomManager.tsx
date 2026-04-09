import React, { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { RoomRecord } from '../../shared/types/estimator';

interface Props {
  rooms: RoomRecord[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onOpenCreateRoom: () => void;
  onRenameRoom: (room: RoomRecord) => void;
  onDuplicateRoom: (room: RoomRecord) => void;
  onDeleteRoom: (room: RoomRecord) => void;
}

export function RoomManager({
  rooms,
  activeRoomId,
  onSelectRoom,
  onOpenCreateRoom,
  onRenameRoom,
  onDuplicateRoom,
  onDeleteRoom,
}: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) => r.roomName.toLowerCase().includes(q));
  }, [rooms, query]);

  return (
    <section className="flex h-[calc(100vh-150px)] flex-col rounded-[18px] border border-slate-200 bg-gradient-to-b from-white to-slate-50/30 p-2 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-bold tracking-tight text-slate-900">Rooms</h3>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
          {rooms.length}
        </span>
      </div>

      <div className="relative mb-2 px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          className="ui-input ui-input--leading-icon-sm h-9 w-full rounded-[12px] text-sm"
          placeholder="Search room"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search rooms"
        />
      </div>

      <div className="mb-1.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 px-0.5">
        {filtered.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-500">No rooms match.</p>
        ) : (
          filtered.map((room) => {
            const active = activeRoomId === room.id;
            return (
              <div
                key={room.id}
                className={`group rounded-[12px] border transition-colors ${
                  active
                    ? 'border-transparent shadow-md'
                    : 'border-slate-200/80 bg-white hover:border-slate-300'
                }`}
                style={active ? { background: 'var(--brand)', borderColor: 'transparent' } : undefined}
              >
                <div className="flex h-8 items-center justify-between gap-1 px-2">
                  <button
                    type="button"
                    onClick={() => onSelectRoom(room.id)}
                    className={`flex-1 truncate pr-1 text-left text-[12px] ${active ? 'font-bold text-white' : 'font-semibold text-slate-800'}`}
                    title={room.roomName}
                  >
                    {room.roomName}
                  </button>
                  <div className={`flex items-center gap-0.5 ${active ? 'flex' : 'hidden group-hover:flex'}`}>
                    <button
                      type="button"
                      onClick={() => onRenameRoom(room)}
                      className={`rounded p-1 ${active ? 'text-white/90 hover:bg-white/15' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateRoom(room)}
                      className={`rounded p-1 ${active ? 'text-white/90 hover:bg-white/15' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRoom(room)}
                      className={`rounded p-1 ${active ? 'text-white/90 hover:bg-red-500/30' : 'text-slate-500 hover:bg-red-50 hover:text-red-600'}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-[14px] border border-slate-200 bg-white/90 p-2">
        <button
          type="button"
          onClick={onOpenCreateRoom}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] bg-blue-700 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <Plus className="h-3.5 w-3.5" /> Add Room
        </button>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Create the room first, then add starter lines from Takeoff or Estimate.</p>
      </div>
    </section>
  );
}
