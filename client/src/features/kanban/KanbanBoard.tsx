import React, { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, MapPin, Award, GripVertical } from 'lucide-react';
import { apiCall } from '../../lib/api';
import { BLUEPRINT_KANBAN_STAGES } from '../../lib/roles';

export interface KanbanLeadItem {
  id: string;
  leadNumber: string;
  studentName: string;
  applyingForGrade: string;
  parentName: string;
  parentPhone: string;
  city: string;
  budget: string;
  priority: string;
  stage: string;
  counsellor: string;
  score: number;
  version: number;
  raw?: any;
}

interface KanbanBoardProps {
  leads?: any[];
  onRefresh?: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
  onSelectLead?: (lead: any) => void;
}

const LEGACY_STAGE_MAP: Record<string, string> = {
  new_lead: 'new',
  new: 'new',
  contacted: 'contacted',
  qualified: 'qualified',
  shortlisted: 'shortlisted',
  campus_visit_scheduled: 'application_submitted',
  application_submitted: 'application_submitted',
  entrance_scheduled: 'entrance_scheduled',
  interview_scheduled: 'interview_scheduled',
  selected: 'selected',
  offer_accepted: 'selected',
  fee_paid: 'fee_paid',
  admission_done: 'admission_done',
  admission_confirmed: 'admission_done',
  enrolled: 'enrolled',
  commission_received: 'commission_received',
};

function normalizeStageKey(stage?: string): string {
  const s = String(stage || 'new').trim().toLowerCase();
  return LEGACY_STAGE_MAP[s] || (BLUEPRINT_KANBAN_STAGES.some((st) => st.key === s) ? s : 'new');
}

function mapRawLead(raw: any): KanbanLeadItem {
  const budgetMin = raw.budgetMin ?? raw.budget_min;
  const budgetMax = raw.budgetMax ?? raw.budget_max;
  const budgetLabel =
    budgetMin || budgetMax
      ? `₹${Math.round(Number(budgetMin || 0) / 100000)}-${Math.round(Number(budgetMax || 0) / 100000)}L`
      : raw.budget || 'Flexible';

  return {
    id: String(raw.id),
    leadNumber: String(raw.leadNumber || raw.lead_id || raw.id?.slice(0, 8) || ''),
    studentName: String(raw.studentName || raw.student_name || 'Student'),
    applyingForGrade: String(raw.admissionClass || raw.applyingForGrade || raw.class_applying || 'Class 6'),
    parentName: String(raw.fatherName || raw.parentName || raw.father_name || raw.motherName || 'Parent'),
    parentPhone: String(raw.fatherPhone || raw.mobile || raw.primary_mobile || ''),
    city: String(raw.city || raw.preferredLocation || 'Uttarakhand'),
    budget: budgetLabel,
    priority: Number(raw.score || raw.leadScore || 0) >= 75 ? 'HIGH' : 'MEDIUM',
    stage: normalizeStageKey(raw.stage || raw.current_stage),
    counsellor: String(raw.assignedTo?.fullName || raw.counsellorName || 'Unassigned'),
    score: Number(raw.score || raw.leadScore || 0),
    version: Number(raw.version || 1),
    raw,
  };
}

