# StudioOS Design System Documentation

> Swiss Precision + German Engineering + American Rapper Aesthetic

## Table of Contents

1. [Philosophy](#philosophy)
2. [Design Tokens](#design-tokens)
3. [Component Patterns](#component-patterns)
4. [Composition Guidelines](#composition-guidelines)
5. [Implementation Guide](#implementation-guide)
6. [Component Library](#component-library)

## Philosophy

### Glass Box Principle

StudioOS follows the "Glass Box" principle - every process, transformation, and decision should be transparent and explainable to users. Our design reflects this through:

- **Transparent State Indication**: Every status is clearly visible and explained
- **Process Visibility**: Users can see what's happening at every step
- **Clear Information Hierarchy**: Important information is prominently displayed
- **Honest Error Communication**: Failures are explained clearly with recovery options

### Design Trinity

Our design system combines three core influences:

**🇨🇭 Swiss Precision**
- Clean, minimal interfaces with purposeful whitespace
- Precise typography and spacing systems
- Functional, grid-based layouts
- High contrast and readability

**🇩🇪 German Engineering**
- Robust, reliable component architecture
- Systematic approach to design tokens
- Comprehensive error handling and edge cases
- Accessibility and internationalization built-in

**🇺🇸 American Rapper Confidence**
- Bold, confident visual language
- Efficient, no-nonsense interactions
- Premium feel with subtle luxury touches
- Straightforward, honest communication

## Design Tokens

### Color System

Our color palette is built around semantic meaning and accessibility:

```css
/* Primary Brand Colors */
--color-primary: #3b82f6;      /* Primary actions, links, focus states */
--color-primary-dark: #2563eb; /* Hover states, dark mode variations */
--color-primary-light: #60a5fa; /* Light backgrounds, muted states */

/* Semantic Status Colors */
--status-pending: #6b7280;      /* Jobs waiting to start */
--status-validating: #f59e0b;   /* Files being validated */
--status-processing: #3b82f6;   /* Active transformation */
--status-uploading: #8b5cf6;    /* Platform distribution */
--status-delivered: #22c55e;    /* Successfully completed */
--status-failed: #ef4444;       /* Errors and failures */
```

### Typography Hierarchy

Swiss precision in text styling:

```css
/* Display Text - Headlines and Key Messages */
.text-display-lg { font-size: 2.25rem; font-weight: 700; line-height: 1.25; }
.text-display-md { font-size: 1.875rem; font-weight: 600; line-height: 1.25; }

/* Body Text - Content and Descriptions */
.text-body-lg { font-size: 1.125rem; font-weight: 400; line-height: 1.5; }
.text-body { font-size: 1rem; font-weight: 400; line-height: 1.5; }
.text-body-sm { font-size: 0.875rem; font-weight: 400; line-height: 1.5; }

/* UI Text - Labels and Controls */
.text-label-lg { font-size: 1rem; font-weight: 500; line-height: 1.25; }
.text-label { font-size: 0.875rem; font-weight: 500; line-height: 1.25; }
.text-label-sm { font-size: 0.75rem; font-weight: 500; line-height: 1.25; }
```

### Spacing System

German engineering precision with a 4px base unit:

```css
/* Component Internal Spacing */
--space-component-xs: 0.5rem;   /* 8px - tight spacing */
--space-component-sm: 0.75rem;  /* 12px - default spacing */
--space-component-md: 1rem;     /* 16px - comfortable spacing */
--space-component-lg: 1.5rem;   /* 24px - generous spacing */

/* Layout Spacing */
--space-section-sm: 2rem;       /* 32px - between related sections */
--space-section-md: 3rem;       /* 48px - between major sections */
--space-section-lg: 4rem;       /* 64px - page-level spacing */
```

## Component Patterns

### Status Indicators

Every component that shows status follows these patterns:

```css
.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--border-radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.status-indicator::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: currentColor;
}

/* Status Variants */
.status-pending { background-color: rgba(107, 114, 128, 0.1); color: #6b7280; }
.status-processing { background-color: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.status-delivered { background-color: rgba(34, 197, 94, 0.1); color: #22c55e; }
.status-failed { background-color: rgba(239, 68, 68, 0.1); color: #ef4444; }
```

### Form Fields

Consistent form field styling across all components:

```css
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.form-input {
  padding: var(--input-padding-y) var(--input-padding-x);
  border: var(--border-width-1) solid var(--color-border);
  border-radius: var(--border-radius);
  font-size: var(--font-size-base);
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  transition: border-color var(--duration-200) var(--ease-out),
              box-shadow var(--duration-200) var(--ease-out);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}
```

### Cards and Surfaces

Container patterns for grouping related content:

```css
.card {
  background-color: var(--color-surface);
  border: var(--border-width-1) solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.card-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.card-content {
  color: var(--color-text-secondary);
}
```

### Buttons and Actions

Button hierarchy and interactive states:

```css
/* Primary Actions */
.btn-primary {
  padding: var(--button-padding-y) var(--button-padding-x);
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border: none;
  border-radius: var(--border-radius);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color var(--duration-200) var(--ease-out);
}

.btn-primary:hover {
  background-color: var(--color-primary-dark);
}

/* Secondary Actions */
.btn-secondary {
  padding: var(--button-padding-y) var(--button-padding-x);
  background-color: transparent;
  color: var(--color-primary);
  border: var(--border-width-1) solid var(--color-primary);
  border-radius: var(--border-radius);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--duration-200) var(--ease-out);
}

.btn-secondary:hover {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}
```

## Composition Guidelines

### Layout Principles

1. **Container Hierarchy**: Use consistent container patterns
   ```css
   .page-container { max-width: 1200px; margin: 0 auto; padding: 0 var(--space-6); }
   .section-container { margin-bottom: var(--space-section-md); }
   .component-container { padding: var(--space-component-md); }
   ```

2. **Grid System**: Use CSS Grid for complex layouts
   ```css
   .grid {
     display: grid;
     gap: var(--space-4);
   }
   
   .grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
   .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
   ```

3. **Responsive Design**: Mobile-first approach
   ```css
   /* Mobile first */
   .responsive-grid {
     grid-template-columns: 1fr;
   }
   
   /* Tablet and up */
   @media (min-width: 768px) {
     .responsive-grid {
       grid-template-columns: repeat(2, 1fr);
     }
   }
   
   /* Desktop and up */
   @media (min-width: 1024px) {
     .responsive-grid {
       grid-template-columns: repeat(3, 1fr);
     }
   }
   ```

### State Management in Components

1. **Loading States**: Always provide feedback during async operations
2. **Error States**: Clear error messages with recovery options
3. **Empty States**: Helpful guidance when no data is present
4. **Success States**: Confirmation of successful actions

### Accessibility Guidelines

1. **Semantic HTML**: Use proper HTML elements and ARIA attributes
2. **Focus Management**: Ensure keyboard navigation works correctly
3. **Color Contrast**: Meet WCAG AA standards (4.5:1 for normal text)
4. **Screen Readers**: Provide meaningful labels and descriptions

## Implementation Guide

### Getting Started

1. Import the design system CSS:
   ```typescript
   import '../styles/design-system.css';
   ```

2. Use design tokens in component styles:
   ```css
   .my-component {
     padding: var(--space-component-md);
     background-color: var(--color-surface);
     border-radius: var(--border-radius-lg);
   }
   ```

3. Follow naming conventions:
   - Use kebab-case for CSS classes: `status-indicator`, `form-field`
   - Use semantic names: `btn-primary` instead of `btn-blue`
   - Prefix custom properties with component name: `--modal-z-index`

### Component Development Workflow

1. **Design Token First**: Use existing tokens before creating new ones
2. **Mobile First**: Start with mobile layout, then enhance for larger screens
3. **States Included**: Design all interactive states (hover, focus, active, disabled)
4. **Accessibility Tested**: Test with keyboard navigation and screen readers

### Testing Components

1. **Visual Testing**: Test in light and dark modes
2. **Responsive Testing**: Test on mobile, tablet, and desktop
3. **Accessibility Testing**: Use tools like axe-core or Wave
4. **Performance Testing**: Check for unnecessary re-renders

## Component Library

### Core Components

1. **FormField** - Input fields with labels and validation
2. **JobManager** - Job queue visualization and management
3. **BatchUploader** - File upload with progress tracking
4. **DeliveryTracking** - Platform distribution status
5. **ProcessingReport** - Detailed transformation reports
6. **QualityPresets** - Audio quality configuration
7. **MetadataEditor** - Track metadata editing
8. **AudioVisualization** - Waveform and spectrum display
9. **SmartSearch** - Intelligent content search
10. **PlatformExports** - Multi-platform distribution
11. **DeliveryManager** - Comprehensive delivery oversight

### Usage Examples

```typescript
// FormField with validation
<FormField
  label="Track Title"
  value={title}
  onChange={setTitle}
  error={errors.title}
  required
/>

// Status indicator
<div className="status-indicator status-processing">
  Processing Audio
</div>

// Primary action button
<button className="btn-primary" onClick={handleSubmit}>
  Upload Tracks
</button>
```

### Component Props Patterns

Consistent prop patterns across all components:

```typescript
interface BaseComponentProps {
  className?: string;        // Allow custom styling
  children?: React.ReactNode; // Support composition
  id?: string;              // Support labeling/testing
  'data-testid'?: string;   // Testing support
}

interface FormComponentProps extends BaseComponentProps {
  value: any;               // Current value
  onChange: (value: any) => void; // Value change handler
  error?: string;           // Validation error
  disabled?: boolean;       // Disabled state
  required?: boolean;       // Required field indicator
}
```

This design system ensures consistency, accessibility, and maintainability across the entire StudioOS platform while embodying our core principles of Swiss precision, German engineering, and American rapper confidence.