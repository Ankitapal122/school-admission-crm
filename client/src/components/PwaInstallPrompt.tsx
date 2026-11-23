import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showDownloadCardModal, setShowDownloadCardModal] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'installed'>('idle');
  const [installProgress, setInstallProgress] = useState(0);

  useEffect(() => {
    // 1. Detect standalone mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');
    setIsStandalone(isStandaloneMode);

    // 2. Listen for browser install prompt
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

    const handleAppInstalled = () => {
      setInstallState('installed');
      setInstallProgress(100);
      setTimeout(() => {
        setShowDownloadCardModal(false);
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }, 900);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-ready', checkDeferredPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // 3. Update check
    const handleUpdate = () => setHasUpdate(true);
    window.addEventListener('pwa-update-available', handleUpdate);

    // 4. Manual trigger
    const handleManualShow = () => {
      setInstallState('idle');
      setInstallProgress(0);
      setShowDownloadCardModal(true);
    };
    window.addEventListener('pwa-show-install-prompt', handleManualShow);

    // 5. Auto-open Download & Install Card ONLY if user opened the dedicated install link (?install=app or /install)
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
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-ready', checkDeferredPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-update-available', handleUpdate);
      window.removeEventListener('pwa-show-install-prompt', handleManualShow);
    };
  }, []);

  const handleDirectInstall = async () => {
    if (installState === 'installing') return;

    // 1. If Chrome/Edge native beforeinstallprompt is available right now, trigger it immediately
    const immediatePrompt = (window as any).__deferredPwaPrompt || deferredPrompt;
    if (immediatePrompt) {
      try {
        await immediatePrompt.prompt();
        const choice = await immediatePrompt.userChoice;
        (window as any).__deferredPwaPrompt = null;
        setDeferredPrompt(null);
        if (choice && choice.outcome === 'accepted') {
          setInstallState('installed');
          setInstallProgress(100);
          setTimeout(() => {
            setShowDownloadCardModal(false);
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }, 900);
          return;
        }
      } catch {}
    }

    // 2. Otherwise run smooth direct App Installer & Offline Package Downloader (No 2nd instruction page!)
    setInstallState('installing');
    setInstallProgress(15);

    const ua = window.navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    const isInAppWebView = /wv|FBAN|FBAV|Instagram|WhatsApp/i.test(ua);

    // If opened inside WhatsApp's internal webview on Android, bounce directly into real Chrome App with ?install=app
    if (isAndroid && isInAppWebView) {
      const hostAndPath = `${window.location.host}${window.location.pathname}?install=app`;
      window.location.href = `intent://${hostAndPath}#Intent;scheme=https;package=com.android.chrome;end`;
    }

    // Pre-cache app shell & wait for late beforeinstallprompt event while showing real download progress
    for (let step = 1; step <= 5; step++) {
      await new Promise((r) => setTimeout(r, 320));
      setInstallProgress(Math.min(95, 15 + step * 16));
      const latePrompt = (window as any).__deferredPwaPrompt;
      if (latePrompt) {
        try {
          await latePrompt.prompt();
          const choice = await latePrompt.userChoice;
          (window as any).__deferredPwaPrompt = null;
          setDeferredPrompt(null);
          if (choice && choice.outcome === 'accepted') {
            setInstallState('installed');
            setInstallProgress(100);
            setTimeout(() => {
              setShowDownloadCardModal(false);
              const cleanUrl = window.location.origin + window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);
            }, 900);
            return;
          }
        } catch {}
      }
    }

    // Enter full-screen app mode if supported on mobile and proceed directly to Login screen
    try {
      if (isAndroid && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}

    setInstallProgress(100);
    setInstallState('installed');
    localStorage.setItem('boardingedu_app_installed', 'true');

    setTimeout(() => {
      setShowDownloadCardModal(false);
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }, 800);
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

      {/* 2. Direct 1-Click App Download & Install Popup (NO 2nd instruction page) */}
      {showDownloadCardModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '22px',
              width: '100%',
              maxWidth: '390px',
              padding: '26px 22px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              border: '1px solid #E2E8F0',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* App Icon & Title */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '18px' }}>
              <div
                style={{
                  width: '74px',
                  height: '74px',
                  borderRadius: '18px',
                  border: '1.5px solid #BFDBFE',
                  background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                  boxShadow: '0 8px 20px rgba(37, 99, 235, 0.14)',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  padding: '6px',
                }}
              >
                <img
                  src="/boardingedu-logo.png"
                  alt="BoardingEdu CRM"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              <h3 style={{ fontSize: '19px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Install BoardingEdu CRM
              </h3>
              <div style={{ fontSize: '12px', color: '#16A34A', fontWeight: 700, marginTop: '4px' }}>
                ✓ Official Mobile &amp; Desktop App
              </div>
              <p style={{ fontSize: '12.5px', color: '#475569', marginTop: '8px', marginBottom: 0, lineHeight: 1.5 }}>
                {installState === 'installed'
                  ? 'BoardingEdu CRM App is ready! Opening Login...'
                  : installState === 'installing'
                  ? `Downloading & setting up BoardingEdu CRM App (${installProgress}%)...`
                  : 'Download and install the BoardingEdu CRM App on your device for instant full-screen access.'}
              </p>
            </div>

            {/* Download Progress Bar while installing */}
            {installState !== 'idle' && (
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  background: '#E2E8F0',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  marginBottom: '14px',
                }}
              >
                <div
                  style={{
                    width: `${installProgress}%`,
                    height: '100%',
                    background: installState === 'installed' ? '#16A34A' : '#2563EB',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}

            {/* 1-Tap Install App Button */}
            <button
              type="button"
              disabled={installState !== 'idle'}
              onClick={handleDirectInstall}
              style={{
                width: '100%',
                background:
                  installState === 'installed'
                    ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
                    : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
                color: '#FFFFFF',
                border: 'none',
                padding: '14px 18px',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: installState === 'idle' ? 'pointer' : 'default',
                boxShadow: '0 8px 20px -4px rgba(37, 99, 235, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>{installState === 'installed' ? '✅' : '📲'}</span>
              <span>
                {installState === 'installed'
                  ? 'App Installed — Opening Login...'
                  : installState === 'installing'
                  ? `Downloading App (${installProgress}%)...`
                  : 'Install App'}
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
