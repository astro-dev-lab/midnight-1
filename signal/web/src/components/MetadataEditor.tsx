import React, { useState, useEffect } from 'react';
import FormField from './FormField';
import './MetadataEditor.css';

interface MetadataItem {
  key: string;
  value: string | number;
  type: 'text' | 'number' | 'select' | 'textarea';
  label: string;
  options?: Array<{ value: string | number; label: string }>;
  unit?: string;
  description?: string;
  category: 'technical' | 'artistic' | 'production' | 'delivery';
  editable: boolean;
}

interface MetadataEditorProps {
  metadata: MetadataItem[];
  onChange: (updatedMetadata: MetadataItem[]) => void;
  readonly?: boolean;
  compact?: boolean;
  showCategories?: boolean;
  className?: string;
}

/**
 * Swiss Precision Metadata Editor
 * 
 * Design Philosophy:
 * - Swiss Precision: Organized, categorized, systematic editing
 * - German Engineering: Robust validation, data integrity
 * - American Rapper Aesthetic: Bold categorization, confident UX
 * 
 * Glass Box Principle:
 * - Shows all metadata properties transparently
 * - Clear distinction between editable and read-only fields
 * - Real-time validation and feedback
 */
export const MetadataEditor: React.FC<MetadataEditorProps> = ({
  metadata,
  onChange,
  readonly = false,
  compact = false,
  showCategories = true,
  className = ''
}) => {
  const [localMetadata, setLocalMetadata] = useState<MetadataItem[]>(metadata);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  useEffect(() => {
    setLocalMetadata(metadata);
  }, [metadata]);

  const categories = [
    { key: 'all', label: 'All Fields', color: '#0088ff' },
    { key: 'technical', label: 'Technical', color: '#00ff88' },
    { key: 'artistic', label: 'Artistic', color: '#ff8800' },
    { key: 'production', label: 'Production', color: '#8800ff' },
    { key: 'delivery', label: 'Delivery', color: '#ff0044' }
  ];

  const handleMetadataChange = (key: string, newValue: string | number) => {
    const updatedMetadata = localMetadata.map(item =>
      item.key === key ? { ...item, value: newValue } : item
    );
    setLocalMetadata(updatedMetadata);
    onChange(updatedMetadata);
  };

  const filteredMetadata = localMetadata.filter(item => {
    const matchesSearch = item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.key.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const getFieldsByCategory = (category: string) => {
    return filteredMetadata.filter(item => item.category === category);
  };

  const renderField = (item: MetadataItem) => {
    const fieldProps = {
      label: item.label,
      value: item.value,
      onChange: (value: string | number) => handleMetadataChange(item.key, value),
      type: item.type,
      options: item.options,
      unit: item.unit,
      description: item.description,
      disabled: readonly || !item.editable,
      precision: item.category === 'technical' ? 'high' as const : 'medium' as const
    };

    if (item.type === 'textarea') {
      return (
        <div key={item.key} className="metadata-textarea-field">
          <label className="field-label">{item.label}</label>
          <textarea
            value={item.value as string}
            onChange={(e) => handleMetadataChange(item.key, e.target.value)}
            disabled={readonly || !item.editable}
            className="metadata-textarea"
            rows={3}
            placeholder={item.description}
          />
        </div>
      );
    }

    return <FormField key={item.key} {...fieldProps} />;
  };

  return (
    <div className={`metadata-editor ${compact ? 'compact' : ''} ${readonly ? 'readonly' : ''} ${className}`}>
      {/* Header Controls */}
      <div className="metadata-header">
        <div className="header-title">
          <h3>Asset Metadata</h3>
          <span className="metadata-count">
            {filteredMetadata.length} of {localMetadata.length} fields
          </span>
        </div>
        
        {!readonly && (
          <div className="header-controls">
            <div className="search-field">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search fields..."
                className="metadata-search"
              />
            </div>
          </div>
        )}
      </div>

      {/* Category Tabs */}
      {showCategories && (
        <div className="category-tabs">
          {categories.map(category => (
            <button
              key={category.key}
              onClick={() => setActiveCategory(category.key)}
              className={`category-tab ${activeCategory === category.key ? 'active' : ''}`}
              style={{
                '--category-color': category.color
              } as React.CSSProperties}
            >
              {category.label}
              {category.key !== 'all' && (
                <span className="category-count">
                  {getFieldsByCategory(category.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Metadata Fields */}
      <div className="metadata-content">
        {showCategories && activeCategory === 'all' ? (
          // Show all categories with sections
          categories.slice(1).map(category => {
            const fields = getFieldsByCategory(category.key);
            if (fields.length === 0) return null;

            return (
              <div key={category.key} className="metadata-section">
                <div 
                  className="section-header"
                  style={{
                    '--category-color': category.color
                  } as React.CSSProperties}
                >
                  <h4>{category.label}</h4>
                  <span className="section-count">{fields.length}</span>
                </div>
                <div className="section-fields">
                  {fields.map(renderField)}
                </div>
              </div>
            );
          })
        ) : (
          // Show filtered fields
          <div className="metadata-fields">
            {filteredMetadata.map(renderField)}
          </div>
        )}

        {filteredMetadata.length === 0 && (
          <div className="no-results">
            <div className="no-results-icon">🔍</div>
            <div className="no-results-text">
              {searchTerm ? `No fields match "${searchTerm}"` : 'No metadata fields available'}
            </div>
          </div>
        )}
      </div>

      {/* Footer Summary */}
      <div className="metadata-footer">
        <div className="footer-stats">
          <span>
            <strong>{localMetadata.filter(item => item.editable).length}</strong> editable
          </span>
          <span>
            <strong>{localMetadata.filter(item => !item.editable).length}</strong> read-only
          </span>
          <span>
            <strong>{localMetadata.filter(item => item.value !== '').length}</strong> populated
          </span>
        </div>
      </div>
    </div>
  );
};

export default MetadataEditor;