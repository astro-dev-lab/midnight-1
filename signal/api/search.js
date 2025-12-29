import express from 'express';

const router = express.Router();

/**
 * Smart search endpoint with fuzzy matching and advanced filtering
 * POST /api/search
 */
router.post('/', async (req, res) => {
  try {
    const {
      query = '',
      filters = [],
      maxResults = 20,
      fuzzy = true,
      facets = false
    } = req.body;

    // Simulate search processing
    const results = await performSmartSearch(query, filters, maxResults, fuzzy);
    
    let facetData = {};
    if (facets) {
      facetData = await generateFacets(query, filters);
    }

    res.json({
      query,
      total: results.length,
      maxResults,
      results,
      facets: facetData,
      searchTime: Math.random() * 0.5 + 0.1 // Simulated search time
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Search failed',
      category: 'System'
    });
  }
});

/**
 * Get search suggestions/autocomplete
 * GET /api/search/suggestions
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { q: query = '', limit = 10 } = req.query;
    
    if (query.length < 2) {
      return res.json({ suggestions: [] });
    }

    const suggestions = generateSuggestions(query, parseInt(limit));
    
    res.json({
      query,
      suggestions
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      error: 'Failed to get suggestions',
      category: 'System'
    });
  }
});

/**
 * Get search facets for advanced filtering
 * GET /api/search/facets
 */
router.get('/facets', async (req, res) => {
  try {
    const facets = await generateFacets('', []);
    
    res.json({ facets });

  } catch (error) {
    console.error('Facets error:', error);
    res.status(500).json({
      error: 'Failed to get facets',
      category: 'System'
    });
  }
});

/**
 * Perform smart search with fuzzy matching
 */
async function performSmartSearch(query, filters, maxResults, fuzzy) {
  // Mock data for demonstration
  const mockData = [
    {
      id: 'asset_001',
      type: 'asset',
      title: 'Midnight Express - Final Mix',
      description: 'Professional master for streaming distribution',
      metadata: {
        artist: 'The Midnight Runners',
        album: 'Dark Highways',
        genre: 'Electronic',
        year: 2024,
        duration: 272, // seconds
        loudness: -14.1,
        sampleRate: 48000,
        bitrate: 320,
        tags: ['electronic', 'synth', 'dark'],
        created: '2024-01-15',
        modified: '2024-01-20'
      }
    },
    {
      id: 'asset_002',
      type: 'asset',
      title: 'Sunrise Anthem',
      description: 'Uplifting track for commercial use',
      metadata: {
        artist: 'Dawn Collective',
        album: 'New Beginnings',
        genre: 'Pop',
        year: 2024,
        duration: 195,
        loudness: -16.2,
        sampleRate: 44100,
        bitrate: 256,
        tags: ['pop', 'uplifting', 'commercial'],
        created: '2024-02-01',
        modified: '2024-02-05'
      }
    },
    {
      id: 'project_001',
      type: 'project',
      title: 'Summer Album 2024',
      description: 'Complete album project with 12 tracks',
      metadata: {
        status: 'In Progress',
        tracks: 12,
        totalDuration: 3263,
        created: '2024-01-15',
        modified: '2024-03-01',
        genre: 'Mixed',
        tags: ['album', 'summer', '2024']
      }
    },
    {
      id: 'project_002',
      type: 'project',
      title: 'Podcast Series - Tech Talk',
      description: 'Weekly technology podcast episodes',
      metadata: {
        status: 'Active',
        episodes: 24,
        totalDuration: 14400,
        created: '2023-12-01',
        modified: '2024-03-15',
        genre: 'Spoken Word',
        tags: ['podcast', 'technology', 'weekly']
      }
    },
    {
      id: 'job_001',
      type: 'job',
      title: 'Loudness Analysis Job #1247',
      description: 'EBU R128 analysis for broadcast delivery',
      metadata: {
        status: 'Completed',
        jobType: 'Analysis',
        duration: 2.3,
        confidence: 96,
        created: '2024-03-15T10:30:00Z',
        tags: ['analysis', 'loudness', 'broadcast']
      }
    },
    {
      id: 'job_002',
      type: 'job',
      title: 'Batch Export Job #1248',
      description: 'Export 15 tracks to multiple formats',
      metadata: {
        status: 'Running',
        jobType: 'Export',
        progress: 65,
        created: '2024-03-15T14:15:00Z',
        tags: ['export', 'batch', 'formats']
      }
    }
  ];

  let results = mockData;

  // Apply text search
  if (query.trim()) {
    const searchTerm = query.toLowerCase().trim();
    results = results.filter(item => {
      const searchableText = [
        item.title,
        item.description,
        ...(item.metadata.tags || []),
        item.metadata.artist || '',
        item.metadata.album || '',
        item.metadata.genre || ''
      ].join(' ').toLowerCase();

      if (fuzzy) {
        // Simple fuzzy matching - check if most query words are present
        const queryWords = searchTerm.split(' ');
        const matchedWords = queryWords.filter(word => 
          searchableText.includes(word) || 
          levenshteinDistance(word, searchableText) < word.length * 0.4
        );
        return matchedWords.length >= queryWords.length * 0.7;
      } else {
        return searchableText.includes(searchTerm);
      }
    });
  }

  // Apply filters
  for (const filter of filters) {
    if (!filter.value) continue;

    results = results.filter(item => {
      const fieldValue = getNestedValue(item, filter.field);
      if (fieldValue === undefined) return false;

      return applyFilter(fieldValue, filter.operator, filter.value, filter.type);
    });
  }

  // Calculate relevance scores
  results = results.map(item => ({
    ...item,
    score: calculateRelevanceScore(item, query, filters),
    highlights: extractHighlights(item, query)
  }));

  // Sort by relevance score
  results.sort((a, b) => b.score - a.score);

  // Limit results
  return results.slice(0, maxResults);
}

