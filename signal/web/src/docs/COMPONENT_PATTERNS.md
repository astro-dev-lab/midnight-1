# Component Composition Patterns

This guide documents common patterns for composing StudioOS components together to create complex user interfaces.

## Pattern Library

### 1. Dashboard Layout Pattern

```typescript
// Dashboard with header, sidebar, and main content
<div className="dashboard-layout">
  <header className="dashboard-header">
    <h1>StudioOS Dashboard</h1>
    <div className="header-actions">
      <SmartSearch />
      <UserProfile />
    </div>
  </header>
  
  <aside className="dashboard-sidebar">
    <Navigation />
  </aside>
  
  <main className="dashboard-main">
    <JobManager />
    <DeliveryTracking />
  </main>
</div>
```

### 2. Upload Workflow Pattern

```typescript
// Complete upload workflow with progress tracking
<div className="upload-workflow">
  <MetadataEditor 
    tracks={tracks}
    onChange={updateTracks}
  />
  
  <QualityPresets
    selected={quality}
    onChange={setQuality}
  />
  
  <BatchUploader
    files={files}
    onUpload={handleUpload}
    metadata={tracks}
    quality={quality}
  />
  
  <ProcessingReport
    jobs={processingJobs}
    onRetry={retryFailedJobs}
  />
</div>
```

### 3. Distribution Management Pattern

```typescript
// Platform distribution with delivery tracking
<div className="distribution-panel">
  <PlatformExports
    platforms={selectedPlatforms}
    onChange={setPlatforms}
    tracks={completedTracks}
  />
  
  <DeliveryManager
    deliveries={deliveries}
    onApprove={approveDelivery}
    onReject={rejectDelivery}
  />
  
  <DeliveryTracking
    jobs={distributionJobs}
    onUpdate={refreshStatus}
  />
</div>
```

### 4. Modal Dialog Pattern

```typescript
// Modal with form and actions
<Modal
  open={showModal}
  onClose={() => setShowModal(false)}
  title="Edit Track Metadata"
>
  <div className="modal-content">
    <MetadataEditor
      track={selectedTrack}
      onChange={updateTrack}
    />
    
    <div className="modal-actions">
      <button 
        className="btn-secondary"
        onClick={() => setShowModal(false)}
      >
        Cancel
      </button>
      <button 
        className="btn-primary"
        onClick={saveChanges}
      >
        Save Changes
      </button>
    </div>
  </div>
</Modal>
```

### 5. Status Dashboard Pattern

```typescript
// Comprehensive status overview
<div className="status-dashboard">
  <div className="status-grid">
    <StatsCard 
      title="Active Jobs"
      value={activeJobs.length}
      trend="+5 from yesterday"
      color="primary"
    />
    
    <StatsCard 
      title="Completed Today"
      value={completedToday}
      trend="+12% this week"
      color="success"
    />
    
    <StatsCard 
      title="Failed Jobs"
      value={failedJobs.length}
      trend="-3 from yesterday"
      color="danger"
    />
    
    <StatsCard 
      title="Platform Deliveries"
      value={deliveries.length}
      trend="6 pending approval"
      color="warning"
    />
  </div>
  
  <div className="status-details">
    <JobManager 
      compact={true}
      showFilters={false}
    />
    
    <DeliveryTracking
      limit={10}
      showActions={false}
    />
  </div>
</div>
```

## CSS Composition Patterns

### Layout Utilities

```css
/* Dashboard Layout */
.dashboard-layout {
  display: grid;
  grid-template-areas: 
    "header header"
    "sidebar main";
  grid-template-columns: 250px 1fr;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
}

.dashboard-header {
  grid-area: header;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-6);
  border-bottom: var(--border-width-1) solid var(--color-border);
  background-color: var(--color-surface);
}

.dashboard-sidebar {
  grid-area: sidebar;
  padding: var(--space-6);
  border-right: var(--border-width-1) solid var(--color-border);
  background-color: var(--color-background-subtle);
}

.dashboard-main {
  grid-area: main;
  padding: var(--space-6);
  overflow-y: auto;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .dashboard-layout {
    grid-template-areas: 
      "header"
      "main";
    grid-template-columns: 1fr;
  }
  
  .dashboard-sidebar {
    display: none; /* Hidden on mobile, show with toggle */
  }
}
```

### Component Spacing

```css
/* Workflow containers */
.workflow-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-section-sm);
}

.workflow-step {
  padding: var(--space-component-lg);
  border: var(--border-width-1) solid var(--color-border);
  border-radius: var(--border-radius-lg);
  background-color: var(--color-surface);
}

.workflow-step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-component-md);
}

.workflow-step-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.workflow-step-content {
  display: grid;
  gap: var(--space-component-md);
}
```

