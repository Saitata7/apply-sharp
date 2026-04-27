/**
 * Tracker kanban view.
 *
 * Built on @dnd-kit/core's useDraggable + useDroppable so drag and drop
 * actually communicate. The previous version mixed native HTML5 draggable
 * with @dnd-kit/core useDroppable; the two systems do not talk to each
 * other and the drop never fired (review caught this as a ship blocker).
 *
 * Cards use useDraggable so they emit dnd-kit pointer events, columns use
 * useDroppable so they consume the same events, and onDragEnd reads
 * `event.over.id` (the column status) and `event.active.id` (the
 * application id).
 */

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import type { Application, ApplicationStatus } from '@shared/types/application.types';

interface Props {
  applications: Application[];
  onChangeStatus: (id: string, status: ApplicationStatus) => void;
}

const COLUMNS: { status: ApplicationStatus; label: string; color: string }[] = [
  { status: 'saved', label: 'Saved', color: '#94a3b8' },
  { status: 'in_progress', label: 'In progress', color: '#fbbf24' },
  { status: 'submitted', label: 'Submitted', color: '#3b82f6' },
  { status: 'under_review', label: 'Under review', color: '#8b5cf6' },
  { status: 'interview', label: 'Interview', color: '#10b981' },
  { status: 'offer', label: 'Offer', color: '#22c55e' },
  { status: 'rejected', label: 'Rejected', color: '#ef4444' },
  { status: 'ghosted', label: 'Ghosted', color: '#a8a29e' },
];

function Card({ app, isDragging }: { app: Application; isDragging?: boolean }) {
  const company = app.jdSnapshot?.company ?? '(unknown)';
  const title = app.jdSnapshot?.title ?? '';
  return (
    <div
      style={{
        padding: 8,
        background: 'var(--sf-raised)',
        borderRadius: 6,
        border: '1px solid var(--bd-default)',
        cursor: 'grab',
        fontSize: 12,
        boxShadow: isDragging ? 'var(--sh-lg)' : 'var(--sh-sm)',
        opacity: isDragging ? 0.85 : 1,
        color: 'var(--tx-primary)',
      }}
    >
      <div style={{ fontWeight: 600 }}>{company}</div>
      <div style={{ color: 'var(--tx-secondary)' }}>{title}</div>
    </div>
  );
}

function DraggableCard({ app }: { app: Application }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <Card app={app} isDragging={isDragging} />
    </div>
  );
}

function Column({
  status,
  label,
  color,
  apps,
}: {
  status: ApplicationStatus;
  label: string;
  color: string;
  apps: Application[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '0 0 220px',
        background: isOver ? 'var(--ac-amber-ghost)' : 'var(--sf-overlay)',
        border: `2px solid ${isOver ? color : 'var(--bd-default)'}`,
        borderRadius: 8,
        padding: 8,
        minHeight: 200,
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 8,
          padding: '4px 6px',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            marginRight: 8,
          }}
          aria-hidden="true"
        />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: 'var(--tx-primary)' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--tx-secondary)' }}>{apps.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {apps.map((app) => (
          <DraggableCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}

export default function TrackerKanban({ applications, onChangeStatus }: Props) {
  const [draggingApp, setDraggingApp] = useState<Application | null>(null);
  // Mouse + keyboard sensors so the kanban is fully usable without a mouse.
  // KeyboardSensor uses Space/Enter to grab a card and arrow keys to move it
  // between droppables, then Space/Enter again to drop.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const byStatus = new Map<ApplicationStatus, Application[]>();
  for (const col of COLUMNS) byStatus.set(col.status, []);
  for (const app of applications) {
    const list = byStatus.get(app.status);
    if (list) list.push(app);
  }

  function handleDragStart(event: DragStartEvent) {
    const app = applications.find((a) => a.id === event.active.id);
    setDraggingApp(app ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const draggedId = event.active?.id;
    if (typeof overId === 'string' && typeof draggedId === 'string') {
      const draggedApp = applications.find((a) => a.id === draggedId);
      if (draggedApp && draggedApp.status !== overId) {
        onChangeStatus(draggedId, overId as ApplicationStatus);
      }
    }
    setDraggingApp(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingApp(null)}
    >
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
        {COLUMNS.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            color={col.color}
            apps={byStatus.get(col.status) ?? []}
          />
        ))}
      </div>
      <DragOverlay>{draggingApp ? <Card app={draggingApp} isDragging /> : null}</DragOverlay>
    </DndContext>
  );
}
