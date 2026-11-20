import React, { useState } from 'react';
import CrmIcon from '../../components/CrmIcon';
import { apiCall } from '../../lib/api';

interface EditLeadModalProps {
  lead: any;
  onClose: () => void;
  onRefresh: () => void;
  onShowToast: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}

export default function EditLeadModal({
  lead,
  onClose,
  onRefresh,
  onShowToast,
}: EditLeadModalProps) {
  const [activeTab, setActiveTab] = useState<'student' | 'family' | 'academic'>('student');
  const [saving, setSaving] = useState(false);

  // Student Fields
  const [studentName, setStudentName] = useState(lead.studentName || '');
  const [studentGender, setStudentGender] = useState(lead.studentGender || 'male');
  const [studentDob, setStudentDob] = useState(
    lead.studentDob ? String(lead.studentDob).slice(0, 10) : ''
  );
  const [academicYear, setAcademicYear] = useState(lead.academicYear || '2026-27');
  const [currentGrade, setCurrentGrade] = useState(lead.currentGrade || 'Class 5');
  const [applyingForGrade, setApplyingForGrade] = useState(
    lead.applyingForGrade || (lead.classGrade ? `Class ${lead.classGrade}` : 'Class 6')
  );
  const [preferredBoard, setPreferredBoard] = useState(lead.preferredBoard || 'CBSE');
  const [boardingPreference, setBoardingPreference] = useState(
    lead.boardingPreference || 'boarding'
  );

  // Family & Contacts
  const [fatherName, setFatherName] = useState(lead.fatherName || lead.parentName || '');
  const [fatherOccupation, setFatherOccupation] = useState(lead.fatherOccupation || '');
  const [motherName, setMotherName] = useState(lead.motherName || '');
  const [motherOccupation, setMotherOccupation] = useState(lead.motherOccupation || '');
  const [guardianName, setGuardianName] = useState(lead.guardianName || '');
  const [guardianMobile, setGuardianMobile] = useState(lead.guardianMobile || '');
  const [parentPhone, setParentPhone] = useState(lead.parentPhone || lead.mobile || '');
  const [alternateMobile, setAlternateMobile] = useState(lead.alternateMobile || '');
  const [whatsappNumber, setWhatsappNumber] = useState(lead.whatsappNumber || '');
  const [parentEmail, setParentEmail] = useState(lead.parentEmail || '');
  const [preferredContactTime, setPreferredContactTime] = useState(
    lead.preferredContactTime || 'evening'
  );

  // Location, Budget & Requirements
  const [city, setCity] = useState(lead.city || '');
  const [preferredLocation, setPreferredLocation] = useState(lead.preferredLocation || '');
  const [annualBudget, setAnnualBudget] = useState(
    lead.annualBudget || (lead.budgetMax ? `₹${(lead.budgetMax / 100000).toFixed(1)} Lakhs` : '₹4.0 - 6.0 Lakhs')
  );
  const [budgetMax, setBudgetMax] = useState(String(lead.budgetMax || 500000));
  const [parentRequirements, setParentRequirements] = useState(lead.parentRequirements || '');
  const [priority, setPriority] = useState(lead.priority || 'MEDIUM');
  const [notes, setNotes] = useState(lead.notes || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      onShowToast('Student Name is required.', 'warning');
      return;
    }
    if (!parentPhone.trim()) {
      onShowToast('Primary Parent Mobile is required.', 'warning');
      return;
    }

    setSaving(true);
    try {
      await apiCall(`/leads/${lead.id}`, 'PUT', {
        version: lead.version ?? 1,
        studentName: studentName.trim(),
        studentGender,
        studentDob: studentDob || null,
        academicYear,
        currentGrade,
        applyingForGrade,
        preferredBoard,
        boardingPreference,
        fatherName: fatherName.trim(),
        fatherOccupation: fatherOccupation.trim(),
        motherName: motherName.trim(),
        motherOccupation: motherOccupation.trim(),
        guardianName: guardianName.trim(),
        guardianMobile: guardianMobile.trim(),
        parentPhone: parentPhone.trim(),
        alternateMobile: alternateMobile.trim(),
        whatsappNumber: whatsappNumber.trim() || parentPhone.trim(),
        parentEmail: parentEmail.trim(),
        preferredContactTime,
        city: city.trim(),
        preferredLocation: preferredLocation.trim(),
        annualBudget,
        budgetMax: Number(budgetMax) || 500000,
        parentRequirements: parentRequirements.trim(),
        priority,
        notes: notes.trim(),
      });

      onShowToast(`Lead for ${studentName} updated successfully!`, 'success');
      onRefresh();
      onClose();
    } catch (err: any) {
      if (err?.message?.includes('register') || err?.message?.includes('Duplicate') || err?.message?.includes('phone number')) {
        onShowToast(err.message, 'danger');
      } else if (err?.status === 409 || err?.statusCode === 409) {
        onShowToast(
          err?.message || 'Optimistic Locking Conflict: This record was modified by another user. Please refresh and retry.',
          'danger'
        );
      } else {
        onShowToast(err?.message || 'Failed to update lead.', 'danger');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 2100 }} onClick={onClose}>
      <div
        className="modal-content"
        style={{
          maxWidth: '780px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          background: '#FFFFFF',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            background: '#123B70',
            color: '#FFFFFF',
            padding: '16px 20px',
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CrmIcon name="edit" size={18} /> Edit Student &amp; Parent Lead
            </h3>
            <span style={{ fontSize: '12px', color: '#CBD5E1' }}>
              Lead ID: <strong>{lead.leadNumber || lead.id?.slice(0, 8)}</strong> &bull; Version: v{lead.version ?? 1}
            </span>
          </div>
          <button
            className="btn btn-sm btn-outline"
            style={{ color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)', background: 'transparent' }}
            onClick={onClose}
          >
            <CrmIcon name="x" size={16} />
          </button>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #E2E8F0',
            background: '#F8FAFC',
            padding: '0 16px',
            gap: '8px',
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'student' ? 'btn-primary' : 'btn-outline'}`}
            style={{ borderRadius: '6px 6px 0 0', margin: '8px 0 0 0' }}
            onClick={() => setActiveTab('student')}
          >
            <CrmIcon name="user" size={14} /> Student &amp; Academic
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'family' ? 'btn-primary' : 'btn-outline'}`}
            style={{ borderRadius: '6px 6px 0 0', margin: '8px 0 0 0' }}
            onClick={() => setActiveTab('family')}
          >
            <CrmIcon name="phone" size={14} /> Family &amp; Contacts
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'academic' ? 'btn-primary' : 'btn-outline'}`}
            style={{ borderRadius: '6px 6px 0 0', margin: '8px 0 0 0' }}
            onClick={() => setActiveTab('academic')}
          >
            <CrmIcon name="map-pin" size={14} /> City, Budget &amp; Notes
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div
            className="modal-body"
            style={{
              padding: '20px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {activeTab === 'student' && (
              <div className="lead-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Student Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="e.g. Aryan Kumar"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Gender</label>
                  <select
                    className="form-control"
                    value={studentGender}
                    onChange={(e) => setStudentGender(e.target.value)}
                  >
                    <option value="male">Male (Boy)</option>
                    <option value="female">Female (Girl)</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Date of Birth (DOB)</label>
                  <input
                    type="date"
                    className="form-control"
                    value={studentDob}
                    onChange={(e) => setStudentDob(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Academic Session / Year</label>
                  <select
                    className="form-control"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                  >
                    <option value="2026-27">2026-27 (Upcoming)</option>
                    <option value="2025-26">2025-26 (Current)</option>
                    <option value="2027-28">2027-28</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Current Grade / Class</label>
                  <input
                    type="text"
                    className="form-control"
                    value={currentGrade}
                    onChange={(e) => setCurrentGrade(e.target.value)}
                    placeholder="e.g. Class 5"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Applying For Grade / Class *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={applyingForGrade}
                    onChange={(e) => setApplyingForGrade(e.target.value)}
                    placeholder="e.g. Class 6"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Preferred Board</label>
                  <select
                    className="form-control"
                    value={preferredBoard}
                    onChange={(e) => setPreferredBoard(e.target.value)}
                  >
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE / ISC</option>
                    <option value="IB">IB (International Baccalaureate)</option>
                    <option value="Cambridge">Cambridge / IGCSE</option>
                    <option value="State Board">State Board</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>School Type Preference</label>
                  <select
                    className="form-control"
                    value={boardingPreference}
                    onChange={(e) => setBoardingPreference(e.target.value)}
                  >
                    <option value="boarding">Full Boarding (Residential)</option>
                    <option value="day_boarding">Day Boarding</option>
                    <option value="day_school">Day School</option>
                  </select>
                </div>
              </div>
            )}

            {activeTab === 'family' && (
              <div className="lead-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Father's Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="e.g. Suresh Kumar"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Father's Occupation</label>
                  <input
                    type="text"
                    className="form-control"
                    value={fatherOccupation}
                    onChange={(e) => setFatherOccupation(e.target.value)}
                    placeholder="e.g. Business / Doctor / Govt"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Mother's Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    placeholder="e.g. Sunita Devi"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Mother's Occupation</label>
                  <input
                    type="text"
                    className="form-control"
                    value={motherOccupation}
                    onChange={(e) => setMotherOccupation(e.target.value)}
                    placeholder="e.g. Housewife / Teacher / Professional"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Guardian Name (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="e.g. Rajesh (Uncle)"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Guardian Mobile (Optional)</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={guardianMobile}
                    onChange={(e) => setGuardianMobile(e.target.value)}
                    placeholder="+919876543255"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Primary Mobile * (+91 Normalized)</label>
                  <input
                    type="tel"
                    className="form-control"
                    required
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="+919876543210"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Alternate Mobile (Backup)</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={alternateMobile}
                    onChange={(e) => setAlternateMobile(e.target.value)}
                    placeholder="+919876543211"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>WhatsApp Number</label>
                  <input
                    type="tel"
                    className="form-control"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+919876543210"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Parent Email Address</label>
                  <input
                    type="email"
                    className="form-control"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                  />
                </div>
              </div>
            )}

            {activeTab === 'academic' && (
              <div className="lead-form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Resident City</label>
                  <input
                    type="text"
                    className="form-control"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Delhi / Mumbai / Lucknow"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Preferred School City / Location</label>
                  <input
                    type="text"
                    className="form-control"
                    value={preferredLocation}
                    onChange={(e) => setPreferredLocation(e.target.value)}
                    placeholder="e.g. Dehradun / Mussoorie / Nainital"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Annual Budget Range</label>
                  <input
                    type="text"
                    className="form-control"
                    value={annualBudget}
                    onChange={(e) => setAnnualBudget(e.target.value)}
                    placeholder="e.g. ₹4.0 - 6.0 Lakhs"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Max Budget Cap (₹)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    placeholder="600000"
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Lead Priority</label>
                  <select
                    className="form-control"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent (Hot Lead)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label" style={{ fontWeight: 600 }}>Preferred Calling Time</label>
                  <select
                    className="form-control"
                    value={preferredContactTime}
                    onChange={(e) => setPreferredContactTime(e.target.value)}
                  >
                    <option value="morning">Morning (9 AM - 12 PM)</option>
                    <option value="afternoon">Afternoon (12 PM - 4 PM)</option>
                    <option value="evening">Evening (4 PM - 8 PM)</option>
                    <option value="anytime">Anytime</option>
                  </select>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>Parent Requirements &amp; Special Needs</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={parentRequirements}
                    onChange={(e) => setParentRequirements(e.target.value)}
                    placeholder="Parent wants single-occupancy hostel, swimming facility, vegetarian food..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="modal-footer"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid #E2E8F0',
              background: '#F8FAFC',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
            }}
          >
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ background: '#123B70', borderColor: '#123B70', display: 'flex', alignItems: 'center', gap: '6px' }}
              disabled={saving}
            >
              <CrmIcon name="check" size={16} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
