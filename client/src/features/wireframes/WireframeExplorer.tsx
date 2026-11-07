import React, { useEffect } from 'react';

declare global {
  interface Window {
    renderWireframeScreenViewer?: (screenNum: number) => string;
    navigateToWireframeScreen?: (screenNum: number | string) => void;
    getScreenByNum?: (screenNum: number) => any;
  }
}

interface WireframeExplorerProps {
  screenNum: number;
  onSelectScreen: (num: number) => void;
  onBackToLogin?: () => void;
}

export default function WireframeExplorer({
  screenNum,
  onSelectScreen,
  onBackToLogin,
}: WireframeExplorerProps) {
  useEffect(() => {
    window.navigateToWireframeScreen = (num: number | string) => {
      const parsed = typeof num === 'string' ? parseInt(num, 10) : num;
      onSelectScreen(parsed || 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
  }, [onSelectScreen]);

  const html =
    typeof window.renderWireframeScreenViewer === 'function'
      ? window.renderWireframeScreenViewer(screenNum || 1)
      : '<div class="card"><p>Loading Wireframe Specification Viewer (Screens 1–36)...</p></div>';

  if (onBackToLogin) {
    return (
      <div style={{ background: '#F1F5F9', minHeight: '100vh', padding: '20px 15px' }}>
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto 15px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button className="screen-nav-btn" onClick={onBackToLogin}>
            ← Back to Login
          </button>
          <span style={{ fontWeight: 700, color: '#1E3A8A', fontSize: '14px' }}>
            🎓 BoardingEdu CRM – Wireframe Specification Viewer (Screens 1 to 36)
          </span>
        </div>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
