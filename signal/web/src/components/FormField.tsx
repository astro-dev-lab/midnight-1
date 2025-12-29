import React from 'react';
import './FormField.css';

interface FormFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'text' | 'number' | 'select' | 'range';
  options?: Array<{ value: string | number; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  precision?: 'low' | 'medium' | 'high';
  className?: string;
}

/**
 * Swiss Precision FormField Component
 * 
 * Design Philosophy:
 * - Swiss Precision: Clear hierarchy, perfect spacing, functional beauty
 * - German Engineering: Bulletproof validation, robust error handling
 * - American Rapper Aesthetic: Bold confidence, unapologetic clarity
 * 
 * Glass Box Principle:
 * - Every interaction shows clear feedback
 * - Parameter changes display real-time impact
 * - No hidden states or mysterious behaviors
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  options = [],
  min,
  max,
  step,
  unit,
  description,
  error,
  disabled = false,
  precision = 'medium',
  className = ''
}) => {
  const fieldId = `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newValue = type === 'number' || type === 'range' 
      ? parseFloat(e.target.value) || 0
      : e.target.value;
    onChange(newValue);
  };

  const getPrecisionClass = () => {
    switch (precision) {
      case 'high': return 'precision-high';
      case 'low': return 'precision-low';
      default: return 'precision-medium';
    }
  };

  const renderInput = () => {
    const commonProps = {
      id: fieldId,
      value,
      onChange: handleChange,
      disabled,
      className: `form-input ${getPrecisionClass()}`
    };

    switch (type) {
      case 'select':
        return (
          <select {...commonProps} className={`${commonProps.className} form-select`}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      
      case 'range':
        return (
          <div className="range-container">
            <input
              {...commonProps}
              type="range"
              min={min}
              max={max}
              step={step}
              className={`${commonProps.className} form-range`}
            />
            <div className="range-value">
              {value}{unit && <span className="unit">{unit}</span>}
            </div>
          </div>
        );
      
      case 'number':
        return (
          <input
            {...commonProps}
            type="number"
            min={min}
            max={max}
            step={step}
          />
        );
      
      default:
        return (
          <input
            {...commonProps}
            type="text"
          />
        );
    }
  };

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}>
      <div className="field-header">
        <label htmlFor={fieldId} className="field-label">
          {label}
        </label>
        {unit && type !== 'range' && (
          <span className="field-unit">{unit}</span>
        )}
      </div>
      
      <div className="field-input">
        {renderInput()}
      </div>
      
      {description && !error && (
        <div className="field-description">
          {description}
        </div>
      )}
      
      {error && (
        <div className="field-error">
          {error}
        </div>
      )}
    </div>
  );
};

export default FormField;