### Interactive States

```css
/* Focus management for component groups */
.component-group {
  position: relative;
}

.component-group:focus-within {
  outline: var(--border-width-2) solid var(--color-primary);
  outline-offset: var(--space-1);
  border-radius: var(--border-radius);
}

/* Hover effects for card groups */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-4);
}

.card-grid .card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  transition: transform var(--duration-200) var(--ease-out),
              box-shadow var(--duration-200) var(--ease-out);
}
```

## State Management Patterns

### Loading States

```typescript
// Loading state management across components
function useWorkflowState() {
  const [loading, setLoading] = useState({
    upload: false,
    processing: false,
    distribution: false
  });
  
  const updateLoading = (step: keyof typeof loading, isLoading: boolean) => {
    setLoading(prev => ({ ...prev, [step]: isLoading }));
  };
  
  return { loading, updateLoading };
}

// Component with loading overlay
<div className="workflow-step" data-loading={loading.upload}>
  <BatchUploader
    onUploadStart={() => updateLoading('upload', true)}
    onUploadComplete={() => updateLoading('upload', false)}
  />
  
  {loading.upload && (
    <div className="loading-overlay">
      <Spinner />
      <p>Uploading files...</p>
    </div>
  )}
</div>
```

### Error Boundaries

```typescript
// Error boundary for component groups
function WorkflowErrorBoundary({ children, onReset }) {
  return (
    <ErrorBoundary
      FallbackComponent={({ error, resetErrorBoundary }) => (
        <div className="error-state">
          <h3>Something went wrong</h3>
          <p>{error.message}</p>
          <button 
            className="btn-primary"
            onClick={() => {
              resetErrorBoundary();
              onReset?.();
            }}
          >
            Try Again
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### Data Flow

```typescript
// Data flow between components
function UploadWorkflow() {
  const [files, setFiles] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [quality, setQuality] = useState('high');
  const [jobs, setJobs] = useState([]);
  
  // Files flow from uploader to metadata editor
  const handleFilesSelected = (newFiles) => {
    setFiles(newFiles);
    
    // Initialize metadata for each file
    const initialMetadata = newFiles.reduce((acc, file) => {
      acc[file.id] = extractMetadata(file);
      return acc;
    }, {});
    
    setMetadata(initialMetadata);
  };
  
  // Metadata and quality settings flow to job creation
  const handleStartProcessing = () => {
    const jobRequests = files.map(file => ({
      file,
      metadata: metadata[file.id],
      quality,
      platforms: selectedPlatforms
    }));
    
    createJobs(jobRequests).then(setJobs);
  };
  
  return (
    <div className="upload-workflow">
      <BatchUploader
        onFilesSelected={handleFilesSelected}
      />
      
      <MetadataEditor
        files={files}
        metadata={metadata}
        onChange={setMetadata}
      />
      
      <QualityPresets
        selected={quality}
        onChange={setQuality}
      />
      
      <button 
        className="btn-primary"
        onClick={handleStartProcessing}
        disabled={files.length === 0}
      >
        Start Processing
      </button>
      
      {jobs.length > 0 && (
        <ProcessingReport
          jobs={jobs}
          onUpdate={setJobs}
        />
      )}
    </div>
  );
}
```

## Animation Coordination

### Staggered Animations

```css
/* Stagger animation for component lists */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.staggered-list > * {
  animation: slideInUp var(--duration-300) var(--ease-out) both;
}

.staggered-list > *:nth-child(1) { animation-delay: 0ms; }
.staggered-list > *:nth-child(2) { animation-delay: 100ms; }
.staggered-list > *:nth-child(3) { animation-delay: 200ms; }
.staggered-list > *:nth-child(4) { animation-delay: 300ms; }
.staggered-list > *:nth-child(5) { animation-delay: 400ms; }
```

### Cross-Component Transitions

```typescript
// Coordinated transitions between workflow steps
function AnimatedWorkflow() {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  
  const nextStep = () => {
    setDirection(1);
    setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };
  
  const prevStep = () => {
    setDirection(-1);
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentStep}
        initial={{ 
          opacity: 0, 
          x: direction * 50 
        }}
        animate={{ 
          opacity: 1, 
          x: 0 
        }}
        exit={{ 
          opacity: 0, 
          x: direction * -50 
        }}
        transition={{ 
          duration: 0.3,
          ease: "easeOut"
        }}
        className="workflow-step"
      >
        {steps[currentStep]}
      </motion.div>
    </AnimatePresence>
  );
}
```

These patterns ensure consistent, scalable component composition across the StudioOS platform while maintaining the design system's core principles.