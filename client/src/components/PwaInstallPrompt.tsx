import React, { useEffect, useState } from 'react';
import CrmIcon from './CrmIcon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    // 1. Check if already installed in standalone mode
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    // 2. Check for iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);

    // If dismissed in this session, don't show banner immediately
    const dismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true';

    // 3. Listen for Android / Chrome install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If iOS and not standalone and not dismissed, show banner
    if (isIosDevice && !dismissed) {
      // Delay slightly for smooth page entrance
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 2500);
      return () => clearTimeout(timer);
    }

    // 4. Listen for Service Worker update
    const handleUpdate = () => {
      setHasUpdate(true);
    };
    window.addEventListener('pwa-update-available', handleUpdate);

    // 5. Manual trigger from Navbar / Settings
    const handleManualShow = () => {
      if (isIosDevice) {
        setShowIosModal(true);
      } else {
        setShowBanner(true);
      }
    };
    window.addEventListener('pwa-show-install-prompt', handleManualShow);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-update-available', handleUpdate);
      window.removeEventListener('pwa-show-install-prompt', handleManualShow);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosModal(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
      setShowBanner(false);
      setDeferredPrompt(null);
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }
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

  // If already running inside standalone app and no update, render nothing
  if (isStandalone && !hasUpdate) {
    return null;
  }

  return (
    <>
      {/* 1. New Version Update Notification Bar */}
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
            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px',
            fontWeight: 600,
            animation: 'fadeInDown 0.3s ease-out',
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

      {/* 2. In-App Install Banner (Mobile & Desktop) */}
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
                {isIos
                  ? 'Add to Home Screen for fast offline mobile access & push alerts'
                  : 'Install on your device without Play Store. Free & auto-updated'}
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
              {isIos ? 'How to Install' : 'Install App'}
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

      {/* 3. iOS Step-by-Step Installation Guide Modal */}
      {showIosModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowIosModal(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '420px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              animation: 'scaleIn 0.25s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src="/boardingedu-logo.png"
                  alt="App Icon"
                  style={{ width: '36px', height: '36px', borderRadius: '8px' }}
                />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    Install on iPhone / iPad
                  </h3>
                  <p style={{ fontSize: '11px', color: '#64748B', margin: '2px 0 0' }}>
                    Works like a native iOS app without App Store
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                style={{
                  background: '#F1F5F9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: '#64748B',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '20px 0' }}>
              {/* Step 1 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#123B70',
                    color: '#FFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div style={{ fontSize: '13px', color: '#1E293B' }}>
                  Tap the Safari <strong>Share button</strong>{' '}
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      background: '#E2E8F0',
                      borderRadius: '4px',
                      fontWeight: 800,
                    }}
                  >
                    ⎋ (Square with arrow)
                  </span>{' '}
                  at the bottom bar of Safari.
                </div>
              </div>

              {/* Step 2 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#123B70',
                    color: '#FFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div style={{ fontSize: '13px', color: '#1E293B' }}>
                  Scroll down the share sheet and tap{' '}
                  <strong style={{ color: '#0F172A' }}>Add to Home Screen ➕</strong>.
                </div>
              </div>

              {/* Step 3 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: '#123B70',
                    color: '#FFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div style={{ fontSize: '13px', color: '#1E293B' }}>
                  Tap <strong style={{ color: '#2563EB' }}>Add</strong> in the top right corner.
                  The CRM icon will now be placed on your iPhone screen!
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#FEF3C7',
                border: '1px solid #FCD34D',
                borderRadius: '10px',
                padding: '10px 12px',
                fontSize: '11px',
                color: '#92400E',
                lineHeight: 1.4,
              }}
            >
              💡 <strong>iOS Push Notification Note:</strong> On iOS 16.4+, push alerts work once you open the app from your Home Screen.
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              style={{
                width: '100%',
                marginTop: '16px',
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
              Got it, close guide
            </button>
          </div>
        </div>
      )}
    </>
  );
}
