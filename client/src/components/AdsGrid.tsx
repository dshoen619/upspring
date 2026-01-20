import type { Ad, BrandSource } from '../types';
import { AdCard } from './AdCard';
import './AdsGrid.css';

interface AdsGridProps {
  ads: Ad[];
  brandName: string;
  isLoading: boolean;
  error: string | null;
  brandSource?: BrandSource;
  verifiedBrandName?: string;
}

export function AdsGrid({ ads, brandName, isLoading, error, brandSource, verifiedBrandName }: AdsGridProps) {
  if (isLoading) {
    return (
      <div className="ads-grid-status">
        <div className="loading-container">
          <div className="loading-spinner-large" />
          <p>Searching for {brandName} ads...</p>
          <span className="loading-note">This may take a minute while we fetch data from Meta Ad Library</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ads-grid-status">
        <div className="error-container">
          <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>Unable to fetch ads</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="ads-grid-status">
        <div className="empty-container">
          <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h.01M15 9h.01M9 15c.5.5 1.5 1 3 1s2.5-.5 3-1" />
          </svg>
          <h3>No ads found for "{brandName}"</h3>
          {brandSource === 'not_verified' ? (
            <p>We couldn't verify this brand in the Meta Ad Library. Try a different spelling or a more well-known brand.</p>
          ) : (
            <p>This brand may not have active ads, or try checking the spelling.</p>
          )}
        </div>
      </div>
    );
  }

  // Determine display name
  const displayName = verifiedBrandName || brandName;
  const showDiscoveredBadge = brandSource === 'discovered';

  return (
    <div className="ads-grid-container">
      <div className="ads-grid-header">
        <h2>
          {ads.length} ad{ads.length !== 1 ? 's' : ''} found for <span>{displayName}</span>
          {showDiscoveredBadge && (
            <span className="brand-discovered-badge" title="This brand was just discovered and cached">
              New
            </span>
          )}
        </h2>
      </div>
      <div className="ads-grid">
        {ads.map((ad, index) => (
          <AdCard key={`${ad.id}-${index}`} ad={ad} />
        ))}
      </div>
    </div>
  );
}
