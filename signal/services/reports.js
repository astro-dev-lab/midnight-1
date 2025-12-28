/**
 * Transparency Layer - Reports Service
 * 
 * Report entity management per STUDIOOS_TRANSPARENCY_CHARTER.md
 * 
 * Reports provide:
 * - Summary: What transformation was performed
 * - Changes Applied: Specific parameter values used
 * - Rationale: Why these choices were made
 * - Impact Assessment: Effect on audio quality/characteristics
 * - Confidence: System's confidence in the result
 * - Limitations: Known constraints or caveats
 * 
 * Grounding Rule: All explanations must be grounded in actual processing
 * data, never speculation. Reports explain WHAT and WHY, never "how to tweak".
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ============================================================================
// Report Types (Per Schema)
// ============================================================================

const ReportType = {
  ANALYSIS: 'ANALYSIS',
  MIXING: 'MIXING',
  EDITING: 'EDITING',
  MASTERING: 'MASTERING',
  CONVERSION: 'CONVERSION',
  DELIVERY: 'DELIVERY'
};

// ============================================================================
// Report Creation
// ============================================================================

/**
 * Create a processing report for a job.
 * Called by the job engine after transformation completes.
 */
async function createReport(jobId, reportData) {
  // Validate required fields
  const required = ['type', 'summary', 'changesApplied', 'rationale', 'impactAssessment', 'confidence'];
  for (const field of required) {
    if (!reportData[field]) {
      throw new Error(`Report missing required field: ${field}`);
    }
  }
  
  // Validate report type
  if (!Object.values(ReportType).includes(reportData.type)) {
    throw new Error(`Invalid report type: ${reportData.type}`);
  }
  
  // Validate confidence format (should be percentage string)
  if (!/^\d{1,3}%$/.test(reportData.confidence)) {
    throw new Error('Confidence must be a percentage (e.g., "95%")');
  }
  
  const report = await prisma.report.create({
    data: {
      type: reportData.type,
      summary: reportData.summary,
      changesApplied: reportData.changesApplied,
      rationale: reportData.rationale,
      impactAssessment: reportData.impactAssessment,
      confidence: reportData.confidence,
      limitations: reportData.limitations || null,
      jobId
    }
  });
  
  return report;
}

/**
 * Create a delivery report.
 * Generated when assets are delivered externally.
 */
async function createDeliveryReport(jobId, deliveryData) {
  const summary = `Delivered ${deliveryData.assetCount} asset(s) to ${deliveryData.destination}.`;
  
  const changesApplied = [
    `Destination: ${deliveryData.destination}`,
    `Format: ${deliveryData.format || 'Original'}`,
    `Packaging: ${deliveryData.packaging || 'Individual files'}`
  ].join('\n');
  
  const rationale = 'Assets delivered per project delivery configuration and approval status.';
  
  const impactAssessment = deliveryData.successful
    ? `Delivery completed successfully. All ${deliveryData.assetCount} assets transferred.`
    : `Delivery failed. ${deliveryData.errorMessage || 'Unknown error'}`;
  
  return createReport(jobId, {
    type: ReportType.DELIVERY,
    summary,
    changesApplied,
    rationale,
    impactAssessment,
    confidence: deliveryData.successful ? '100%' : '0%',
    limitations: deliveryData.successful 
      ? null 
      : 'Delivery failed. Review error details and retry when issue is resolved.'
  });
}

// ============================================================================
// Report Retrieval
// ============================================================================

/**
 * Get all reports for a job.
 */
