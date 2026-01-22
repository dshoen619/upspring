import { useState, useCallback, useEffect } from 'react';
import { SearchBar, AdsGrid, AIChat, CompetitorsSidebar, SearchHistory } from './components';
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Set sidebar closed by default on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    handleResize(); // Set initial state
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      // Refresh search history after successful search
      setRefreshTrigger((prev) => prev + 1);
    } else {
      setError(response.error || 'Failed to fetch ads');
    }

    setIsLoading(false);
  }, []);

  const handleSelectCompetitor = useCallback((competitorName: string) => {
    handleSearch(competitorName);
  }, [handleSearch]);

  const handleSelectSearch = useCallback((_searchId: string, brand: string, searchAds: Ad[]) => {
    setBrandName(brand);
    setCurrentBrand(brand);
    setAds(searchAds);
    setIsLoading(false);
    setError(null);
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="app">
      {/* Search History Sidebar */}
      <SearchHistory
        onSelectSearch={handleSelectSearch}
        currentBrand={currentBrand}
        refreshTrigger={refreshTrigger}
        isOpen={isSidebarOpen}
      />

      {/* Main App Container */}
      <div className={`app-main ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Header */}
        <header className="app-header">
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
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
    </div>
  );
}

export default App;
