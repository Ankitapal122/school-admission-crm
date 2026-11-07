import React, { useState } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, MapPin, School, AlertCircle, Award, GripVertical } from 'lucide-react';

export interface LeadCardData {
  id: string;
  leadNumber: string;
  studentName: string;
  applyingForGrade: string;
  parentName: string;
  parentPhone: string;
  city: string;
  budget: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  stage: string;
  counsellor: string;
}

const INITIAL_PIPELINE: Record<string, LeadCardData[]> = {
  NEW_LEAD: [
    {
      id: 'lead-1',
      leadNumber: 'LD-2026-0001',
      studentName: 'Aarav Malhotra',
      applyingForGrade: 'Class 9',
      parentName: 'Rajiv Malhotra',
      parentPhone: '+91 98111 22334',
      city: 'Delhi NCR',
      budget: '₹8-12 Lakhs',
      priority: 'HIGH',
      stage: 'NEW_LEAD',
      counsellor: 'Rahul Sharma',
    },
    {
      id: 'lead-2',
      leadNumber: 'LD-2026-0002',
      studentName: 'Devansh Joshi',
      applyingForGrade: 'Class 11',
      parentName: 'Alok Joshi',
      parentPhone: '+91 98333 44556',
      city: 'Lucknow',
      budget: '₹6-9 Lakhs',
      priority: 'MEDIUM',
      stage: 'NEW_LEAD',
      counsellor: 'Rahul Sharma',
    },
  ],
  CONTACTED: [
    {
      id: 'lead-3',
      leadNumber: 'LD-2026-0003',
      studentName: 'Ananya Singhal',
      applyingForGrade: 'Class 7',
      parentName: 'Dr. Vivek Singhal',
      parentPhone: '+91 98222 33445',
      city: 'Mumbai',
      budget: '₹12-16 Lakhs',
      priority: 'URGENT',
      stage: 'CONTACTED',
      counsellor: 'Priya Bisht',
    },
  ],
  SCHOOL_TOUR_SCHEDULED: [
    {
      id: 'lead-4',
      leadNumber: 'LD-2026-0004',
      studentName: 'Rohan Thapa',
      applyingForGrade: 'Class 8',
      parentName: 'Col. Bikram Thapa',
      parentPhone: '+91 97444 55667',
      city: 'Chandigarh',
      budget: '₹7-10 Lakhs',
      priority: 'HIGH',
      stage: 'SCHOOL_TOUR_SCHEDULED',
      counsellor: 'Rahul Sharma',
    },
  ],
  APPLICATION_SUBMITTED: [
    {
      id: 'lead-5',
      leadNumber: 'LD-2026-0005',
      studentName: 'Meera Chawla',
      applyingForGrade: 'Class 6',
      parentName: 'Sanjay Chawla',
      parentPhone: '+91 98555 66778',
      city: 'Jaipur',
      budget: '₹9-14 Lakhs',
      priority: 'MEDIUM',
      stage: 'APPLICATION_SUBMITTED',
      counsellor: 'Priya Bisht',
    },
  ],
  ADMISSION_CONFIRMED: [
    {
      id: 'lead-6',
      leadNumber: 'LD-2026-0006',
      studentName: 'Kabir Oberoi',
      applyingForGrade: 'Class 10',
      parentName: 'Harsh Oberoi',
      parentPhone: '+91 98666 77889',
      city: 'Dehradun',
      budget: '₹14-18 Lakhs',
      priority: 'HIGH',
      stage: 'ADMISSION_CONFIRMED',
      counsellor: 'Rahul Sharma',
    },
  ],
};

const STAGE_CONFIG: Record<string, { title: string; color: string; border: string }> = {
  NEW_LEAD: { title: 'New Leads', color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  CONTACTED: { title: 'Contacted & Pitch', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
  SCHOOL_TOUR_SCHEDULED: { title: 'School Tour Scheduled', color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
  APPLICATION_SUBMITTED: { title: 'Application Submitted', color: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200' },
  ADMISSION_CONFIRMED: { title: 'Admission Confirmed', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
};

function KanbanCard({ item }: { item: LeadCardData }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: item,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priorityBadge = {
    URGENT: 'bg-red-100 text-red-700 border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM: 'bg-blue-100 text-blue-700 border-blue-200',
    LOW: 'bg-slate-100 text-slate-700 border-slate-200',
  }[item.priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow relative group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-400">{item.leadNumber}</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityBadge}`}>
            {item.priority}
          </span>
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 p-0.5"
            title="Drag card"
          >
            <GripVertical size={14} />
          </button>
        </div>
      </div>

      <h4 className="font-bold text-[#123B70] text-sm mb-1">{item.studentName}</h4>
      <div className="text-xs text-slate-500 mb-2">{item.applyingForGrade} &bull; {item.city}</div>

      <div className="space-y-1 text-xs text-slate-600 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-slate-700">{item.parentName}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <Phone size={12} />
          <span>{item.parentPhone}</span>
        </div>
        <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-200/60 mt-1">
          <span>Budget: <strong className="text-slate-700">{item.budget}</strong></span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
        <span>Counsellor:</span>
        <span className="font-semibold text-[#123B70]">{item.counsellor}</span>
      </div>
    </div>
  );
}

function KanbanColumn({
  id,
  title,
  leads,
  color,
  border,
}: {
  id: string;
  title: string;
  leads: LeadCardData[];
  color: string;
  border: string;
}) {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-[280px] max-w-[320px] bg-slate-100/70 rounded-2xl p-3 border border-slate-200 flex flex-col"
    >
      <div className="flex items-center justify-between pb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${color} ${border}`}>
            {title}
          </span>
        </div>
        <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs">
          {leads.length}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
        <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard key={lead.id} item={lead} />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="h-28 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-xs text-slate-400">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const [columns, setColumns] = useState(INITIAL_PIPELINE);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findContainer = (id: string): string | null => {
    if (columns[id]) return id;
    for (const [colId, items] of Object.entries(columns)) {
      if (items.some((item) => item.id === id)) return colId;
    }
    return null;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer) return;

    if (activeContainer !== overContainer) {
      setColumns((prev) => {
        const activeItems = [...prev[activeContainer]];
        const overItems = [...prev[overContainer]];

        const activeIndex = activeItems.findIndex((i) => i.id === active.id);
        const item = activeItems[activeIndex];

        activeItems.splice(activeIndex, 1);
        overItems.push({ ...item, stage: overContainer });

        return {
          ...prev,
          [activeContainer]: activeItems,
          [overContainer]: overItems,
        };
      });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-extrabold text-[#123B70]">Lead Pipeline Kanban</h2>
          <p className="text-xs text-slate-500 mt-1">
            Drag and drop parent enquiries across admissions stages in real-time.
          </p>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-6">
          {Object.entries(STAGE_CONFIG).map(([stageKey, config]) => (
            <KanbanColumn
              key={stageKey}
              id={stageKey}
              title={config.title}
              color={config.color}
              border={config.border}
              leads={columns[stageKey] || []}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
