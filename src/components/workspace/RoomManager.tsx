import React from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
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
  return (
    <section className="flex h-[calc(100vh-150px)] flex-col rounded-[18px] border border-slate-200 bg-gradient-to-b from-white to-slate-50/30 p-1.5 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Rooms / Areas</h3>
        <span className="text-[10px] text-slate-400">{rooms.length}</span>
      </div>

      <div className="mb-1.5 min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
        {rooms.map((room) => (
          <div
            key={room.id}
            className={`group rounded-[12px] border transition-colors ${
              activeRoomId === room.id
                ? 'border-blue-300 bg-blue-50/70 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.08)]'
                : 'border-slate-200/80 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex h-8 items-center justify-between gap-1 px-2">
              <button onClick={() => onSelectRoom(room.id)} className={`text-[12px] text-left truncate flex-1 pr-1 ${activeRoomId === room.id ? 'font-semibold text-blue-800' : 'font-medium text-slate-700'}`} title={room.roomName}>
                {room.roomName}
              </button>
              <div className="hidden group-hover:flex items-center gap-0.5">
                <button onClick={() => onRenameRoom(room)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => onDuplicateRoom(room)} className="p-1 rounded hover:bg-slate-100 text-slate-500"><Copy className="w-3 h-3" /></button>
                <button onClick={() => onDeleteRoom(room)} className="p-1 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[14px] border border-slate-200 bg-white/90 p-2">
        <button onClick={onOpenCreateRoom} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-blue-700 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-800">
          <Plus className="w-3.5 h-3.5" /> Add Room
        </button>
        <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Create the room first, then add starter lines from Takeoff or Estimate.</p>
      </div>
    </section>
  );
}
