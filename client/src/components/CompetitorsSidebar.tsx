import { useState, useEffect } from 'react';
import type { CompetitorSuggestion } from '../types';
import { getCompetitors } from '../services/api';
import './CompetitorsSidebar.css';

interface CompetitorsSidebarProps {
  brandName: string;
  onSelectCompetitor: (competitorName: string) => void;
  currentBrand: string;
}

export function CompetitorsSidebar({
  brandName,
  onSelectCompetitor,
  currentBrand,
}: CompetitorsSidebarProps) {
  const [competitors, setCompetitors] = useState<CompetitorSuggestion[]>([]);
  const [brandCategory, setBrandCategory] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exploredBrands, setExploredBrands] = useState<string[]>([]);

  useEffect(() => {
    if (!brandName) {
      setCompetitors([]);
      setBrandCategory('');
      setError(null);
      return;
    }

    const fetchCompetitors = async () => {
      setIsLoading(true);
      setError(null);

      const response = await getCompetitors(brandName);

      if (response.success) {
        setCompetitors(response.competitors);
        setBrandCategory(response.brandCategory);
      } else {
        setError(response.error || 'Failed to discover competitors');
      }

      setIsLoading(false);
    };

    fetchCompetitors();
    setExploredBrands([brandName]);
  }, [brandName]);

  const handleSelectCompetitor = (name: string) => {
    if (!exploredBrands.includes(name)) {
      setExploredBrands((prev) => [...prev, name]);
    }
    onSelectCompetitor(name);
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  };

  if (!brandName) {
    return (
      <div className="competitors-sidebar competitors-empty">
        <div className="sidebar-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p>Search for a brand to discover competitors</p>
        </div>
      </div>
    );
  }

  return (
    <div className="competitors-sidebar">
      <div className="sidebar-header">
        <h3>Competitors</h3>
        {brandCategory && (
          <span className="brand-category">{brandCategory}</span>
        )}
      </div>

      {isLoading ? (
        <div className="sidebar-loading">
          <div className="loading-spinner-small" />
          <span>Discovering competitors...</span>
        </div>
      ) : error ? (
        <div className="sidebar-error">
          <p>{error}</p>
        </div>
      ) : competitors.length === 0 ? (
        <div className="sidebar-empty">
          <p>No competitors found</p>
        </div>
      ) : (
        <>
          <div className="explored-brands">
            <span className="explored-label">Explored:</span>
            <div className="brand-chips">
              {exploredBrands.map((brand) => (
                <button
                  key={brand}
                  className={`brand-chip ${brand === currentBrand ? 'brand-chip-active' : ''}`}
                  onClick={() => handleSelectCompetitor(brand)}
                >
                  {brand}
                </button>
              ))}
            </div>
          </div>

          <div className="competitors-list">
            <span className="list-label">Suggested competitors:</span>
            {competitors.map((competitor) => (
              <button
                key={competitor.name}
                className={`competitor-item ${
                  exploredBrands.includes(competitor.name) ? 'competitor-explored' : ''
                }`}
                onClick={() => handleSelectCompetitor(competitor.name)}
              >
                <div className="competitor-info">
                  <span className="competitor-name">
                    {competitor.name}
                    {exploredBrands.includes(competitor.name) && (
                      <svg className="check-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    )}
                  </span>
                  <span className="competitor-reason">{competitor.reason}</span>
                </div>
                <span className={`confidence-badge confidence-${getConfidenceLabel(competitor.confidence)}`}>
                  {Math.round(competitor.confidence * 100)}%
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
