import React, { useState, useEffect, useRef } from 'react';
import { FormField } from '../FormField';
import './SmartSearch.css';

interface SearchFilter {
  id: string;
  field: string;
  operator: string;
  value: any;
  type: 'text' | 'number' | 'date' | 'select' | 'multiSelect';
}

interface SearchResult {
  id: string;
  type: 'asset' | 'project' | 'job';
  title: string;
  description: string;
  metadata: Record<string, any>;
  score: number;
  highlights: string[];
}

interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilter[];
  created: number;
  lastUsed: number;
}

interface SmartSearchProps {
  onSelect?: (result: SearchResult) => void;
  onSave?: (search: SavedSearch) => void;
  placeholder?: string;
  maxResults?: number;
}

const SEARCH_FIELDS = [
  { value: 'title', label: 'Title', type: 'text' },
  { value: 'artist', label: 'Artist', type: 'text' },
  { value: 'album', label: 'Album', type: 'text' },
  { value: 'genre', label: 'Genre', type: 'select' },
  { value: 'year', label: 'Year', type: 'number' },
  { value: 'duration', label: 'Duration', type: 'number' },
  { value: 'loudness', label: 'Loudness (LUFS)', type: 'number' },
  { value: 'sampleRate', label: 'Sample Rate', type: 'select' },
  { value: 'bitrate', label: 'Bitrate', type: 'number' },
  { value: 'created', label: 'Created Date', type: 'date' },
  { value: 'modified', label: 'Modified Date', type: 'date' },
  { value: 'tags', label: 'Tags', type: 'multiSelect' }
];

const OPERATORS = {
  text: [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'endsWith', label: 'Ends with' }
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'greaterThan', label: 'Greater than' },
    { value: 'lessThan', label: 'Less than' },
    { value: 'between', label: 'Between' }
  ],
  date: [
    { value: 'equals', label: 'On date' },
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' }
  ],
  select: [
    { value: 'equals', label: 'Is' },
    { value: 'notEquals', label: 'Is not' }
  ],
  multiSelect: [
    { value: 'contains', label: 'Contains' },
    { value: 'notContains', label: 'Does not contain' }
  ]
};

