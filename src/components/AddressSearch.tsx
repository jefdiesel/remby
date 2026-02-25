'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GeoSearchFeature } from '@/lib/nyc-apis';

interface AddressSearchProps {
  onSelect: (feature: GeoSearchFeature) => void;
  isLoading?: boolean;
}

export function AddressSearch({ onSelect, isLoading }: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeoSearchFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFetching, setIsFetching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsFetching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
      const data = await response.json();
      setSuggestions(data.features || []);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    } catch {
      setSuggestions([]);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, fetchSuggestions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestions || suggestions.length === 0) return;

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
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
    }
  }

  function handleSelect(feature: GeoSearchFeature) {
    setQuery(feature.properties.label);
    setShowSuggestions(false);
    onSelect(feature);
  }

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a NYC address..."
          disabled={isLoading}
          className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {(isFetching || isLoading) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto"
        >
          {suggestions.map((feature, index) => (
            <button
              key={feature.properties.id}
              onClick={() => handleSelect(feature)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${
                index === selectedIndex ? 'bg-blue-50' : ''
              } ${index !== suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className="font-medium">{feature.properties.name}</div>
              <div className="text-sm text-gray-500">
                {feature.properties.borough}, {feature.properties.postalcode}
              </div>
              {feature.properties.addendum?.pad?.bbl && (
                <div className="text-xs text-gray-400 mt-1">
                  BBL: {feature.properties.addendum.pad.bbl}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
