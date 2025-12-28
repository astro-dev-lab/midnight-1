/**
 * Transparency Layer (Reports Service) Tests
 * 
 * Tests for services/reports.js
 */

const {
  ReportType,
  formatReportForDisplay,
  summarizeReport,
  validateReportContent,
  sanitizeReportContent
} = require('../services/reports');

describe('Transparency Layer - Reports Service', () => {
  describe('Report Types', () => {
    it('should define all required report types', () => {
      expect(ReportType.ANALYSIS).toBe('ANALYSIS');
      expect(ReportType.MIXING).toBe('MIXING');
      expect(ReportType.EDITING).toBe('EDITING');
      expect(ReportType.MASTERING).toBe('MASTERING');
      expect(ReportType.CONVERSION).toBe('CONVERSION');
      expect(ReportType.DELIVERY).toBe('DELIVERY');
    });

    it('should have exactly 6 report types', () => {
      expect(Object.keys(ReportType)).toHaveLength(6);
    });
  });

  describe('Report Formatting', () => {
    const mockReport = {
      id: 1,
      type: 'MASTERING',
      createdAt: new Date('2024-01-01'),
      summary: 'Applied Standard Mastering to 1 input asset.',
      changesApplied: 'loudness: -14 LUFS\ntruePeak: -1 dBTP',
      rationale: 'Target loudness set to meet streaming standards.',
      impactAssessment: 'Processing completed with 97% confidence.',
      confidence: '97%',
      limitations: 'Automated mastering may not capture all nuances.'
    };

    it('should format report with all sections', () => {
      const formatted = formatReportForDisplay(mockReport);
      
      expect(formatted.id).toBe(1);
      expect(formatted.type).toBe('MASTERING');
      expect(formatted.sections.summary.title).toBe('Summary');
      expect(formatted.sections.changesApplied.title).toBe('What Was Done');
      expect(formatted.sections.rationale.title).toBe('Why');
      expect(formatted.sections.impact.title).toBe('Impact Assessment');
      expect(formatted.sections.confidence.title).toBe('Confidence');
    });

    it('should include limitations section when present', () => {
      const formatted = formatReportForDisplay(mockReport);
      expect(formatted.sections.limitations).toBeDefined();
      expect(formatted.sections.limitations.title).toBe('Limitations');
    });

    it('should omit limitations section when null', () => {
      const reportWithoutLimitations = { ...mockReport, limitations: null };
      const formatted = formatReportForDisplay(reportWithoutLimitations);
      expect(formatted.sections.limitations).toBeUndefined();
    });

    it('should preserve content in sections', () => {
      const formatted = formatReportForDisplay(mockReport);
      expect(formatted.sections.summary.content).toBe(mockReport.summary);
      expect(formatted.sections.confidence.content).toBe('97%');
    });
  });

  describe('Report Summarization', () => {
    it('should create plain-text summary', () => {
      const report = {
        type: 'ANALYSIS',
        summary: 'Full analysis completed.',
        confidence: '99%',
        limitations: null
      };
      
      const summary = summarizeReport(report);
      expect(summary).toContain('[ANALYSIS]');
      expect(summary).toContain('Full analysis completed.');
      expect(summary).toContain('Confidence: 99%');
    });

    it('should include limitations note when present', () => {
      const report = {
        type: 'MASTERING',
        summary: 'Mastering completed.',
        confidence: '95%',
        limitations: 'Review output quality.'
      };
      
      const summary = summarizeReport(report);
      expect(summary).toContain('Note: Review output quality.');
    });

    it('should not include Note when no limitations', () => {
      const report = {
        type: 'CONVERSION',
        summary: 'Converted to MP3.',
        confidence: '100%',
        limitations: null
      };
      
      const summary = summarizeReport(report);
      expect(summary).not.toContain('Note:');
    });
  });

  describe('Content Validation (Terminology Compliance)', () => {
    it('should accept valid content without forbidden terms', () => {
      const content = 'Applied loudness normalization to the asset. ' +
                      'The transformation adjusted levels to meet streaming standards.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject content with "track"', () => {
      const content = 'Processed the track with mastering preset.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('track');
    });

    it('should reject content with "plugin"', () => {
      const content = 'Applied the mastering plugin to enhance audio.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('plugin');
    });

    it('should reject content with "fader"', () => {
      const content = 'Adjusted the fader levels for balance.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('fader');
    });

    it('should reject content with "tweak"', () => {
      const content = 'You can tweak the settings for better results.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('tweak');
    });

    it('should reject content with "dial in"', () => {
      const content = 'Dial in the perfect sound with our presets.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('dial in');
    });

    it('should reject content with multiple violations', () => {
      const content = 'Adjusted the track using a plugin and tweak the fader.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain('track');
      expect(result.violations).toContain('plugin');
      expect(result.violations).toContain('tweak');
      expect(result.violations).toContain('fader');
    });

    it('should be case-insensitive', () => {
      const content = 'Applied PLUGIN to the TRACK for AUTOMATION.';
      
      const result = validateReportContent(content);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Content Sanitization', () => {
    it('should replace "track" with "asset"', () => {
      const content = 'The track was processed successfully.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toBe('The asset was processed successfully.');
    });

    it('should replace "tracks" with "assets"', () => {
      const content = 'Multiple tracks were combined.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toBe('Multiple assets were combined.');
    });

    it('should replace "plugin" with "transformation"', () => {
      const content = 'Applied a limiter plugin for loudness.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toBe('Applied a limiter transformation for loudness.');
    });

    it('should replace "tweak" with "adjust"', () => {
      const content = 'You may want to tweak the parameters.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toBe('You may want to adjust the parameters.');
    });

    it('should replace "dial in" with "configure"', () => {
      const content = 'Dial in your preferred settings.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toBe('configure your preferred settings.');
    });

    it('should replace multiple terms', () => {
      const content = 'The track uses a plugin with automation.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toContain('asset');
      expect(sanitized).toContain('transformation');
      expect(sanitized).toContain('parameter changes');
    });

    it('should preserve case-insensitive matching', () => {
      const content = 'The Track was processed.';
      const sanitized = sanitizeReportContent(content);
      expect(sanitized).toBe('The asset was processed.');
    });
  });

  describe('Approved Terminology', () => {
    const approvedTerms = [
      'asset', 'job', 'transformation', 'output', 'version', 'report',
      'preset', 'parameter', 'workflow', 'delivery', 'approval', 'review',
      'lineage', 'audit', 'confidence', 'analyze', 'generate', 'prepare',
      'normalize', 'convert', 'split', 'deliver', 're-run', 'approve', 'reject'
    ];

    it('should accept all approved terminology', () => {
      for (const term of approvedTerms) {
        const content = `This is a test with ${term} in it.`;
        const result = validateReportContent(content);
        expect(result.valid).toBe(true);
      }
    });
  });
});
