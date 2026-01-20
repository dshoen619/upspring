import { useState, useCallback } from 'react';
import { SearchBar, AdsGrid, AIChat, CompetitorsSidebar } from './components';
import type { Ad, BrandSource } from './types';
import { fetchAdsByBrand } from './services/api';
import './App.css';

function App() {
  const [brandName, setBrandName] = useState('');
  const [currentBrand, setCurrentBrand] = useState('');
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brandSource, setBrandSource] = useState<BrandSource | undefined>();
  const [verifiedBrandName, setVerifiedBrandName] = useState<string | undefined>();

  const handleSearch = useCallback(async (searchBrand: string) => {
    setBrandName(searchBrand);
    setCurrentBrand(searchBrand);
    setIsLoading(true);
    setError(null);
    setAds([]);
    setBrandSource(undefined);
    setVerifiedBrandName(undefined);

    const response = await fetchAdsByBrand(searchBrand, { maxAds: 25 });

    if (response.success) {
      setAds(response.ads);
      setBrandSource(response.brandSource);
      setVerifiedBrandName(response.verifiedBrandName);
    } else {
      setError(response.error || 'Failed to fetch ads');
    }

    setIsLoading(false);
  }, []);

  const handleSelectCompetitor = useCallback((competitorName: string) => {
    handleSearch(competitorName);
  }, [handleSearch]);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>Ad Intelligence</h1>
          <p>Discover and analyze brand advertising strategies</p>
        </div>
      </header>

      {/* Search Section */}
      <section className="search-section">
        <SearchBar onSearch={handleSearch} isLoading={isLoading} />
      </section>

      {/* Main Content */}
      <main className="main-content">
        {/* Left: Ads Grid */}
        <section className="ads-section">
          {brandName ? (
            <AdsGrid
              ads={ads}
              brandName={currentBrand}
              isLoading={isLoading}
              error={error}
              brandSource={brandSource}
              verifiedBrandName={verifiedBrandName}
            />
          ) : (
            <div className="welcome-state">
              <div className="welcome-content">
                <svg className="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8" />
                  <path d="M12 17v4" />
                  <path d="M7 8h4M7 12h6" />
                </svg>
                <h2>Explore Brand Advertising</h2>
                <p>Enter a brand name above to discover their public Meta ads, analyze patterns with AI, and explore competitor strategies.</p>
                <div className="quick-search">
                  <span>Try searching for:</span>
                  <div className="quick-search-buttons">
                    {['Nike', 'Apple', 'Coca-Cola', 'Netflix'].map((brand) => (
                      <button
                        key={brand}
                        onClick={() => handleSearch(brand)}
                        disabled={isLoading}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Right Sidebar */}
        <aside className="sidebar">
          {/* AI Chat */}
          <AIChat ads={ads} brandName={currentBrand} />

          {/* Competitors */}
          <CompetitorsSidebar
            brandName={brandName}
            onSelectCompetitor={handleSelectCompetitor}
            currentBrand={currentBrand}
          />
        </aside>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Data sourced from Meta Ad Library. For demonstration purposes only.</p>
      </footer>
    </div>
  );
}

export default App;