export const SmartSearch: React.FC<SmartSearchProps> = ({
  onSelect,
  onSave,
  placeholder = "Search assets, projects, and jobs...",
  maxResults = 20
}) => {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilter[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');

  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    // Load saved searches from localStorage
    const saved = localStorage.getItem('smartSearch:savedSearches');
    if (saved) {
      setSavedSearches(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    // Debounced search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length >= 2 || filters.length > 0) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch();
      }, 300);
    } else {
      setResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query, filters]);

  const performSearch = async () => {
    setIsSearching(true);
    setSelectedIndex(-1);

    try {
      // Build search request
      const searchRequest = {
        query: query.trim(),
        filters: filters.filter(f => f.value !== ''),
        maxResults,
        fuzzy: true
      };

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(searchRequest)
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      } else {
        console.error('Search failed:', response.statusText);
        setResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const generateMockResults = (): SearchResult[] => {
    if (!query && filters.length === 0) return [];

    const mockResults: SearchResult[] = [
      {
        id: 'asset_001',
        type: 'asset',
        title: 'Midnight Express - Final Mix',
        description: 'Professional master for streaming distribution',
        metadata: {
          artist: 'The Midnight Runners',
          genre: 'Electronic',
          duration: '4:32',
          loudness: '-14.1 LUFS',
          sampleRate: '48kHz'
        },
        score: 0.95,
        highlights: ['Midnight', 'Final']
      },
      {
        id: 'project_002',
        type: 'project',
        title: 'Summer Album 2024',
        description: 'Complete album project with 12 tracks',
        metadata: {
          status: 'In Progress',
          tracks: 12,
          totalDuration: '54:23',
          created: '2024-01-15'
        },
        score: 0.78,
        highlights: ['Album', '2024']
      },
      {
        id: 'job_003',
        type: 'job',
        title: 'Loudness Analysis Job #1247',
        description: 'EBU R128 analysis for broadcast delivery',
        metadata: {
          status: 'Completed',
          type: 'Analysis',
          duration: '2.3s',
          confidence: '96%'
        },
        score: 0.65,
        highlights: ['Analysis']
      }
    ];

    return mockResults.filter(result => 
      result.title.toLowerCase().includes(query.toLowerCase()) ||
      result.description.toLowerCase().includes(query.toLowerCase())
    );
  };

  const addFilter = () => {
    const newFilter: SearchFilter = {
      id: `filter_${Date.now()}`,
      field: 'title',
      operator: 'contains',
      value: '',
      type: 'text'
    };
    setFilters([...filters, newFilter]);
  };

  const updateFilter = (filterId: string, updates: Partial<SearchFilter>) => {
    setFilters(filters.map(filter => 
      filter.id === filterId ? { ...filter, ...updates } : filter
    ));
  };

  const removeFilter = (filterId: string) => {
    setFilters(filters.filter(filter => filter.id !== filterId));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelectResult(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setResults([]);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setResults([]);
    setSelectedIndex(-1);
    if (onSelect) {
      onSelect(result);
    }
  };

  const saveCurrentSearch = () => {
    if (!saveSearchName.trim()) return;

    const savedSearch: SavedSearch = {
      id: `search_${Date.now()}`,
      name: saveSearchName.trim(),
      query,
      filters: [...filters],
      created: Date.now(),
      lastUsed: Date.now()
    };

    const updated = [...savedSearches, savedSearch];
    setSavedSearches(updated);
    localStorage.setItem('smartSearch:savedSearches', JSON.stringify(updated));

    setSaveDialogOpen(false);
    setSaveSearchName('');

    if (onSave) {
      onSave(savedSearch);
    }
  };

  const loadSavedSearch = (savedSearch: SavedSearch) => {
    setQuery(savedSearch.query);
    setFilters(savedSearch.filters);
    setShowSaved(false);

    // Update last used timestamp
    const updated = savedSearches.map(search =>
      search.id === savedSearch.id 
        ? { ...search, lastUsed: Date.now() }
        : search
    );
    setSavedSearches(updated);
    localStorage.setItem('smartSearch:savedSearches', JSON.stringify(updated));
  };

  const clearSearch = () => {
    setQuery('');
    setFilters([]);
    setResults([]);
    setSelectedIndex(-1);
  };

  const getFieldType = (fieldName: string): string => {
    const field = SEARCH_FIELDS.find(f => f.value === fieldName);
    return field?.type || 'text';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'asset': return '🎵';
      case 'project': return '📁';
      case 'job': return '⚙️';
      default: return '📄';
    }
  };

  const formatMetadata = (metadata: Record<string, any>) => {
    return Object.entries(metadata)
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' • ');
  };

  return (
    <div className="smart-search">
      <div className="search-header">
        <div className="search-input-wrapper">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="search-input"
          />
          <div className="search-actions">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`filter-toggle ${showFilters ? 'active' : ''}`}
              title="Advanced Filters"
            >
              🔍
            </button>
            <button
              onClick={() => setShowSaved(!showSaved)}
              className={`saved-toggle ${showSaved ? 'active' : ''}`}
              title="Saved Searches"
            >
              📑
            </button>
            {(query || filters.length > 0) && (
              <button
                onClick={clearSearch}
                className="clear-button"
                title="Clear Search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {(query || filters.length > 0) && (
          <button
            onClick={() => setSaveDialogOpen(true)}
            className="save-search-btn"
          >
            Save Search
          </button>
        )}
      </div>

      {showFilters && (
        <div className="search-filters">
          <div className="filters-header">
            <span>Advanced Filters</span>
            <button onClick={addFilter} className="add-filter-btn">
              + Add Filter
            </button>
          </div>
          
          <div className="filter-list">
            {filters.map(filter => {
              const fieldType = getFieldType(filter.field);
              return (
                <div key={filter.id} className="filter-item">
                  <select
                    value={filter.field}
                    onChange={(e) => updateFilter(filter.id, { 
                      field: e.target.value,
                      type: getFieldType(e.target.value) as any
                    })}
                    className="filter-field"
                  >
                    {SEARCH_FIELDS.map(field => (
                      <option key={field.value} value={field.value}>
                        {field.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={filter.operator}
                    onChange={(e) => updateFilter(filter.id, { operator: e.target.value })}
                    className="filter-operator"
                  >
                    {OPERATORS[fieldType].map(op => (
                      <option key={op.value} value={op.value}>
                        {op.label}
                      </option>
                    ))}
                  </select>

                  <input
                    type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                    value={filter.value}
                    onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                    className="filter-value"
                    placeholder="Value..."
                  />

                  <button
                    onClick={() => removeFilter(filter.id)}
                    className="remove-filter-btn"
                    title="Remove Filter"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showSaved && savedSearches.length > 0 && (
        <div className="saved-searches">
          <div className="saved-header">Saved Searches</div>
          <div className="saved-list">
            {savedSearches.map(savedSearch => (
              <div
                key={savedSearch.id}
                className="saved-item"
                onClick={() => loadSavedSearch(savedSearch)}
              >
                <div className="saved-name">{savedSearch.name}</div>
                <div className="saved-details">
                  {savedSearch.query && <span>"{savedSearch.query}"</span>}
                  {savedSearch.filters.length > 0 && (
                    <span>{savedSearch.filters.length} filters</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="search-results">
          <div className="results-header">
            {isSearching ? 'Searching...' : `${results.length} results found`}
          </div>
          
          <div className="results-list">
            {results.map((result, index) => (
              <div
                key={result.id}
                ref={el => resultRefs.current[index] = el}
                className={`result-item ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handleSelectResult(result)}
              >
                <div className="result-header">
                  <span className="result-icon">{getTypeIcon(result.type)}</span>
                  <div className="result-title">
                    {result.highlights.length > 0 ? (
                      <span dangerouslySetInnerHTML={{
                        __html: result.title.replace(
                          new RegExp(`(${result.highlights.join('|')})`, 'gi'),
                          '<mark>$1</mark>'
                        )
                      }} />
                    ) : (
                      result.title
                    )}
                  </div>
                  <span className="result-score">{(result.score * 100).toFixed(0)}%</span>
                </div>
                
                <div className="result-description">{result.description}</div>
                
                <div className="result-metadata">
                  {formatMetadata(result.metadata)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {saveDialogOpen && (
        <div className="save-dialog-overlay">
          <div className="save-dialog">
            <h4>Save Search</h4>
            <FormField label="Search Name">
              <input
                type="text"
                value={saveSearchName}
                onChange={(e) => setSaveSearchName(e.target.value)}
                placeholder="Enter name for this search..."
                autoFocus
              />
            </FormField>
            <div className="save-dialog-actions">
              <button 
                onClick={() => setSaveDialogOpen(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={saveCurrentSearch}
                className="btn-primary"
                disabled={!saveSearchName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};