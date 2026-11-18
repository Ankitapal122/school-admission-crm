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
  const [activeTab, setActiveTab] = useState<'android' | 'desktop' | 'ios'>('desktop');
  const [hasUpdate, setHasUpdate] = useState(false);

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

    // 3. Listen for browser install prompt (Android / Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If on iOS or Android, show banner after 2s
    const dismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true';
    if (!dismissed) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 2000);
      return () => clearTimeout(timer);
    }

    // 4. Update check
    const handleUpdate = () => setHasUpdate(true);
    window.addEventListener('pwa-update-available', handleUpdate);

    // 5. Manual trigger from Navbar
    const handleManualShow = () => {
      handleInstallClick();
    };
    window.addEventListener('pwa-show-install-prompt', handleManualShow);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-update-available', handleUpdate);
      window.removeEventListener('pwa-show-install-prompt', handleManualShow);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setShowBanner(false);
          setDeferredPrompt(null);
          return;
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    }
    // If native prompt is not available in browser context, open guided modal
    setShowGuideModal(true);
  };

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

      {/* 2. Floating Bottom Banner */}
      {!isStandalone && showBanner && (
        <div
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

      {/* 3. Universal Multi-Platform Installation Guide Modal */}
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
                    Mobile browser ke top-right me <strong>3 dots (⋮)</strong> par tap karein.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Menu me <strong>"Install app"</strong> ya <strong>"Add to Home screen"</strong> par tap karein.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    <strong>"Install"</strong> par click karein. App aapke phone screen par aa jayegi!
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
                    Chrome/Edge me upar address bar (URL) ke right side me <strong>🖥️ Install icon</strong> ya <strong>➕ icon</strong> dekhiye.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Ya browser ke top-right <strong>3 dots (⋮)</strong> dabayein ➔ <strong>"Cast, save, and share"</strong> ➔ <strong>"Install BoardingEdu CRM"</strong> select karein.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    <strong>"Install"</strong> click karein. Yeh desktop app window me alag se open ho jayega!
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
                    Safari browser ke bottom me <strong>Share button (⎋ square with arrow)</strong> par tap karein.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Neeche scroll karein aur <strong>"Add to Home Screen ➕"</strong> select karein.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', alignItems: 'center' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#123B70', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</div>
                  <div style={{ fontSize: '13px', color: '#1E293B' }}>
                    Top right me <strong>"Add"</strong> dabayein. App icon aapke iPhone screen par set ho jayega!
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
              Samajh Gaya, Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
