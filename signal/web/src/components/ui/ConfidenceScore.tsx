/**
 * ConfidenceScore - Prominent numeric confidence display
 * 
 * First-class UI element showing analysis confidence as large numeric display.
 */

import React from 'react';
import './ConfidenceScore.css';

interface ConfidenceScoreProps {
  value: number; // 0-100
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showPercentage?: boolean;
}

export const ConfidenceScore: React.FC<ConfidenceScoreProps> = ({
  value,
  label = 'Confidence',
  size = 'lg',
  showPercentage = true
}) => {
  // Determine status based on value
  const getStatus = (val: number): 'pass' | 'pending' | 'fail' => {
    if (val >= 80) return 'pass';
    if (val >= 60) return 'pending';
    return 'fail';
  };

  const status = getStatus(value);
  const displayValue = Math.round(value);

  return (
    <div className={`confidence-score size-${size} status-${status}`}>
      <div className="confidence-score-value">
        <span className="confidence-score-number">{displayValue}</span>
        {showPercentage && <span className="confidence-score-percent">%</span>}
      </div>
      {label && <span className="confidence-score-label">{label}</span>}
      <div className="confidence-score-bar">
        <div 
          className="confidence-score-fill" 
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
};

export default ConfidenceScore;