function SortableLeadCard({
  lead,
  onStageChange,
  onSelectLead,
}: {
  lead: KanbanLeadItem;
  onStageChange: (lead: KanbanLeadItem, newStage: string) => void;
  onSelectLead?: (lead: any) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '10px',
    padding: '10px',
    boxShadow: isDragging ? '0 8px 20px rgba(15,23,42,0.16)' : '0 1px 2px rgba(15,23,42,0.04)',
    marginBottom: '8px',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <button
          type="button"
          onClick={() => onSelectLead && lead.raw && onSelectLead(lead.raw)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: '#123B70',
            fontWeight: 800,
            fontSize: '11px',
            cursor: onSelectLead ? 'pointer' : 'default',
          }}
        >
          {lead.leadNumber}
        </button>
        <span
          style={{
            background: lead.score >= 70 ? '#DCFCE7' : '#EFF6FF',
            color: lead.score >= 70 ? '#166534' : '#1D4ED8',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <Award size={10} /> {lead.score}
        </span>
        <span
          {...attributes}
          {...listeners}
          title="Drag to move stage"
          style={{ cursor: 'grab', color: '#94A3B8', display: 'inline-flex' }}
        >
          <GripVertical size={14} />
        </span>
      </div>

      <div
        onClick={() => onSelectLead && lead.raw && onSelectLead(lead.raw)}
        style={{
          fontWeight: 700,
          fontSize: '13px',
          color: '#0F172A',
          marginTop: '4px',
          cursor: onSelectLead ? 'pointer' : 'default',
        }}
      >
        {lead.studentName}
      </div>
      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
        {lead.applyingForGrade} &bull; {lead.budget}
      </div>

      <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Phone size={11} /> {lead.parentName} ({lead.parentPhone || 'N/A'})
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={11} /> {lead.city} &bull; v{lead.version}
        </span>
      </div>

      {/* Mobile / accessible fallback stage selector (<360px friendly without mouse drag) */}
      <div style={{ marginTop: '8px' }}>
        <select
          className="form-control"
          aria-label={`Change stage for ${lead.studentName}`}
          value={lead.stage}
          onChange={(e) => onStageChange(lead, e.target.value)}
          style={{ fontSize: '11px', padding: '4px 6px', height: '28px' }}
        >
          {BLUEPRINT_KANBAN_STAGES.map((st) => (
            <option key={st.key} value={st.key}>
              Stage: {st.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function DroppableColumn({
  stage,
  items,
  onStageChange,
  onSelectLead,
}: {
  stage: (typeof BLUEPRINT_KANBAN_STAGES)[number];
  items: KanbanLeadItem[];
  onStageChange: (lead: KanbanLeadItem, newStage: string) => void;
  onSelectLead?: (lead: any) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage.key}` });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: '250px',
        maxWidth: '270px',
        flex: '0 0 255px',
        background: isOver ? '#E0F2FE' : '#F8FAFC',
        border: `1px solid ${isOver ? stage.accent : '#E2E8F0'}`,
        borderTop: `3px solid ${stage.accent}`,
        borderRadius: '10px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '620px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 800, color: stage.color }}>
          {stage.label}
        </span>
        <span
          style={{
            background: stage.bg,
            color: stage.color,
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: 800,
            padding: '2px 8px',
          }}
        >
          {items.length}
        </span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center', padding: '18px 6px' }}>
              Drop lead here
            </div>
          ) : (
            items.map((lead) => (
              <SortableLeadCard
                key={lead.id}
                lead={lead}
                onStageChange={onStageChange}
                onSelectLead={onSelectLead}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export default function KanbanBoard({
  leads: externalLeads,
  onRefresh,
  onShowToast,
  onSelectLead,
}: KanbanBoardProps) {
  const [internalLeads, setInternalLeads] = useState<any[]>([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOwnLeads = async () => {
    try {
      const res = await apiCall('/leads');
      setInternalLeads(res?.leads || res?.items || res?.data || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!externalLeads) {
      loadOwnLeads();
    }
  }, [externalLeads]);

  const rawList = externalLeads || internalLeads;
  const items = useMemo(
    () =>
      (Array.isArray(rawList) ? rawList : [])
        .filter((l) => String(l?.status || '').toLowerCase() !== 'merged')
        .map(mapRawLead),
    [rawList]
  );

  const columns = useMemo(() => {
    const grouped: Record<string, KanbanLeadItem[]> = {};
    for (const st of BLUEPRINT_KANBAN_STAGES) {
      grouped[st.key] = [];
    }
    for (const item of items) {
      grouped[item.stage]?.push(item);
    }
    return grouped;
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleMoveStage = async (lead: KanbanLeadItem, targetStage: string) => {
    if (!targetStage || targetStage === lead.stage || updatingId === lead.id) return;
    setUpdatingId(lead.id);
    try {
      await apiCall(`/leads/${lead.id}/stage`, 'PATCH', {
        stage: targetStage,
        version: lead.version,
      });
      if (onShowToast) {
        const label = BLUEPRINT_KANBAN_STAGES.find((s) => s.key === targetStage)?.label || targetStage;
        onShowToast(`Moved ${lead.studentName} to ${label}`, 'success');
      }
      if (onRefresh) onRefresh();
      else await loadOwnLeads();
    } catch (err: any) {
      if (err?.status === 409) {
        if (onShowToast) {
          onShowToast('Record updated by another user. Refreshing Kanban pipeline...', 'warning');
        }
        if (onRefresh) onRefresh();
        else await loadOwnLeads();
      } else if (onShowToast) {
        onShowToast(err?.message || 'Failed to update lead stage.', 'danger');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const draggedLead = items.find((i) => i.id === String(active.id));
    if (!draggedLead) return;

    const overId = String(over.id);
    let targetStage = '';
    if (overId.startsWith('col:')) {
      targetStage = overId.slice(4);
    } else {
      const targetLead = items.find((i) => i.id === overId);
      if (targetLead) targetStage = targetLead.stage;
    }

    if (targetStage && targetStage !== draggedLead.stage) {
      await handleMoveStage(draggedLead, targetStage);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '12.5px', color: '#475569' }}>
          <strong>12-Stage Live Admission Pipeline</strong> ({items.length} active leads) &mdash; Drag cards or use the stage selector on mobile.
        </div>
        {updatingId && (
          <span className="badge badge-warning">Saving stage transition...</span>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            paddingBottom: '12px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {BLUEPRINT_KANBAN_STAGES.map((stage) => (
            <DroppableColumn
              key={stage.key}
              stage={stage}
              items={columns[stage.key] || []}
              onStageChange={handleMoveStage}
              onSelectLead={onSelectLead}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
