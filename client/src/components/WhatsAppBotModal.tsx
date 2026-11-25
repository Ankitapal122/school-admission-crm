import React, { useEffect, useState } from 'react';
import CrmIcon from './CrmIcon';
import { apiCall } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

interface WhatsAppBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'danger' | 'warning') => void;
}

export default function WhatsAppBotModal({
  isOpen,
  onClose,
  onShowToast,
}: WhatsAppBotModalProps) {
  const { user } = useAuthStore();
  const roleTitle =
    user?.role === 'SUPER_ADMIN'
      ? 'Super Admin'
      : user?.role === 'SENIOR_MANAGER'
      ? 'Senior Manager'
      : 'Admission Counsellor';

  // Connection Status State
  const [botStatus, setBotStatus] = useState<any>({
    isConnected: false,
    activeNumber: null,
    qrCodeDataUrl: null,
    status: 'INITIALIZING',
    method: 'QR_SCAN',
  });
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Tab State: default to 'manual' (Link with phone number) on mobile devices, 'qr' on desktop
  const isMobileDevice =
    typeof window !== 'undefined' &&
    (/android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent) || window.innerWidth < 768);
  const [activeTab, setActiveTab] = useState<'qr' | 'manual'>(isMobileDevice ? 'manual' : 'qr');

  // Option 2: Official WhatsApp Link with Phone Number (8-Character Pairing Code)
  const [countryCode, setCountryCode] = useState('91');
  const [manualPhone, setManualPhone] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Budget-Based School Message State (For sending school details to parents by budget)
  const [budgetPhone, setBudgetPhone] = useState('');
  const [studentNameInput, setStudentNameInput] = useState('');
  const [selectedBudget, setSelectedBudget] = useState<number>(400000);
  const [matchedSchools, setMatchedSchools] = useState<any[]>([]);
  const [budgetMessage, setBudgetMessage] = useState('');
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [sendingBudgetSchools, setSendingBudgetSchools] = useState(false);

  // Direct Test Message State
  const [testMobile, setTestMobile] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from BoardingEdu Admission Team!');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchBotStatus = async () => {
    try {
      // First try counsellor-specific status, fallback to bot status
      const cRes = await apiCall('/whatsapp/bot/counsellor/status').catch(() => null);
      const cData = cRes?.data || cRes;
      if (cData?.isConnected) {
        setBotStatus(cData);
        return;
      }

      const res = await apiCall('/whatsapp/bot/status');
      const data = res?.data || res;
      setBotStatus(data);
    } catch {
      // Non-fatal polling error
    }
  };

  const fetchSchoolsForBudget = async (budget: number, student: string = '') => {
    setLoadingSchools(true);
    try {
      const res = await apiCall(`/whatsapp/bot/budget-schools?budget=${budget}`).catch(() => null);
      const data = res?.data || res;
      const schools = Array.isArray(data?.schools) ? data.schools : Array.isArray(data) ? data : [];
      setMatchedSchools(schools);

      // Construct professional personalized school message
      let list = '';
      schools.slice(0, 3).forEach((s: any, idx: number) => {
        const feeStr = s.minFeeAnnual
          ? `₹${(s.minFeeAnnual / 100000).toFixed(1)}L - ₹${(s.maxFeeAnnual / 100000).toFixed(1)}L/yr`
          : 'Fee on Request';
        const facilities =
          s.sports && s.sports.length > 0
            ? s.sports.slice(0, 3).join(', ')
            : 'Hostel, Sports, Swimming';
        list += `\n${idx + 1}. 🏫 *${s.name}* (${s.city || 'Uttarakhand'})\n   • Board: ${s.board || 'CBSE'}\n   • Annual Fee: ${feeStr}\n   • Key Highlights: ${facilities}\n`;
      });

      const greeting = student.trim()
        ? `Dear Parent, regarding school admission for ${student}:`
        : `Dear Parent, regarding boarding school admission:`;

      const sender = user?.fullName || 'Senior Manager';
      const senderNum = botStatus?.phone || manualPhone || '7249417658';
      const msg = `Hello! 🙏\n\n${greeting}\n\nI am ${sender} (${roleTitle}) from the BoardingEdu Admission Counselling Team.\n\nBased on your annual budget of ₹${(budget / 100000).toFixed(1)} Lakhs, here are Uttarakhand's top verified boarding schools:\n${list}\nWould you like to schedule an Online Live Zoom Tour or book an in-person physical campus visit to these schools?\n\nWarm Regards,\n${sender}\nBoardingEdu Partner\nWhatsApp / Call: +91 ${senderNum}`;

      setBudgetMessage(msg);
    } catch {
      // Non-fatal
    } finally {
      setLoadingSchools(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchBotStatus().finally(() => setLoading(false));
    fetchSchoolsForBudget(selectedBudget, studentNameInput);

    // Poll every 3 seconds for connection or QR updates
    const interval = setInterval(fetchBotStatus, 3000);
    return () => clearInterval(interval);
  }, [isOpen, selectedBudget]);

  const handleSendBudgetBrochure = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = budgetPhone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      if (onShowToast) onShowToast('Please enter a valid 10-digit parent mobile number.', 'warning');
      return;
    }
    setSendingBudgetSchools(true);
    try {
      const res = await apiCall('/whatsapp/bot/send-budget-schools', 'POST', {
        phone: clean,
        budget: selectedBudget,
        studentName: studentNameInput,
        message: budgetMessage,
      });
      const data = res?.data || res;
      if (onShowToast) {
        onShowToast(`Budget-matched school brochure sent to parent (+91 ${clean})!`, 'success');
      }
      if (data.waMeUrl && !data.delivered) {
        window.open(data.waMeUrl, '_blank');
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Failed to send brochure.', 'danger');
    } finally {
      setSendingBudgetSchools(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Do you want to disconnect this number and link a different WhatsApp account?')) {
      return;
    }
    setDisconnecting(true);
    try {
      await apiCall('/whatsapp/bot/counsellor/disconnect', 'POST', {}).catch(() => null);
      await apiCall('/whatsapp/bot/disconnect', 'POST', {}).catch(() => null);
      if (onShowToast) onShowToast('WhatsApp disconnected. You can now link a new device.', 'warning');
      setOtpSent(false);
      setPairingCode(null);
      setManualPhone('');
      setActiveTab(isMobileDevice ? 'manual' : 'qr');
      await fetchBotStatus();
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Disconnect failed.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleChangeNumber = async () => {
    setDisconnecting(true);
    try {
      await apiCall('/whatsapp/bot/counsellor/disconnect', 'POST', {}).catch(() => null);
      await apiCall('/whatsapp/bot/disconnect', 'POST', {}).catch(() => null);
      if (onShowToast) onShowToast('Enter your new WhatsApp phone number to link.', 'warning');
      setOtpSent(false);
      setPairingCode(null);
      setManualPhone('');
      setActiveTab('manual');
      await fetchBotStatus();
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Failed to switch number.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  // Option 2 Handler: Request Official 8-Character WhatsApp Pairing Code
  const handleSendWhatsappOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualPhone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      if (onShowToast) onShowToast('Please enter a valid 10-digit WhatsApp phone number.', 'warning');
      return;
    }
    setIsSendingOtp(true);
    setCopiedCode(false);
    try {
      const res = await apiCall('/whatsapp/bot/pair-code', 'POST', {
        phone: clean,
        countryCode,
      });
      const data = res?.data || res;
      if (!data?.pairingCode) {
        throw new Error('Could not generate pairing code. Please try again.');
      }
      setPairingCode(data.pairingCode);
      setOtpSent(true);
      if (onShowToast) {
        onShowToast(
          `Pairing code generated! Enter it in WhatsApp Linked Devices on your phone.`,
          'success',
        );
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Failed to generate pairing code. Please try again.', 'danger');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleCopyPairingCode = async () => {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode.replace(/-/g, ''));
      setCopiedCode(true);
      if (onShowToast) onShowToast('Pairing code copied! Paste it in WhatsApp.', 'success');
      setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      if (onShowToast) onShowToast('Unable to copy automatically. Please enter the 8-character code manually.', 'warning');
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = testMobile.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      if (onShowToast) onShowToast('Please enter a valid 10-digit mobile number.', 'warning');
      return;
    }
    setSendingTest(true);
    try {
      const res = await apiCall('/whatsapp/bot/counsellor/send', 'POST', {
        phone: clean,
        message: testMessage,
      });
      const data = res?.data || res;
      if (onShowToast) {
        onShowToast(data.message || `Test message sent to +91 ${clean}!`, 'success');
      }
      if (data.waMeUrl && !data.delivered) {
        window.open(data.waMeUrl, '_blank');
      }
      setTestMobile('');
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Failed to send test message.', 'danger');
    } finally {
      setSendingTest(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '580px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#F8FAFC',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#DCFCE7',
                border: '1px solid #86EFAC',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CrmIcon name="smartphone" size={20} color="#15803D" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                Connect WhatsApp ({user?.fullName ? `${user.fullName} - ${roleTitle}` : 'Manager / Counsellor / Admin'})
              </h3>
              <p style={{ margin: 0, fontSize: '11.5px', color: '#64748B' }}>
                Every manager, counsellor, and admin can link their personal WhatsApp number to send messages directly to parents.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CrmIcon name="x" size={16} />
          </button>
        </div>

        {/* If already connected, show Connected View */}
        {botStatus?.isConnected ? (
          <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                backgroundColor: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: '14px',
                padding: '16px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CrmIcon name="check" size={22} color="#FFFFFF" strokeWidth={2.8} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#166534' }}>
                  Personal WhatsApp Connected &amp; Active!
                </div>
                <div style={{ fontSize: '13px', color: '#15803D', marginTop: '2px', fontWeight: 700 }}>
                  Active Sender Number: +91 {botStatus.phone || botStatus.activeNumber || 'Connected'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '3px' }}>
                  User: <strong>{user?.fullName || 'Team Member'}</strong> ({roleTitle}) •{' '}
                  <span style={{ background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {botStatus.method === 'OTP_VERIFIED' ? (
                      <>
                        <CrmIcon name="check-circle" size={12} /> Verified via OTP
                      </>
                    ) : botStatus.method === 'PAIRING_CODE' ? (
                      <>
                        <CrmIcon name="key" size={12} /> Linked via Pairing Code
                      </>
                    ) : (
                      <>
                        <CrmIcon name="camera" size={12} /> QR Code Scanned
                      </>
                    )}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleChangeNumber}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1.5px solid #22C55E',
                  color: '#166534',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  whiteSpace: 'nowrap',
                }}
              >
                <CrmIcon name="refresh" size={13} /> Change / Add Number
              </button>
            </div>

            {/* FEATURE: SEND SCHOOL DETAILS BY PARENT'S BUDGET */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: '14px',
                padding: '16px 18px',
                border: '1.5px solid #E2E8F0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
              }}
            >
              {/* SENDER BADGE: Confirms message goes from logged-in number */}
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #86EFAC',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CrmIcon name="send" size={12} /> SENDER (MESSAGES WILL BE SENT FROM):
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#15803D' }}>
                    {user?.fullName || 'Manager'} ({roleTitle}) • <strong>+91 {botStatus?.phone || manualPhone || '7249417658'}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10.5px', background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <CrmIcon name="check-circle" size={11} color="#166534" /> CONNECTED
                  </span>
                  <button
                    type="button"
                    onClick={handleChangeNumber}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '5px',
                      background: '#FFFFFF',
                      border: '1px solid #86EFAC',
                      color: '#166534',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CrmIcon name="target" size={15} color="#2563EB" /> Send Recommended Boarding Schools to Parent
                </div>
                <span style={{ fontSize: '11px', background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                  Auto-Recommend
                </span>
              </div>

              {/* Input Row: Parent Phone & Student Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                    Parent Mobile Number:
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    className="form-control"
                    placeholder="10-digit Parent Mobile Number"
                    value={budgetPhone}
                    onChange={(e) => setBudgetPhone(e.target.value.replace(/\D/g, ''))}
                    style={{ fontSize: '12px', fontWeight: 600 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                    Student Name (Optional):
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Aarav"
                    value={studentNameInput}
                    onChange={(e) => {
                      setStudentNameInput(e.target.value);
                      fetchSchoolsForBudget(selectedBudget, e.target.value);
                    }}
                    style={{ fontSize: '12px' }}
                  />
                </div>
              </div>

              {/* Budget Quick Select Buttons */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
                    Parent's Annual Budget:
                  </label>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#2563EB' }}>
                    ₹{(selectedBudget / 100000).toFixed(1)} Lakhs / year
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[250000, 350000, 400000, 500000, 650000].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setSelectedBudget(b);
                        fetchSchoolsForBudget(b, studentNameInput);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: selectedBudget === b ? '1.5px solid #2563EB' : '1px solid #CBD5E1',
                        backgroundColor: selectedBudget === b ? '#EFF6FF' : '#FFFFFF',
                        color: selectedBudget === b ? '#1E40AF' : '#475569',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ₹{(b / 100000).toFixed(1)}L
                    </button>
                  ))}
                </div>
              </div>

              {/* Matched Schools Preview Pill Tags */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Matched Schools ({matchedSchools.length} Found):
                </label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {loadingSchools ? (
                    <span style={{ fontSize: '11px', color: '#64748B' }}>Loading matched schools...</span>
                  ) : matchedSchools.length > 0 ? (
                    matchedSchools.slice(0, 3).map((s: any) => (
                      <span
                        key={s.id}
                        style={{
                          background: '#E2E8F0',
                          color: '#0F172A',
                          fontSize: '10.5px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CrmIcon name="school" size={11} /> {s.name} ({s.minFeeAnnual ? `₹${(s.minFeeAnnual / 100000).toFixed(1)}L` : 'CBSE'})
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '11px', color: '#64748B' }}>Kasiga School, Doon School, Welham</span>
                  )}
                </div>
              </div>

              {/* WhatsApp Message Preview Textarea */}
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                  WhatsApp Message Preview (Editable):
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={budgetMessage}
                  onChange={(e) => setBudgetMessage(e.target.value)}
                  style={{ fontSize: '11px', width: '100%', lineHeight: 1.4, fontFamily: 'inherit' }}
                />
              </div>

              {/* Action Buttons: Send via Socket or Open in WhatsApp */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  disabled={sendingBudgetSchools || budgetPhone.length !== 10}
                  onClick={handleSendBudgetBrochure}
                  style={{
                    flex: 1,
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '9px 16px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: sendingBudgetSchools || budgetPhone.length !== 10 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {sendingBudgetSchools ? (
                    'Sending...'
                  ) : (
                    <>
                      <CrmIcon name="send" size={13} /> Send Budget Brochure to Parent
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const clean = budgetPhone.replace(/\D/g, '').slice(-10);
                    const encoded = encodeURIComponent(budgetMessage);
                    window.open(clean ? `https://wa.me/91${clean}?text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank');
                  }}
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#15803D',
                    border: '1.5px solid #86EFAC',
                    borderRadius: '8px',
                    padding: '9px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <CrmIcon name="whatsapp" size={14} /> Open WhatsApp
                </button>
              </div>
            </div>

            {/* Change Number Option */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                backgroundColor: '#F8FAFC',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Want to use a different phone number?
                </div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>
                  You can change or add another WhatsApp number anytime.
                </div>
              </div>
              <button
                type="button"
                disabled={disconnecting}
                onClick={handleChangeNumber}
                style={{
                  backgroundColor: '#EFF6FF',
                  color: '#1D4ED8',
                  border: '1px solid #BFDBFE',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: disconnecting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {disconnecting ? (
                  'Switching...'
                ) : (
                  <>
                    <CrmIcon name="refresh" size={13} /> Change / Switch Number
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Not Connected: Provide Both Options */
          <div>
            {/* Top Navigation Switcher Tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
              }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('qr')}
                style={{
                  flex: 1,
                  padding: '13px 16px',
                  border: 'none',
                  borderBottom: activeTab === 'qr' ? '2.5px solid #2563EB' : '2.5px solid transparent',
                  backgroundColor: activeTab === 'qr' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'qr' ? '#1E40AF' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <CrmIcon name="camera" size={15} />
                <span>Scan QR Code (Desktop)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                style={{
                  flex: 1,
                  padding: '13px 16px',
                  border: 'none',
                  borderBottom: activeTab === 'manual' ? '2.5px solid #16A34A' : '2.5px solid transparent',
                  backgroundColor: activeTab === 'manual' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'manual' ? '#15803D' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <CrmIcon name="smartphone" size={15} />
                <span>Link with Phone Number</span>
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto' }}>
              {activeTab === 'qr' ? (
                /* OPTION 1: SCAN QR CODE (DESKTOP) */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
                    Scan QR Code with Phone Camera
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
                    Scan this QR code using WhatsApp on your phone to link your account to the CRM.
                  </div>

                  {/* QR Box */}
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: '#FFFFFF',
                      borderRadius: '16px',
                      border: '2px solid #E2E8F0',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                      marginBottom: '16px',
                      minHeight: '250px',
                      minWidth: '250px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {botStatus?.qrCodeDataUrl ? (
                      <img
                        src={botStatus.qrCodeDataUrl}
                        alt="WhatsApp QR Code"
                        style={{ width: '230px', height: '230px', display: 'block' }}
                      />
                    ) : (
                      <div style={{ color: '#64748B', fontSize: '12px' }}>
                        {loading ? 'Generating QR Code...' : 'Generating QR Code... (Please wait a moment)'}
                      </div>
                    )}
                  </div>

                  {/* QR Instructions */}
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      border: '1px solid #E2E8F0',
                      fontSize: '12px',
                      color: '#334155',
                      textAlign: 'left',
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#0F172A' }}>How to scan the QR code:</div>
                    <div>1. Open <strong>WhatsApp</strong> on your phone.</div>
                    <div>2. Tap <strong>Menu (⋮)</strong> on Android or <strong>Settings</strong> on iPhone.</div>
                    <div>3. Tap <strong>Linked devices</strong>, then <strong>Link a device</strong>.</div>
                    <div>4. Point your phone camera at this screen to scan the QR code.</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('manual')}
                    style={{
                      marginTop: '16px',
                      background: 'none',
                      border: 'none',
                      color: '#15803D',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Link with phone number instead &rsaquo;
                  </button>
                </div>
              ) : (
                /* OPTION 2: LINK WITH PHONE NUMBER (OFFICIAL 8-CHAR WHATSAPP PAIRING CODE) */
                <div>
                  {!otpSent ? (
                    /* Step 1: Enter Phone Number (WhatsApp Web Style) */
                    <form
                      onSubmit={handleSendWhatsappOtp}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        padding: '8px 4px',
                      }}
                    >
                      <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
                        Enter phone number
                      </h3>
                      <p style={{ margin: '0 0 22px', fontSize: '13px', color: '#475569' }}>
                        Select a country and enter your WhatsApp phone number.
                      </p>

                      <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                        <div>
                          <select
                            value={countryCode}
                            onChange={(e) => setCountryCode(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '12px 14px',
                              borderRadius: '10px',
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: '#0F172A',
                              cursor: 'pointer',
                            }}
                          >
                            <option value="91">🇮🇳 India (+91)</option>
                            <option value="971">🇦🇪 United Arab Emirates (+971)</option>
                            <option value="44">United Kingdom (+44)</option>
                            <option value="1">🇺🇸 United States (+1)</option>
                            <option value="65">🇸🇬 Singapore (+65)</option>
                            <option value="977">🇳🇵 Nepal (+977)</option>
                          </select>
                        </div>

                        <div style={{ position: 'relative' }}>
                          <span
                            style={{
                              position: 'absolute',
                              top: '-9px',
                              left: '12px',
                              backgroundColor: '#FFFFFF',
                              padding: '0 4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#64748B',
                            }}
                          >
                            Phone number
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              border: '1.5px solid #94A3B8',
                              borderRadius: '10px',
                              backgroundColor: '#F8FAFC',
                              padding: '2px 12px',
                            }}
                          >
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginRight: '8px' }}>
                              +{countryCode}
                            </span>
                            <input
                              type="tel"
                              maxLength={10}
                              placeholder="Enter 10-digit number"
                              value={manualPhone}
                              onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, ''))}
                              style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                backgroundColor: 'transparent',
                                padding: '11px 4px',
                                fontSize: '15px',
                                fontWeight: 600,
                                color: '#0F172A',
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSendingOtp || manualPhone.length !== 10}
                        style={{
                          marginTop: '24px',
                          minWidth: '140px',
                          backgroundColor: isSendingOtp || manualPhone.length !== 10 ? '#94A3B8' : '#008069',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '999px',
                          padding: '11px 32px',
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: isSendingOtp || manualPhone.length !== 10 ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 6px rgba(0, 128, 105, 0.25)',
                        }}
                      >
                        {isSendingOtp ? 'Generating Code...' : 'Next'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveTab('qr')}
                        style={{
                          marginTop: '18px',
                          background: 'none',
                          border: 'none',
                          color: '#008069',
                          fontSize: '13.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Log in with QR code &rsaquo;
                      </button>
                    </form>
                  ) : (
                    /* Step 2: Enter 8-Character Code on Phone (WhatsApp Web Style) */
                    <div style={{ padding: '4px' }}>
                      <div style={{ marginBottom: '16px' }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: '#0F172A' }}>
                          Enter code on phone
                        </h3>
                        <div style={{ fontSize: '13px', color: '#475569' }}>
                          Linking WhatsApp account{' '}
                          <strong style={{ color: '#0F172A' }}>
                            +{countryCode} {manualPhone.slice(0, 3)} {manualPhone.slice(3, 6)} {manualPhone.slice(6)}
                          </strong>{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setOtpSent(false);
                              setPairingCode(null);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#008069',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            (edit)
                          </button>
                        </div>
                      </div>

                      {/* 8-Character Code Boxes (XXXX - XXXX) */}
                      <div
                        style={{
                          backgroundColor: '#F1F5F9',
                          borderRadius: '14px',
                          padding: '18px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '18px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          {(pairingCode || '--------')
                            .replace(/-/g, '')
                            .split('')
                            .slice(0, 8)
                            .map((ch, idx) => (
                              <React.Fragment key={idx}>
                                {idx === 4 && (
                                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#475569', padding: '0 2px' }}>
                                    -
                                  </span>
                                )}
                                <div
                                  style={{
                                    width: '38px',
                                    height: '44px',
                                    borderRadius: '8px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1.5px solid #CBD5E1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '18px',
                                    fontWeight: 800,
                                    color: '#0F172A',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                    fontFamily: "'JetBrains Mono', monospace",
                                  }}
                                >
                                  {ch}
                                </div>
                              </React.Fragment>
                            ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <button
                            type="button"
                            onClick={handleCopyPairingCode}
                            style={{
                              backgroundColor: copiedCode ? '#16A34A' : '#FFFFFF',
                              color: copiedCode ? '#FFFFFF' : '#008069',
                              border: '1px solid #008069',
                              borderRadius: '999px',
                              padding: '5px 14px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {copiedCode ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CrmIcon name="check" size={12} /> Code Copied
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CrmIcon name="clipboard" size={12} /> Copy Code
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendWhatsappOtp()}
                            disabled={isSendingOtp}
                            style={{
                              backgroundColor: 'transparent',
                              color: '#475569',
                              border: '1px solid #CBD5E1',
                              borderRadius: '999px',
                              padding: '5px 14px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: isSendingOtp ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSendingOtp ? 'Refreshing...' : '↻ Refresh Code'}
                          </button>
                        </div>
                      </div>

                      {/* Official 4-Step Phone Linking Instructions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
                        {[
                          <>Open <strong>WhatsApp</strong> on your phone</>,
                          <>On Android tap <strong>Menu (⋮)</strong> &middot; On iPhone tap <strong>Settings</strong></>,
                          <>Tap <strong>Linked devices</strong>, then <strong>Link device</strong></>,
                          <>Tap <strong>Link with phone number instead</strong> and enter this code on your phone</>,
                        ].map((step, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#1E293B' }}>
                            <div
                              style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                border: '1.5px solid #94A3B8',
                                color: '#334155',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '11px',
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div>{step}</div>
                          </div>
                        ))}
                      </div>

                      {/* Live Sync Status Indicator */}
                      <div
                        style={{
                          backgroundColor: '#F0FDF4',
                          border: '1px solid #BBF7D0',
                          borderRadius: '10px',
                          padding: '10px 14px',
                          fontSize: '12px',
                          color: '#166534',
                          fontWeight: 600,
                          marginBottom: '14px',
                          textAlign: 'center',
                        }}
                      >
                        Waiting for WhatsApp confirmation... Once you enter the code on your phone, the CRM will connect automatically.
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setActiveTab('qr');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#008069',
                            fontSize: '13.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Log in with QR code &rsaquo;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '11.5px', color: '#64748B' }}>
            Status:{' '}
            <strong style={{ color: botStatus?.isConnected ? '#16A34A' : '#D97706', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CrmIcon name={botStatus?.isConnected ? 'check-circle' : 'clock'} size={12} color={botStatus?.isConnected ? '#16A34A' : '#D97706'} />
              {botStatus?.isConnected ? 'CONNECTED & VERIFIED' : 'READY TO CONNECT'}
            </strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}