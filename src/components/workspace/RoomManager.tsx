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
    <section className="flex max-h-[min(70vh,720px)] min-h-[280px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:max-h-[calc(100vh-170px)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-bold tracking-tight text-slate-900">Rooms</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-600">
          {rooms.length}
        </span>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          className="ui-input ui-input--leading-icon-sm h-9 rounded-lg text-sm"
          placeholder="Search room"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search rooms"
        />
      </div>

      <div className="mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">No rooms match that search.</p>
        ) : (
          filtered.map((room) => {
            const active = activeRoomId === room.id;
            return (
              <div
                key={room.id}
                className={`group rounded-xl border transition-colors ${
                  active ? 'border-transparent shadow-md' : 'border-slate-200/90 bg-white hover:border-slate-300'
                }`}
                style={active ? { background: 'var(--brand)', borderColor: 'transparent' } : undefined}
              >
                <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectRoom(room.id)}
                    className={`min-w-0 flex-1 truncate text-left text-[13px] ${active ? 'font-bold text-white' : 'font-semibold text-slate-800'}`}
                    title={room.roomName}
                  >
                    {room.roomName}
                  </button>
                  <div className={`flex shrink-0 items-center gap-0.5 ${active ? 'opacity-100' : ''}`}>
                    <button
                      type="button"
                      onClick={() => onRenameRoom(room)}
                      className={`rounded-md p-1.5 transition-colors ${active ? 'text-white/90 hover:bg-white/15' : 'text-slate-500 hover:bg-slate-100'}`}
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateRoom(room)}
                      className={`rounded-md p-1.5 transition-colors ${active ? 'text-white/90 hover:bg-white/15' : 'text-slate-500 hover:bg-slate-100'}`}
                      title="Duplicate"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRoom(room)}
                      className={`rounded-md p-1.5 transition-colors ${active ? 'text-white/90 hover:bg-red-500/30' : 'text-slate-500 hover:bg-red-50 hover:text-red-600'}`}
                      title="Delete room"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2.5">
        <button
          type="button"
          onClick={onOpenCreateRoom}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-700 text-[12px] font-semibold text-white shadow-sm hover:bg-blue-800"
        >
          <Plus className="h-4 w-4" /> Add room
        </button>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">Name the room, then add lines.</p>
      </div>
    </section>
  );
}