/**
 * Generate search suggestions
 */
function generateSuggestions(query, limit) {
  const commonTerms = [
    'Midnight Express',
    'Summer Album',
    'Podcast Series',
    'Loudness Analysis',
    'Batch Export',
    'Electronic Music',
    'Pop Songs',
    'Broadcast Delivery',
    'Streaming Master',
    'Audio Processing'
  ];

  const queryLower = query.toLowerCase();
  
  return commonTerms
    .filter(term => term.toLowerCase().includes(queryLower))
    .slice(0, limit)
    .map(term => ({
      text: term,
      type: 'term',
      count: Math.floor(Math.random() * 100) + 1
    }));
}

/**
 * Generate faceted search data
 */
async function generateFacets(query, filters) {
  return {
    type: [
      { value: 'asset', label: 'Assets', count: 156 },
      { value: 'project', label: 'Projects', count: 23 },
      { value: 'job', label: 'Jobs', count: 89 }
    ],
    genre: [
      { value: 'Electronic', label: 'Electronic', count: 45 },
      { value: 'Pop', label: 'Pop', count: 38 },
      { value: 'Rock', label: 'Rock', count: 29 },
      { value: 'Jazz', label: 'Jazz', count: 18 },
      { value: 'Classical', label: 'Classical', count: 12 }
    ],
    year: [
      { value: '2024', label: '2024', count: 78 },
      { value: '2023', label: '2023', count: 134 },
      { value: '2022', label: '2022', count: 89 },
      { value: '2021', label: '2021', count: 56 }
    ],
    sampleRate: [
      { value: '48000', label: '48 kHz', count: 89 },
      { value: '44100', label: '44.1 kHz', count: 134 },
      { value: '96000', label: '96 kHz', count: 23 },
      { value: '192000', label: '192 kHz', count: 8 }
    ],
    loudness: [
      { value: 'loud', label: 'Loud (-14 to -10 LUFS)', count: 67 },
      { value: 'medium', label: 'Medium (-18 to -14 LUFS)', count: 123 },
      { value: 'quiet', label: 'Quiet (-25 to -18 LUFS)', count: 45 },
      { value: 'very_quiet', label: 'Very Quiet (< -25 LUFS)', count: 12 }
    ]
  };
}

