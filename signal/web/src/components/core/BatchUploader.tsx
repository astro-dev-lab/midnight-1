import React, { useState } from 'react';
import { studioOS } from '../../api/client';
import type { AudioAnalysisResult } from '../../api/types';
import './BatchUploader.css';

interface UploadFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  analysisResults?: AudioAnalysisResult;
}

interface BatchUploaderProps {
  projectId?: number;
  onUploadComplete?: (files: UploadFile[]) => void;
  maxFileSize?: number;
  acceptedFormats?: string[];
  maxFiles?: number;
}

export const BatchUploader: React.FC<BatchUploaderProps> = ({
  projectId: _projectId,
  onUploadComplete,
  maxFileSize = 200 * 1024 * 1024, // 200MB
  acceptedFormats = ['.wav', '.aiff', '.mp3', '.flac', '.m4a'],
  maxFiles = 50
}) => {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    addFiles(selectedFiles);
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(file => {
      // Check file type
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!acceptedFormats.includes(extension)) {
        return false;
      }
      
      // Check file size
      if (file.size > maxFileSize) {
        return false;
      }
      
      return true;
    });

    const uploadFiles: UploadFile[] = validFiles.slice(0, maxFiles - files.length).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...uploadFiles]);
  };

  const uploadAndAnalyze = async (uploadFile: UploadFile): Promise<UploadFile> => {
    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? { ...f, status: 'uploading' as const, progress: 0 } : f
      ));

      // Use the real StudioOS API client
      const analysisData = await studioOS.uploadAndAnalyze(uploadFile.file);

      const updatedFile: UploadFile = {
        ...uploadFile,
        status: 'completed',
        progress: 100,
        analysisResults: analysisData
      };

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? updatedFile : f
      ));

      return updatedFile;

    } catch (error) {
      // Format error per STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'The upload failed due to Ingestion error. You may retry the upload.';
      
      const errorFile: UploadFile = {
        ...uploadFile,
        status: 'error',
        progress: 0,
        error: errorMessage
      };

      setFiles(prev => prev.map(f => 
        f.id === uploadFile.id ? errorFile : f
      ));

      return errorFile;
    }
  };

  const processAllFiles = async () => {
    setIsProcessing(true);
    
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    // Process files in parallel with limit
    const concurrentLimit = 3;
    const batches = [];
    
    for (let i = 0; i < pendingFiles.length; i += concurrentLimit) {
      const batch = pendingFiles.slice(i, i + concurrentLimit);
      batches.push(batch);
    }

    for (const batch of batches) {
      await Promise.allSettled(batch.map(uploadAndAnalyze));
    }

    setIsProcessing(false);
    
    if (onUploadComplete) {
      onUploadComplete(files);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => {
    setFiles([]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'uploading': return '⬆️';
      case 'processing': return '⚙️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '📄';
    }
  };

  return (
    <div className="batch-uploader">
      <div className="uploader-header">
        <h3 className="text-heading">Batch Audio Upload</h3>
        <p className="text-caption">
          Upload multiple audio files for analysis and processing
        </p>
      </div>

      <div 
        className={`drop-zone ${dragActive ? 'active' : ''}`}
        onDragEnter={() => setDragActive(true)}
        onDragLeave={() => setDragActive(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="drop-zone-content">
          <div className="drop-icon">📁</div>
          <p className="drop-text">
            Drop audio files here or <span className="browse-link">browse</span>
          </p>
          <p className="drop-info">
            Max {maxFiles} files, up to {formatFileSize(maxFileSize)} each
          </p>
          <p className="drop-formats">
            Supported: {acceptedFormats.join(', ')}
          </p>
          <input
            type="file"
            multiple
            accept={acceptedFormats.join(',')}
            onChange={handleFileSelect}
            className="file-input"
          />
        </div>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <span className="file-count">{files.length} file(s) selected</span>
            <div className="file-actions">
              {files.some(f => f.status === 'pending') && (
                <button 
                  onClick={processAllFiles}
                  disabled={isProcessing}
                  className="btn-primary"
                >
                  {isProcessing ? 'Processing...' : 'Upload & Analyze All'}
                </button>
              )}
              <button onClick={clearAll} className="btn-secondary">
                Clear All
              </button>
            </div>
          </div>

          <div className="file-items">
            {files.map(file => (
              <div key={file.id} className={`file-item status-${file.status}`}>
                <div className="file-info">
                  <div className="file-name">
                    <span className="status-icon">{getStatusIcon(file.status)}</span>
                    <span className="name">{file.file.name}</span>
                  </div>
                  <div className="file-details">
                    <span className="size">{formatFileSize(file.file.size)}</span>
                    {file.analysisResults && (
                      <>
                        <span className="format-badge">
                          {file.analysisResults.format || 'N/A'}
                        </span>
                        <span className="duration">
                          {formatDuration(file.analysisResults.duration)}
                        </span>
                        <span className="quality">
                          {file.analysisResults.sampleRate / 1000}kHz
                          {file.analysisResults.bitDepth && `/${file.analysisResults.bitDepth}bit`}
                        </span>
                        <span className="loudness">
                          {file.analysisResults.loudness.toFixed(1)} LUFS
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Format Normalization Info */}
                {file.analysisResults?.normalization?.required && (
                  <div className="normalization-info">
                    <div className="normalization-header">
                      <span className="normalization-icon">🔄</span>
                      <span className="normalization-label">Format Normalization Required</span>
                    </div>
                    <div className="normalization-actions">
                      {file.analysisResults.normalization.actions.map((action, idx) => (
                        <span key={idx} className="normalization-action">{action}</span>
                      ))}
                    </div>
                    <div className="normalization-target">
                      Target: {file.analysisResults.normalization.target.format} {' '}
                      {file.analysisResults.normalization.target.sampleRate / 1000}kHz / {' '}
                      {file.analysisResults.normalization.target.bitDepth}-bit
                    </div>
                  </div>
                )}

                {/* No normalization needed badge */}
                {file.analysisResults?.normalization && !file.analysisResults.normalization.required && (
                  <div className="normalization-info normalization-ok">
                    <span className="normalization-icon">✓</span>
                    <span className="normalization-label">Format ready for processing</span>
                  </div>
                )}

                {file.status === 'uploading' && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}

                {file.error && (
                  <div className="file-error">
                    {file.error}
                  </div>
                )}

                {file.analysisResults?.problems && file.analysisResults.problems.length > 0 && (
                  <div className="file-warnings">
                    {file.analysisResults.problems.map((problem, idx) => (
                      <div key={idx} className="warning-item">
                        ⚠️ {problem.description}
                      </div>
                    ))}
                  </div>
                )}

                <button 
                  onClick={() => removeFile(file.id)}
                  className="remove-file"
                  title="Remove file"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};