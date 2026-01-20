import type { Ad } from '../types';
import './AdCard.css';

interface AdCardProps {
  ad: Ad;
}

export function AdCard({ ad }: AdCardProps) {
  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'facebook':
        return '📘';
      case 'instagram':
        return '📷';
      case 'messenger':
        return '💬';
      default:
        return '📱';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'status-badge status-active';
      case 'inactive':
        return 'status-badge status-inactive';
      default:
        return 'status-badge status-unknown';
    }
  };

  return (
    <div className="ad-card">
      {/* Media Preview */}
      <div className="ad-media">
        {ad.imageUrl ? (
          <img src={ad.imageUrl} alt={ad.headline || 'Ad preview'} />
        ) : ad.videoUrl ? (
          <div className="video-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>Video Ad</span>
          </div>
        ) : (
          <div className="no-media">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span>No preview</span>
          </div>
        )}
        <span className={getStatusBadgeClass(ad.status)}>{ad.status}</span>
      </div>

      {/* Content */}
      <div className="ad-content">
        {/* Header */}
        <div className="ad-header">
          <h3 className="ad-brand">{ad.brandName}</h3>
          <div className="ad-platforms">
            {ad.platforms.map((platform, i) => (
              <span key={i} className="platform-icon" title={platform}>
                {getPlatformIcon(platform)}
              </span>
            ))}
          </div>
        </div>

        {/* Headline */}
        {ad.headline && (
          <p className="ad-headline">{ad.headline}</p>
        )}

        {/* Primary Text */}
        {ad.primaryText && (
          <p className="ad-text">{ad.primaryText}</p>
        )}

        {/* Metadata */}
        <div className="ad-meta">
          {ad.format && ad.format !== 'unknown' && (
            <div className="meta-item">
              <span className="meta-label">Format</span>
              <span className="meta-value">{ad.format}</span>
            </div>
          )}
        </div>

        {/* Performance Signals */}
        {ad.performanceSignals && (
          <div className="ad-performance">
            {ad.performanceSignals.spendEstimate && (
              <div className="perf-item">
                <span className="perf-label">Spend</span>
                <span className="perf-value">{ad.performanceSignals.spendEstimate}</span>
              </div>
            )}
            {ad.performanceSignals.reachEstimate && (
              <div className="perf-item">
                <span className="perf-label">Reach</span>
                <span className="perf-value">{ad.performanceSignals.reachEstimate}</span>
              </div>
            )}
            {ad.performanceSignals.daysRunning !== undefined && (
              <div className="perf-item">
                <span className="perf-label">Running</span>
                <span className="perf-value">{ad.performanceSignals.daysRunning} days</span>
              </div>
            )}
          </div>
        )}

        {/* Link to Ad Library */}
        {ad.adLibraryUrl && (
          <a
            href={ad.adLibraryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ad-link"
          >
            View in Ad Library
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
