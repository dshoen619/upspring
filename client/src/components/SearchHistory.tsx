import { useState, useEffect } from 'react';
import type { Ad, SearchHistoryItem } from '../types';
import { getSearchHistory, getSearchById, deleteSearch } from '../services/api';
import './SearchHistory.css';

interface SearchHistoryProps {
  onSelectSearch: (searchId: string, brand: string, ads: Ad[]) => void;
  currentBrand: string;
  refreshTrigger?: number;
  isOpen?: boolean;
}

interface GroupedHistory {
  today: SearchHistoryItem[];
  yesterday: SearchHistoryItem[];
  previous7Days: SearchHistoryItem[];
  older: SearchHistoryItem[];
}

export function SearchHistory({
  onSelectSearch,
  currentBrand,
  refreshTrigger = 0,
  isOpen = true,
}: SearchHistoryProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);

    const response = await getSearchHistory(50);

    if (response.success && response.history) {
      setHistory(response.history);
    } else {
      setError(response.error || 'Failed to load search history');
    }

    setIsLoading(false);
  };

  const handleSelectSearch = async (item: SearchHistoryItem) => {
    const response = await getSearchById(item.searchId);

    if (response.success && response.item) {
      onSelectSearch(item.searchId, item.brand, response.item.results);
    } else {
      setError(response.error || 'Failed to load cached search');
    }
  };

  const handleDeleteSearch = async (
    e: React.MouseEvent,
    searchId: string
  ) => {
    e.stopPropagation();
    setDeletingId(searchId);

    const response = await deleteSearch(searchId);

    if (response.success) {
      setHistory((prev) => prev.filter((item) => item.searchId !== searchId));
    } else {
      setError(response.error || 'Failed to delete search');
    }

    setDeletingId(null);
  };

  const groupHistoryByDate = (items: SearchHistoryItem[]): GroupedHistory => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const grouped: GroupedHistory = {
      today: [],
      yesterday: [],
      previous7Days: [],
      older: [],
    };

    items.forEach((item) => {
      const itemDate = new Date(item.searchedAt);
      const itemDateOnly = new Date(
        itemDate.getFullYear(),
        itemDate.getMonth(),
        itemDate.getDate()
      );

      if (itemDateOnly.getTime() === today.getTime()) {
        grouped.today.push(item);
      } else if (itemDateOnly.getTime() === yesterday.getTime()) {
        grouped.yesterday.push(item);
      } else if (itemDateOnly >= sevenDaysAgo) {
        grouped.previous7Days.push(item);
      } else {
        grouped.older.push(item);
      }
    });

    return grouped;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const renderHistoryItem = (item: SearchHistoryItem) => {
    const isActive = item.brand === currentBrand;
    const isDeleting = deletingId === item.searchId;

    return (
      <button
        key={item.searchId}
        className={`history-item ${isActive ? 'history-item-active' : ''}`}
        onClick={() => handleSelectSearch(item)}
        disabled={isDeleting}
      >
        <div className="history-item-content">
          <div className="history-item-header">
            <span className="history-brand">{item.brand}</span>
            <span className="history-time">{formatTime(item.searchedAt)}</span>
          </div>
          <div className="history-item-meta">
            <span className="history-count">
              {item.resultCount} {item.resultCount === 1 ? 'ad' : 'ads'}
            </span>
          </div>
        </div>
        <button
          className="delete-button"
          onClick={(e) => handleDeleteSearch(e, item.searchId)}
          disabled={isDeleting}
          aria-label="Delete search"
        >
          {isDeleting ? (
            <span className="loading-spinner-tiny" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </button>
      </button>
    );
  };

  const renderGroup = (title: string, items: SearchHistoryItem[]) => {
    if (items.length === 0) return null;

    return (
      <div className="history-group">
        <h4 className="history-group-title">{title}</h4>
        <div className="history-group-items">
          {items.map(renderHistoryItem)}
        </div>
      </div>
    );
  };

  if (isLoading && history.length === 0) {
    return (
      <div className={`search-history ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Search History</h3>
        </div>
        <div className="sidebar-loading">
          <div className="loading-spinner-small" />
          <span>Loading history...</span>
        </div>
      </div>
    );
  }

  if (error && history.length === 0) {
    return (
      <div className={`search-history ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Search History</h3>
        </div>
        <div className="sidebar-error">
          <p>{error}</p>
          <button onClick={fetchHistory} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const grouped = groupHistoryByDate(history);

  return (
    <div className={`search-history ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h3>Search History</h3>
        {history.length > 0 && (
          <span className="history-count-badge">{history.length}</span>
        )}
      </div>

      {history.length === 0 ? (
        <div className="sidebar-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M11 8v3l2 2" />
          </svg>
          <p>No search history yet</p>
          <span className="empty-hint">Your recent searches will appear here</span>
        </div>
      ) : (
        <div className="history-list">
          {renderGroup('Today', grouped.today)}
          {renderGroup('Yesterday', grouped.yesterday)}
          {renderGroup('Previous 7 Days', grouped.previous7Days)}
          {renderGroup('Older', grouped.older)}
        </div>
      )}

      {error && history.length > 0 && (
        <div className="inline-error">{error}</div>
      )}
    </div>
  );
}
