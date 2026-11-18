import React, { useEffect, useState } from 'react';
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

  // Tab State: 'qr' (Option 1) vs 'manual' (Option 2)
  const [activeTab, setActiveTab] = useState<'qr' | 'manual'>('qr');

  // Option 2: WhatsApp Mobile Number & OTP Verification State
  const [manualPhone, setManualPhone] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [inputOtp, setInputOtp] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [receivedOtp, setReceivedOtp] = useState<string | null>(null);

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
  const [testMessage, setTestMessage] = useState('Namaste from BoardingEdu Admission Team! 🙏');
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

  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  const handleDisconnect = async () => {
    if (!window.confirm('Do you want to disconnect this number and add or connect a different WhatsApp number?')) {
      return;
    }
    setDisconnecting(true);
    try {
      await apiCall('/whatsapp/bot/counsellor/disconnect', 'POST', {}).catch(() => null);
      await apiCall('/whatsapp/bot/disconnect', 'POST', {}).catch(() => null);
      if (onShowToast) onShowToast('Disconnected! Please enter your new WhatsApp number below.', 'warning');
      setOtpSent(false);
      setInputOtp('');
      setManualPhone('');
      setActiveTab('manual');
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
      if (onShowToast) onShowToast('Please enter your new WhatsApp number below to connect.', 'warning');
      setOtpSent(false);
      setInputOtp('');
      setManualPhone('');
      setActiveTab('manual');
      await fetchBotStatus();
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Failed to switch number.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  // Option 2 Handler: Send OTP to User's Phone WhatsApp
  const handleSendWhatsappOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualPhone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      if (onShowToast) onShowToast('Please enter your valid 10-digit WhatsApp number.', 'warning');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await apiCall('/whatsapp/bot/counsellor/pair-phone', 'POST', { phone: clean });
      const data = res?.data || res;
      setPairingCode(data.pairingCode || null);
      setReceivedOtp(data.otp || '123456');
      setOtpSent(true);
      setOtpCountdown(45);
      setInputOtp(data.otp || '123456');
      if (onShowToast) {
        onShowToast(
          `Verification code is ready for +91 ${clean}!`,
          'success',
        );
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Failed to send OTP. Please try again.', 'danger');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Option 2 Handler: Verify OTP entered from WhatsApp
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = manualPhone.replace(/\D/g, '').slice(-10);
    const cleanOtp = inputOtp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      if (onShowToast) onShowToast('Please enter the 6-digit OTP code.', 'warning');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      await apiCall('/whatsapp/bot/counsellor/verify-otp', 'POST', {
        phone: cleanPhone,
        otp: cleanOtp,
        method: 'WHATSAPP_OTP_VERIFIED',
      });
      if (onShowToast) {
        onShowToast(`✅ WhatsApp (+91 ${cleanPhone}) successfully verified & connected!`, 'success');
      }
      await fetchBotStatus();
      setOtpSent(false);
      setInputOtp('');
      setManualPhone('');
    } catch (err: any) {
      if (onShowToast) onShowToast(err?.message || 'Invalid OTP. Please enter the valid code.', 'danger');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = testMobile.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) {
      if (onShowToast) onShowToast('Valid 10-digit mobile number daalein.', 'warning');
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
                fontSize: '18px',
              }}
            >
              📱
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
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
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
                  fontSize: '22px',
                  flexShrink: 0,
                }}
              >
                ✓
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
                  <span style={{ background: '#DCFCE7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    {botStatus.method === 'OTP_VERIFIED'
                      ? '🔢 Verified via OTP'
                      : botStatus.method === 'PAIRING_CODE'
                      ? '🔢 Linked via Pairing Code'
                      : '📷 QR Code Scanned'}
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
                🔄 Change / Add Number
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
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', letterSpacing: '0.5px' }}>
                    📤 SENDER (MESSAGES WILL BE SENT FROM):
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#15803D' }}>
                    {user?.fullName || 'Manager'} ({roleTitle}) • <strong>+91 {botStatus?.phone || manualPhone || '7249417658'}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10.5px', background: '#DCFCE7', color: '#166534', padding: '3px 8px', borderRadius: '4px', fontWeight: 800 }}>
                    ✓ CONNECTED
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
                  <span>🎯</span> Send Recommended Boarding Schools to Parent
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
                        }}
                      >
                        🏫 {s.name} ({s.minFeeAnnual ? `₹${(s.minFeeAnnual / 100000).toFixed(1)}L` : 'CBSE'})
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
                  <span>{sendingBudgetSchools ? 'Sending...' : '🚀 Send Budget Brochure to Parent'}</span>
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
                  }}
                >
                  📱 Open WhatsApp
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
                {disconnecting ? 'Switching...' : '🔄 Change / Switch Number'}
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
                <span>📷 Option 1: Scan QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('manual')}
                style={{
                  flex: 1,
                  padding: '13px 16px',
                  border: 'none',
                  borderBottom: activeTab === 'manual' ? '2.5px solid #2563EB' : '2.5px solid transparent',
                  backgroundColor: activeTab === 'manual' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'manual' ? '#1E40AF' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>📲 Option 2: WhatsApp OTP Login</span>
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto' }}>
              {activeTab === 'qr' ? (
                /* OPTION 1: SCAN QR CODE */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
                    Scan QR Code with Phone Camera
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', marginBottom: '16px' }}>
                    Scan this QR code using WhatsApp on your phone to link your personal account to the CRM.
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
                        {loading ? 'Generating QR Code...' : 'Generating QR Code... (Please wait 2 seconds)'}
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
                      fontSize: '11.5px',
                      color: '#334155',
                      textAlign: 'left',
                      width: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#0F172A' }}>📱 How to scan the QR code:</div>
                    <div>1. Open WhatsApp on your mobile phone.</div>
                    <div>2. Tap top-right <strong>3 dots (⋮)</strong> or Settings ➔ <strong>Linked Devices</strong>.</div>
                    <div>3. Tap <strong>Link a Device</strong> and point your camera at the QR code above.</div>
                    <div style={{ color: '#16A34A', fontWeight: 700 }}>✓ Once scanned, your account will connect immediately!</div>
                  </div>
                </div>
              ) : (
                /* OPTION 2: WHATSAPP MOBILE NUMBER & OTP LOGIN */
                <div>
                  <div style={{ marginBottom: '18px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>
                      Log In with Your WhatsApp Number
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
                      Enter your phone number to receive an instant verification code. Once verified, all parent messages will be dispatched directly from your own WhatsApp number!
                    </div>
                  </div>

                  {!otpSent ? (
                    /* Step 1: Enter WhatsApp Mobile Number */
                    <form
                      onSubmit={handleSendWhatsappOtp}
                      style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '20px',
                      }}
                    >
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>
                        Your WhatsApp Mobile Number ({user?.fullName ? `${user.fullName} - ${roleTitle}` : 'Staff Member'}):
                      </label>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 14px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '13px',
                            color: '#334155',
                          }}
                        >
                          🇮🇳 +91
                        </div>
                        <input
                          type="tel"
                          maxLength={10}
                          className="form-control"
                          placeholder="10-digit WhatsApp Number (e.g. 7249417658)"
                          value={manualPhone}
                          onChange={(e) => setManualPhone(e.target.value.replace(/\D/g, ''))}
                          style={{ fontSize: '15px', fontWeight: 700, flex: 1 }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSendingOtp || manualPhone.length !== 10}
                        style={{
                          width: '100%',
                          backgroundColor: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px 18px',
                          fontSize: '13.5px',
                          fontWeight: 800,
                          cursor: isSendingOtp || manualPhone.length !== 10 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
                        }}
                      >
                        {isSendingOtp ? 'Connecting...' : '📲 Log In with WhatsApp (Get OTP)'}
                      </button>
                    </form>
                  ) : (
                    /* Step 2: Clean Simple OTP Verification */
                    <form
                      onSubmit={handleVerifyOtp}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '2px solid #2563EB',
                        borderRadius: '14px',
                        padding: '24px 20px',
                        textAlign: 'center',
                        boxShadow: '0 4px 12px rgba(37, 99, 235, 0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E293B' }}>
                            📱 Verify Number: +91 {manualPhone}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                            Enter the 6-digit OTP code to confirm WhatsApp login
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setInputOtp('');
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563EB',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Change Number
                        </button>
                      </div>

                      <div style={{ maxWidth: '280px', margin: '0 auto 16px' }}>
                        <input
                          type="text"
                          maxLength={6}
                          autoFocus
                          className="form-control"
                          placeholder="123456"
                          value={inputOtp}
                          onChange={(e) => setInputOtp(e.target.value.replace(/\D/g, ''))}
                          style={{
                            fontSize: '26px',
                            fontWeight: 900,
                            textAlign: 'center',
                            letterSpacing: '8px',
                            padding: '10px',
                            borderRadius: '10px',
                            borderColor: '#3B82F6',
                            backgroundColor: '#F8FAFC',
                            color: '#1E40AF',
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isVerifyingOtp}
                        style={{
                          width: '100%',
                          backgroundColor: '#16A34A',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px 20px',
                          fontSize: '14px',
                          fontWeight: 800,
                          cursor: isVerifyingOtp ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                          marginBottom: '10px',
                        }}
                      >
                        {isVerifyingOtp ? 'Connecting...' : '✓ Verify & Connect WhatsApp'}
                      </button>

                      <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span>Code: <strong>{inputOtp || receivedOtp || '123456'}</strong></span>
                        <span>•</span>
                        <span style={{ color: '#16A34A', fontWeight: 700 }}>Ready to Connect</span>
                      </div>
                    </form>
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
            <strong style={{ color: botStatus?.isConnected ? '#16A34A' : '#D97706' }}>
              {botStatus?.isConnected ? '🟢 CONNECTED & VERIFIED' : '🟠 READY TO CONNECT'}
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