async function getReportsForJob(jobId) {
  return prisma.report.findMany({
    where: { jobId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get a single report by ID.
 */
async function getReport(reportId) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: {
      job: {
        include: {
          inputs: { include: { asset: true } },
          outputs: true
        }
      }
    }
  });
}

/**
 * Get all reports for a project (across all jobs).
 */
async function getReportsForProject(projectId) {
  return prisma.report.findMany({
    where: {
      job: { projectId }
    },
    include: {
      job: {
        select: {
          id: true,
          preset: true,
          state: true,
          createdAt: true,
          completedAt: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get reports by type for a project.
 */
async function getReportsByType(projectId, type) {
  if (!Object.values(ReportType).includes(type)) {
    throw new Error(`Invalid report type: ${type}`);
  }
  
  return prisma.report.findMany({
    where: {
      type,
      job: { projectId }
    },
    include: {
      job: {
        select: {
          id: true,
          preset: true,
          state: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

// ============================================================================
// Report Formatting (For External Display)
// ============================================================================

/**
 * Format a report for user display.
 * Ensures approved terminology per STUDIOOS guardrails.
 */
function formatReportForDisplay(report) {
  return {
    id: report.id,
    type: report.type,
    createdAt: report.createdAt,
    sections: {
      summary: {
        title: 'Summary',
        content: report.summary
      },
      changesApplied: {
        title: 'What Was Done',
        content: report.changesApplied
      },
      rationale: {
        title: 'Why',
        content: report.rationale
      },
      impact: {
        title: 'Impact Assessment',
        content: report.impactAssessment
      },
      confidence: {
        title: 'Confidence',
        content: report.confidence
      },
      ...(report.limitations && {
        limitations: {
          title: 'Limitations',
          content: report.limitations
        }
      })
    }
  };
}

/**
 * Generate a plain-text summary of a report.
 */
function summarizeReport(report) {
  const lines = [
    `[${report.type}] ${report.summary}`,
    `Confidence: ${report.confidence}`,
  ];
  
  if (report.limitations) {
    lines.push(`Note: ${report.limitations}`);
  }
  
  return lines.join('\n');
}

// ============================================================================
// Asset Lineage Reporting
// ============================================================================

/**
 * Build lineage chain for an asset.
 * Shows transformation history from RAW → DERIVED → FINAL.
 */
async function getAssetLineage(assetId) {
  const lineage = [];
  let current = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      outputJob: {
        include: { reports: true }
      }
    }
  });
  
  while (current) {
    lineage.unshift({
      id: current.id,
      name: current.name,
      category: current.category,
      createdAt: current.createdAt,
      job: current.outputJob ? {
        id: current.outputJob.id,
        preset: current.outputJob.preset,
        state: current.outputJob.state,
        reports: current.outputJob.reports.map(r => ({
          id: r.id,
          type: r.type,
          summary: r.summary,
          confidence: r.confidence
        }))
      } : null
    });
    
    if (!current.parentId) break;
    
    current = await prisma.asset.findUnique({
      where: { id: current.parentId },
      include: {
        outputJob: {
          include: { reports: true }
        }
      }
    });
  }
  
  return lineage;
}

/**
 * Build a formatted lineage report.
 */
async function getLineageReport(assetId) {
  const lineage = await getAssetLineage(assetId);
  
  if (lineage.length === 0) {
    return { error: 'Asset not found' };
  }
  
  const asset = lineage[lineage.length - 1];
  
  return {
    asset: {
      id: asset.id,
      name: asset.name,
      category: asset.category
    },
    lineageDepth: lineage.length,
    chain: lineage.map((item, index) => ({
      step: index + 1,
      asset: {
        id: item.id,
        name: item.name,
        category: item.category
      },
      transformation: item.job ? {
        preset: item.job.preset,
        confidence: item.job.reports[0]?.confidence || 'N/A',
        summary: item.job.reports[0]?.summary || 'No report available'
      } : 'Original upload (source asset)'
    }))
  };
}

// ============================================================================
// Report Aggregation (Project-Level Transparency)
// ============================================================================

/**
 * Generate a project processing summary.
 * Aggregates all job reports into a single overview.
 */
async function getProjectProcessingSummary(projectId) {
  const reports = await getReportsForProject(projectId);
  
  // Group by type
  const byType = {};
  for (const report of reports) {
    if (!byType[report.type]) {
      byType[report.type] = [];
    }
    byType[report.type].push(report);
  }
  
  // Calculate confidence statistics
  const confidences = reports
    .map(r => parseInt(r.confidence))
    .filter(c => !isNaN(c));
  
  const avgConfidence = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : null;
  
  return {
    projectId,
    totalReports: reports.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([type, typeReports]) => [
        type,
        {
          count: typeReports.length,
          latest: typeReports[0]?.createdAt || null
        }
      ])
    ),
    confidence: {
      average: avgConfidence ? `${avgConfidence}%` : 'N/A',
      min: confidences.length > 0 ? `${Math.min(...confidences)}%` : 'N/A',
      max: confidences.length > 0 ? `${Math.max(...confidences)}%` : 'N/A'
    },
    recentReports: reports.slice(0, 5).map(r => ({
      id: r.id,
      type: r.type,
      summary: r.summary,
      confidence: r.confidence,
      createdAt: r.createdAt
    }))
  };
}

// ============================================================================
// Validation & Compliance
// ============================================================================

/**
 * Validate report content against transparency requirements.
 * Ensures reports don't contain forbidden terminology.
 */
function validateReportContent(content) {
  const forbidden = [
    'track', 'timeline', 'clip', 'session', 'plugin', 'fader',
    'automation', 'channel', 'bus', 'insert', 'rack',
    'tweak', 'adjust live', 'play with', 'dial in', 'fine-tune manually',
    'drag and drop', 'scrub'
  ];
  
  // Note: 'meter' is excluded because it appears in approved 'parameter'
  // The guardrail specifies "meter (when implying manipulation)" which requires context
  
  const lowerContent = content.toLowerCase();
  const violations = forbidden.filter(term => {
    // Use word boundary matching to avoid false positives
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return regex.test(lowerContent);
  });
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Sanitize report content by replacing forbidden terms.
 */
function sanitizeReportContent(content) {
  const replacements = {
    'track': 'asset',
    'tracks': 'assets',
    'clip': 'segment',
    'clips': 'segments',
    'plugin': 'transformation',
    'plugins': 'transformations',
    'fader': 'parameter control',
    'automation': 'parameter changes',
    'channel': 'signal path',
    'bus': 'routing',
    'meter': 'level indicator',
    'tweak': 'adjust',
    'dial in': 'configure',
    'fine-tune': 'refine'
  };
  
  let result = content;
  for (const [term, replacement] of Object.entries(replacements)) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }
  
  return result;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Types
  ReportType,
  
  // Creation
  createReport,
  createDeliveryReport,
  
  // Retrieval
  getReport,
  getReportsForJob,
  getReportsForProject,
  getReportsByType,
  
  // Formatting
  formatReportForDisplay,
  summarizeReport,
  
  // Lineage
  getAssetLineage,
  getLineageReport,
  
  // Aggregation
  getProjectProcessingSummary,
  
  // Validation
  validateReportContent,
  sanitizeReportContent
};
