import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showDownloadCardModal, setShowDownloadCardModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'android' | 'desktop' | 'ios'>('desktop');
  const [hasUpdate, setHasUpdate] = useState(false);

  const getShareableInstallLink = () => {
    if (typeof window === 'undefined') return 'https://boardingedu-crm.onrender.com/?install=app';
    return `${window.location.origin}/?install=app`;
  };

  const handleCopyInstallLink = () => {
    const link = getShareableInstallLink();
    navigator.clipboard?.writeText(link).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleShareWhatsAppInstallLink = () => {
    const link = getShareableInstallLink();
    const msg = `📲 *Download & Install BoardingEdu CRM App*\n\nClick the official link below to install the BoardingEdu CRM app directly on your Android Phone, iPhone, or Laptop/PC:\n👉 ${link}\n\n1. Open the link in Chrome / Safari\n2. Tap *"Download & Install App"*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleInstallClick = async () => {
    const promptEvent = (window as any).__deferredPwaPrompt || deferredPrompt;
    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          setShowBanner(false);
          setDeferredPrompt(null);
          (window as any).__deferredPwaPrompt = null;
          return;
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    }
    // If native prompt is not available in browser context, open guided modal
    setShowGuideModal(true);
  };

  useEffect(() => {
    // 1. Detect standalone mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandalone(isStandaloneMode);

    // 2. Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);

    if (isIos) {
      setActiveTab('ios');
    } else if (isAndroid) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }

    // 3. Listen for browser install prompt silently (triggered ONLY from Sidebar / Hamburger menu)
    const checkDeferredPrompt = () => {
      const globalPrompt = (window as any).__deferredPwaPrompt;
      if (globalPrompt) {
        setDeferredPrompt(globalPrompt);
      }
    };
    checkDeferredPrompt();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).__deferredPwaPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-ready', checkDeferredPrompt);

    // 4. Update check
    const handleUpdate = () => setHasUpdate(true);
    window.addEventListener('pwa-update-available', handleUpdate);

    // 5. Manual trigger from Sidebar / Hamburger menu / Login page
    const handleManualShow = () => {
      setShowDownloadCardModal(true);
    };
    window.addEventListener('pwa-show-install-prompt', handleManualShow);

    // 6. Auto-open Download & Install Card ONLY if user opened the dedicated install link (?install=app or /install)
    const params = new URLSearchParams(window.location.search);
    if (
      !isStandaloneMode &&
      (params.get('install') === 'app' ||
        params.get('install') === '1' ||
        params.get('download') === 'app' ||
        window.location.pathname === '/install' ||
        window.location.pathname === '/download')
    ) {
      setShowDownloadCardModal(true);
    } else {
      setShowDownloadCardModal(false);
      setShowBanner(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-ready', checkDeferredPrompt);
      window.removeEventListener('pwa-update-available', handleUpdate);
      window.removeEventListener('pwa-show-install-prompt', handleManualShow);
    };
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem('pwa_install_dismissed', 'true');
  };

  const handleReloadUpdate = () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  if (isStandalone && !hasUpdate) {
    return null;
  }

  return (
    <>
      {/* 1. Version Update Bar */}
      {hasUpdate && (
        <div
          style={{
            position: 'fixed',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999999,
            background: 'linear-gradient(135deg, #1E3A8A, #2563EB)',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '999px',
            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <span>🚀 New CRM version available!</span>
          <button
            onClick={handleReloadUpdate}
            style={{
              background: '#FFFFFF',
              color: '#1E3A8A',
              border: 'none',
              padding: '4px 12px',
              borderRadius: '999px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Refresh Now
          </button>
        </div>
      )}

      {/* 2. Floating Bottom Banner (Desktop only; mobile installs from Hamburger menu) */}
      {!isStandalone && showBanner && (
        <div
          className="desktop-only"
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            width: '92%',
            maxWidth: '540px',
            background: '#FFFFFF',
            borderRadius: '16px',
            border: '1.5px solid #E2E8F0',
            boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            animation: 'fadeInUp 0.3s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/boardingedu-logo.png"
              alt="BoardingEdu"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                objectFit: 'contain',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                padding: '2px',
              }}
            />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                Install BoardingEdu CRM
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                Install on your phone or desktop for full-screen app access
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleInstallClick}
              style={{
                background: '#123B70',
                color: '#FFFFFF',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(18, 59, 112, 0.25)',
              }}
            >
              Install App
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: '#F1F5F9',
                color: '#64748B',
                border: 'none',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 3. Direct App Download & Shareable Install Link Modal */}
      {showDownloadCardModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowDownloadCardModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '22px',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #E2E8F0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src="/boardingedu-logo.png"
                  alt="BoardingEdu CRM"
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    objectFit: 'contain',
                    border: '1px solid #E2E8F0',
                    padding: '3px',
                    background: '#F8FAFC',
                  }}
                />
                <div>
                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    BoardingEdu CRM App
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#16A34A', fontWeight: 700, marginTop: '2px' }}>
                    ✓ Official App Installer (Android • iPhone • Windows/Mac)
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadCardModal(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: '#64748B',
                }}
              >
                ✕
              </button>
            </div>

            {/* 1-Tap Direct Download & Install Button */}
            <div
              style={{
                background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 100%)',
                border: '1.5px solid #BFDBFE',
                borderRadius: '16px',
                padding: '16px',
                textAlign: 'center',
                marginBottom: '16px',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#1E293B', fontWeight: 600, marginBottom: '12px' }}>
                Click below to download and install <strong>BoardingEdu CRM</strong> directly onto your Phone or Laptop Home Screen:
              </div>
              <button
                type="button"
                onClick={async () => {
                  const promptEvent = (window as any).__deferredPwaPrompt || deferredPrompt;
                  if (promptEvent) {
                    try {
                      await promptEvent.prompt();
                      const choice = await promptEvent.userChoice;
                      if (choice && choice.outcome === 'accepted') {
                        setShowDownloadCardModal(false);
                        setDeferredPrompt(null);
                        (window as any).__deferredPwaPrompt = null;
                        return;
                      }
                    } catch {}
                  }
                  setShowDownloadCardModal(false);
                  setShowGuideModal(true);
                }}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '13px 18px',
                  borderRadius: '12px',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>📲</span>
                <span>Download &amp; Install BoardingEdu CRM Now</span>
              </button>
            </div>

            {/* Shareable Direct App Install Link Box */}
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                padding: '14px',
                marginBottom: '14px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                🔗 Share Direct App Download Link with Team (Managers &amp; Counsellors):
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '10px',
                  padding: '8px 10px',
                }}
              >
                <input
                  type="text"
                  readOnly
                  value={getShareableInstallLink()}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1D4ED8',
                    background: 'transparent',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyInstallLink}
                  style={{
                    background: copiedLink ? '#16A34A' : '#123B70',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copiedLink ? '✓ Copied!' : '📋 Copy Link'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleShareWhatsAppInstallLink}
                  style={{
                    flex: 1,
                    background: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '9px',
                    padding: '9px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <span>💬</span>
                  <span>Share Install Link on WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDownloadCardModal(false);
                    setShowGuideModal(true);
                  }}
                  style={{
                    background: '#FFFFFF',
                    color: '#334155',
                    border: '1px solid #CBD5E1',
                    borderRadius: '9px',
                    padding: '9px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  📖 Step-by-Step Guide
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Universal Multi-Platform Installation Guide Modal */}
      {showGuideModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowGuideModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
              animation: 'scaleIn 0.25s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src="/boardingedu-logo.png"
                  alt="App Icon"
                  style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'contain' }}
                />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Install BoardingEdu CRM
                  </h3>
                  <p style={{ fontSize: '11px', color: '#64748B', margin: '2px 0 0' }}>
                    Runs like a native app with offline support &amp; fast launch
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: '#64748B',
                }}
              >
                ✕
              </button>
            </div>

            {/* Platform Selection Tabs */}
            <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '10px', marginBottom: '16px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'android' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'android' ? '#123B70' : '#64748B',
                  boxShadow: activeTab === 'android' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                📱 Android Phone
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('desktop')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'desktop' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'desktop' ? '#123B70' : '#64748B',
                  boxShadow: activeTab === 'desktop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                💻 Desktop / PC
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'ios' ? '#FFFFFF' : 'transparent',
                  color: activeTab === 'ios' ? '#123B70' : '#64748B',
                  boxShadow: activeTab === 'ios' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                🍏 iPhone / iPad
              </button>
            </div>

            {/* Tab 1: Android Phone Instructions */}
            {activeTab === 'android' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>1</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Tap the <strong>3 dots (⋮)</strong> menu icon at the top-right corner of Chrome.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong> from the menu.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Tap <strong>"Install"</strong>. The app icon will be added to your home screen!
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Desktop / PC Instructions */}
            {activeTab === 'desktop' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>1</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Click the <strong>Install App icon (🖥️ or ➕)</strong> in the browser address bar.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Or click the <strong>3 dots (⋮)</strong> menu ➔ <strong>"Cast, save, and share"</strong> ➔ <strong>"Install BoardingEdu CRM"</strong>.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Click <strong>"Install"</strong> to launch the CRM in its dedicated desktop window.
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: iPhone / iPad Instructions */}
            {activeTab === 'ios' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>1</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Tap the <strong>Share button (⎋ square with arrow)</strong> at the bottom of Safari.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Scroll down and select <strong>"Add to Home Screen ➕"</strong>.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Tap <strong>"Add"</strong> at the top right to place the app on your home screen.
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowGuideModal(false)}
              style={{
                width: '100%',
                marginTop: '18px',
                background: '#123B70',
                color: '#FFFFFF',
                border: 'none',
                padding: '12px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Close Instructions
            </button>
          </div>
        </div>
      )}
    </>
  );
}