/**
 * Apply individual filter to field value
 */
function applyFilter(fieldValue, operator, filterValue, filterType) {
  switch (filterType) {
    case 'text':
      const textValue = String(fieldValue).toLowerCase();
      const filterText = String(filterValue).toLowerCase();
      
      switch (operator) {
        case 'contains': return textValue.includes(filterText);
        case 'equals': return textValue === filterText;
        case 'startsWith': return textValue.startsWith(filterText);
        case 'endsWith': return textValue.endsWith(filterText);
        default: return false;
      }

    case 'number':
      const numValue = parseFloat(fieldValue);
      const filterNum = parseFloat(filterValue);
      
      switch (operator) {
        case 'equals': return numValue === filterNum;
        case 'greaterThan': return numValue > filterNum;
        case 'lessThan': return numValue < filterNum;
        case 'between':
          // Expect filterValue to be array [min, max]
          const [min, max] = Array.isArray(filterValue) ? filterValue : [filterNum, filterNum];
          return numValue >= min && numValue <= max;
        default: return false;
      }

    case 'date':
      const dateValue = new Date(fieldValue);
      const filterDate = new Date(filterValue);
      
      switch (operator) {
        case 'equals': return dateValue.toDateString() === filterDate.toDateString();
        case 'before': return dateValue < filterDate;
        case 'after': return dateValue > filterDate;
        case 'between':
          const [startDate, endDate] = Array.isArray(filterValue) ? 
            filterValue.map(d => new Date(d)) : [filterDate, filterDate];
          return dateValue >= startDate && dateValue <= endDate;
        default: return false;
      }

    case 'select':
      switch (operator) {
        case 'equals': return fieldValue === filterValue;
        case 'notEquals': return fieldValue !== filterValue;
        default: return false;
      }

    case 'multiSelect':
      const arrayValue = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      const filterArray = Array.isArray(filterValue) ? filterValue : [filterValue];
      
      switch (operator) {
        case 'contains': 
          return filterArray.some(fv => arrayValue.includes(fv));
        case 'notContains': 
          return !filterArray.some(fv => arrayValue.includes(fv));
        default: return false;
      }

    default:
      return false;
  }
}

/**
 * Calculate relevance score for search result
 */
function calculateRelevanceScore(item, query, filters) {
  let score = 0.5; // Base score

  if (query.trim()) {
    const queryWords = query.toLowerCase().trim().split(' ');
    const titleWords = item.title.toLowerCase().split(' ');
    const descWords = item.description.toLowerCase().split(' ');

    // Title matches get higher score
    for (const queryWord of queryWords) {
      if (titleWords.some(tw => tw.includes(queryWord))) {
        score += 0.3;
      }
      if (descWords.some(dw => dw.includes(queryWord))) {
        score += 0.1;
      }
    }

    // Exact title match gets bonus
    if (item.title.toLowerCase().includes(query.toLowerCase())) {
      score += 0.2;
    }
  }

  // Recent items get slight boost
  if (item.metadata.created) {
    const createdDate = new Date(item.metadata.created);
    const daysSinceCreated = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreated < 30) {
      score += 0.1;
    }
  }

  // Filter matches reduce score penalty
  if (filters.length > 0) {
    score += 0.1; // Bonus for matching filters
  }

  return Math.min(1.0, Math.max(0.1, score));
}

/**
 * Extract highlight terms from search result
 */
function extractHighlights(item, query) {
  if (!query.trim()) return [];

  const queryWords = query.toLowerCase().trim().split(' ');
  const highlights = [];

  for (const word of queryWords) {
    if (item.title.toLowerCase().includes(word)) {
      highlights.push(word);
    }
  }

  return highlights;
}

/**
 * Get nested object value by dot notation path
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Simple Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => 
    Array(str1.length + 1).fill(null)
  );
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

export default router;