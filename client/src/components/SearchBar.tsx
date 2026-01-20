import { useState, useMemo, useRef, useEffect } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useBrands } from '../hooks/useBrands';
import './SearchBar.css';

interface SearchBarProps {
  onSearch: (brandName: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export function SearchBar({ onSearch, isLoading, placeholder = 'Enter a brand name (e.g., Nike, Apple, Coca-Cola)' }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { brands, isLoading: brandsLoading } = useBrands();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter brands based on query
  const suggestions = useMemo(() => {
    if (!query.trim() || query.trim().length < 1) {
      return [];
    }
    const searchTerm = query.toLowerCase().trim();
    return brands.filter(brand =>
      brand.toLowerCase().includes(searchTerm)
    ).slice(0, 10); // Limit to 10 suggestions
  }, [query, brands]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedQuery = query.trim();
    if (trimmedQuery && !isLoading) {
      onSearch(trimmedQuery);
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const handleSuggestionClick = (brand: string) => {
    setQuery(brand);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    onSearch(brand);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const shouldShowDropdown = showSuggestions && suggestions.length > 0 && !isLoading;

  return (
    <div className="search-bar-container" ref={wrapperRef}>
      <form className="search-bar" onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder={placeholder}
            disabled={isLoading || brandsLoading}
            className="search-input"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="search-button"
          >
            {isLoading ? (
              <span className="loading-spinner" />
            ) : (
              'Search Ads'
            )}
          </button>
        </div>
      </form>

      {shouldShowDropdown && (
        <div className="autocomplete-dropdown">
          {suggestions.map((brand, index) => (
            <button
              key={brand}
              type="button"
              className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSuggestionClick(brand)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <svg className="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 7h-9M14 17h6M10 2v20M4 7l5-5M4 17l5 5" />
              </svg>
              <span className="brand-name">{brand}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
