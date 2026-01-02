/**
 * Metadata Editor Component
 * 
 * Swiss precision form design with German engineering validation
 * for editing asset metadata including ISRC codes and release data.
 */

import React, { useState } from 'react';
import { FormField } from '../FormField';
import type { Asset } from '../../api/types';

export interface AssetMetadata {
  title?: string;
  artist?: string;
  category?: 'RAW' | 'DERIVED' | 'FINAL';
  isrc?: string;
  bpm?: number | null;
  key?: string;
  genre?: string;
  notes?: string;
  releaseDate?: string;
  label?: string;
  catalog?: string;
}

interface MetadataEditorAsset {
  id: number;
  name: string;
  metadata?: Record<string, unknown>;
}

interface MetadataEditorProps {
  asset: Asset | MetadataEditorAsset;
  onUpdate: (metadata: AssetMetadata) => Promise<void>;
  onCancel?: () => void;
  readOnly?: boolean;
  className?: string;
}

// ISRC validation pattern: Country Code (2) + Registrant (3) + Year (2) + Designation (5)
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$/;

// Musical keys for dropdown
const MUSICAL_KEYS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'
];

// Asset categories per StudioOS specs
const ASSET_CATEGORIES = [
  { value: 'RAW', label: 'Raw', description: 'Original source files' },
  { value: 'DERIVED', label: 'Derived', description: 'Processed/transformed assets' },
  { value: 'FINAL', label: 'Final', description: 'Deliverables for distribution' }
] as const;

export const MetadataEditor: React.FC<MetadataEditorProps> = ({
  asset,
  onUpdate,
  onCancel,
  readOnly = false,
  className = ''
}) => {
  const [metadata, setMetadata] = useState<AssetMetadata>({
    title: (asset.metadata?.title as string) || '',
    artist: (asset.metadata?.artist as string) || '',
    category: (asset.metadata?.category as 'RAW' | 'DERIVED' | 'FINAL') || 'RAW',
    isrc: (asset.metadata?.isrc as string) || '',
    bpm: (asset.metadata?.bpm as number) || null,
    key: (asset.metadata?.key as string) || '',
    genre: (asset.metadata?.genre as string) || '',
    notes: (asset.metadata?.notes as string) || '',
    releaseDate: (asset.metadata?.releaseDate as string) || '',
    label: (asset.metadata?.label as string) || '',
    catalog: (asset.metadata?.catalog as string) || ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate ISRC format
  const validateISRC = (isrc: string): string | null => {
    if (!isrc) return null;
    if (!ISRC_PATTERN.test(isrc.toUpperCase())) {
      return 'ISRC must follow format: CCRRRYYDDDDD (e.g., GBUM71505078)';
    }
    return null;
  };

  // Validate BPM range
  const validateBPM = (bpm: number | null): string | null => {
    if (bpm === null) return null;
    if (bpm < 40 || bpm > 300) {
      return 'BPM must be between 40 and 300';
    }
    return null;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const newErrors: Record<string, string> = {};
    
    const isrcError = validateISRC(metadata.isrc || '');
    if (isrcError) newErrors.isrc = isrcError;
    
    const bpmError = validateBPM(metadata.bpm ?? null);
    if (bpmError) newErrors.bpm = bpmError;
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      await onUpdate(metadata);
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to save metadata' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update field with error clearing
  const updateField = (field: keyof AssetMetadata, value: any) => {
    setMetadata(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className={`metadata-editor ${className}`}>
      <div className="metadata-header">
        <h3 className="text-heading">Asset Metadata</h3>
        <p className="text-caption">
          Track information for distribution and cataloging
        </p>
      </div>

      <form onSubmit={handleSubmit} className="metadata-form">
        <div className="form-grid">
          <FormField
            label="Track Title"
            required
            error={errors.title}
            helpText="Official track name for distribution"
          >
            <input
              type="text"
              value={metadata.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Enter track title"
              disabled={readOnly || isSubmitting}
              required
            />
          </FormField>

          <FormField
            label="Artist"
            required
            error={errors.artist}
          >
            <input
              type="text"
              value={metadata.artist}
              onChange={(e) => updateField('artist', e.target.value)}
              placeholder="Primary artist name"
              disabled={readOnly || isSubmitting}
              required
            />
          </FormField>

          <FormField
            label="Asset Category"
            required
            error={errors.category}
            helpText="Classification for workflow processing"
          >
            <select
              value={metadata.category || 'RAW'}
              onChange={(e) => updateField('category', e.target.value as 'RAW' | 'DERIVED' | 'FINAL')}
              disabled={readOnly || isSubmitting}
              required
            >
              {ASSET_CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.label} — {cat.description}
                </option>
              ))}
            </select>
          </FormField>

          <FormField
            label="ISRC Code"
            error={errors.isrc}
            helpText="International Standard Recording Code for tracking"
          >
            <input
              type="text"
              value={metadata.isrc}
              onChange={(e) => updateField('isrc', e.target.value.toUpperCase())}
              placeholder="GBUM71505078"
              pattern="[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}"
              maxLength={12}
              disabled={readOnly || isSubmitting}
            />
          </FormField>

          <FormField
            label="Genre"
            error={errors.genre}
          >
            <input
              type="text"
              value={metadata.genre}
              onChange={(e) => updateField('genre', e.target.value)}
              placeholder="Hip Hop, R&B, etc."
              disabled={readOnly || isSubmitting}
            />
          </FormField>

          <FormField
            label="BPM"
            error={errors.bpm}
            helpText="Beats per minute (40-300)"
          >
            <input
              type="number"
              value={metadata.bpm || ''}
              onChange={(e) => updateField('bpm', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="120"
              min="40"
              max="300"
              disabled={readOnly || isSubmitting}
            />
          </FormField>

          <FormField
            label="Musical Key"
            error={errors.key}
          >
            <select
              value={metadata.key}
              onChange={(e) => updateField('key', e.target.value)}
              disabled={readOnly || isSubmitting}
            >
              <option value="">Select key</option>
              {MUSICAL_KEYS.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </FormField>

          <FormField
            label="Record Label"
            error={errors.label}
          >
            <input
              type="text"
              value={metadata.label}
              onChange={(e) => updateField('label', e.target.value)}
              placeholder="Label name"
              disabled={readOnly || isSubmitting}
            />
          </FormField>

          <FormField
            label="Catalog Number"
            error={errors.catalog}
          >
            <input
              type="text"
              value={metadata.catalog}
              onChange={(e) => updateField('catalog', e.target.value)}
              placeholder="CAT-001"
              disabled={readOnly || isSubmitting}
            />
          </FormField>

          <FormField
            label="Release Date"
            error={errors.releaseDate}
            className="form-field-full"
          >
            <input
              type="date"
              value={metadata.releaseDate}
              onChange={(e) => updateField('releaseDate', e.target.value)}
              disabled={readOnly || isSubmitting}
            />
          </FormField>

          <FormField
            label="Notes"
            error={errors.notes}
            className="form-field-full"
            helpText="Internal notes and session information"
          >
            <textarea
              value={metadata.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Session notes, special instructions..."
              rows={3}
              disabled={readOnly || isSubmitting}
            />
          </FormField>
        </div>

        {errors.submit && (
          <div className="form-error">
            {errors.submit}
          </div>
        )}

        {!readOnly && (
          <div className="form-actions">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="btn-secondary"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? 'Saving...' : 'Save Metadata'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};