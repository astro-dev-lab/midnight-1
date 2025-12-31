/**
 * Loudness Standard Compliance Validator Tests
 * 
 * Tests for multi-platform simultaneous validation against
 * streaming, broadcast, cinema, and other loudness standards.
 */

const {
  // Main validation functions
  validatePlatform,
  validateMultiPlatform,
  quickCheck,
  
  // Analysis functions
  calculateAdjustments,
  findCompliantPlatforms,
  generateReport,
  generateRecommendations,
  
  // Utility functions
  getStandard,
  getPlatformsByCategory,
  expandPlatforms,
  checkRange,
  worstStatus,
  
  // Constants
  PlatformCategory,
  ComplianceStatus,
  MetricType,