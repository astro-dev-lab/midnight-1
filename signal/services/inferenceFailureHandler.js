/**
 * Inference Failure Escalation Handler
 * 
 * Ensures ML inference failures result in safe, deterministic behavior
 * rather than silent failures or undefined states. Implements fail-closed behavior.
 * 
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md:
 * - ML outputs must be explainable
 * - Same input + same params + same model = same result
 * - No silent failures permitted
 * 
 * @version 1.0.0
 */

// ============================================================================
// FAILURE TYPE CLASSIFICATION
// ============================================================================

const FailureType = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  EXCEPTION: 'EXCEPTION',
  NAN_OUTPUT: 'NAN_OUTPUT',
  NULL_OUTPUT: 'NULL_OUTPUT',
  UNDEFINED_OUTPUT: 'UNDEFINED_OUTPUT',
  INVALID_SHAPE: 'INVALID_SHAPE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  CONFIDENCE_COLLAPSE: 'CONFIDENCE_COLLAPSE',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  INVALID_INPUT: 'INVALID_INPUT',
  UNKNOWN: 'UNKNOWN'
});

// ============================================================================
// ESCALATION LEVELS
// ============================================================================

const EscalationLevel = Object.freeze({
  NONE: 'NONE',
  LOG: 'LOG',
  FALLBACK: 'FALLBACK',
  ALERT: 'ALERT',
  CIRCUIT_BREAK: 'CIRCUIT_BREAK',
  CRITICAL: 'CRITICAL'
});

// ============================================================================
// FALLBACK STRATEGIES
// ============================================================================

const FallbackStrategy = Object.freeze({
  USE_DEFAULT: 'USE_DEFAULT',
  USE_CACHED: 'USE_CACHED',
  USE_CONSERVATIVE: 'USE_CONSERVATIVE',
  SKIP_ML: 'SKIP_ML',
  REJECT: 'REJECT'
});

// ============================================================================
// THRESHOLDS & CONFIGURATION
// ============================================================================

const ESCALATION_THRESHOLDS = Object.freeze({
  LOG_AFTER: 1,
  FALLBACK_AFTER: 1,
  ALERT_AFTER: 3,
  CIRCUIT_BREAK_AFTER: 5,
  CIRCUIT_BREAK_DURATION_MS: 60000,
  FAILURE_WINDOW_MS: 300000,
  CRITICAL_FAILURE_TYPES: [
    FailureType.MODEL_UNAVAILABLE,
    FailureType.CONFIDENCE_COLLAPSE
  ]
});

// ============================================================================
// DEFAULT FALLBACK VALUES
// ============================================================================

const FALLBACK_DEFAULTS = Object.freeze({
  subgenre_classification: {
    subgenre: 'hybrid',
    confidence: 0.35,
    probabilities: {},
    tier: 'VERY_LOW',
    fallbackReason: 'inference_failure',
    isFallback: true
  },
  confidence_score: {
    confidence: 0.40,
    tier: 'LOW',
    fallbackReason: 'inference_failure',
    isFallback: true
  },
  risk_assessment: {
    riskLevel: 'UNKNOWN',
    risks: {},
    fallbackReason: 'inference_failure',
    isFallback: true
  },
  loudness_analysis: {
    integratedLoudness: null,
    truePeak: null,
    loudnessRange: null,
    fallbackReason: 'inference_failure',
    isFallback: true
  },
  transient_analysis: {
    transientSharpness: null,
    transientDensity: null,
    fallbackReason: 'inference_failure',
    isFallback: true
  },
  default: {
    result: null,
    fallbackReason: 'inference_failure',
    isFallback: true
  }
});

// ============================================================================
// IN-MEMORY STATE (per-process)
// ============================================================================

const failureRegistry = new Map();
const circuitBreakerState = new Map();
const cachedResults = new Map();

// ============================================================================
// FAILURE CLASSIFICATION
// ============================================================================

/**
 * Classify the type of inference failure
 * @param {Error|any} error - The error or failed output
 * @param {any} output - The output value (if applicable)
 * @returns {string} FailureType
 */
function classifyFailure(error, output) {
  // Check if output argument was explicitly provided (even if undefined)
  const outputProvided = arguments.length >= 2;
  
  // Check output-based failures first
  if (outputProvided) {
    if (output === null) {
      return FailureType.NULL_OUTPUT;
    }
    if (output === undefined) {
      return FailureType.UNDEFINED_OUTPUT;
    }
    if (typeof output === 'number' && Number.isNaN(output)) {
      return FailureType.NAN_OUTPUT;
    }
    if (typeof output === 'object') {
      // Check for NaN in object values
      const hasNaN = Object.values(output).some(v => 
        typeof v === 'number' && Number.isNaN(v)
      );
      if (hasNaN) {
        return FailureType.NAN_OUTPUT;
      }
    }
  }

  // Error-based classification
  if (!error) {
    return FailureType.UNKNOWN;
  }

  const errorMessage = error.message || String(error);
  const errorMessageLower = errorMessage.toLowerCase();

  // Timeout detection
  if (
    errorMessageLower.includes('timeout') ||
    errorMessageLower.includes('timed out') ||
    errorMessageLower.includes('exceeded') ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ESOCKETTIMEDOUT'
  ) {
    return FailureType.TIMEOUT;
  }

  // Model unavailable
  if (
    errorMessageLower.includes('model not found') ||
    errorMessageLower.includes('model unavailable') ||
    errorMessageLower.includes('failed to load model') ||
    errorMessageLower.includes('no model') ||
    error.code === 'ENOENT'
  ) {
    return FailureType.MODEL_UNAVAILABLE;
  }

  // Invalid input
  if (
    errorMessageLower.includes('invalid input') ||
    errorMessageLower.includes('bad input') ||
    errorMessageLower.includes('input validation') ||
    errorMessageLower.includes('missing required')
  ) {
    return FailureType.INVALID_INPUT;
  }

  // Invalid shape
  if (
    errorMessageLower.includes('shape') ||
    errorMessageLower.includes('dimension') ||
    errorMessageLower.includes('expected array') ||
    errorMessageLower.includes('type mismatch')
  ) {
    return FailureType.INVALID_SHAPE;
  }

  // Out of range
  if (
    errorMessageLower.includes('out of range') ||
    errorMessageLower.includes('overflow') ||
    errorMessageLower.includes('underflow') ||
    errorMessageLower.includes('bounds')
  ) {
    return FailureType.OUT_OF_RANGE;
  }

  // Confidence collapse
  if (
    errorMessageLower.includes('confidence') ||
    errorMessageLower.includes('probability') ||
    errorMessageLower.includes('certainty')
  ) {
    return FailureType.CONFIDENCE_COLLAPSE;
  }

  // NaN in error message
  if (errorMessageLower.includes('nan')) {
    return FailureType.NAN_OUTPUT;
  }

  // Default to exception for Error instances
  if (error instanceof Error) {
    return FailureType.EXCEPTION;
  }

  return FailureType.UNKNOWN;
}

// ============================================================================
// FAILURE TRACKING
// ============================================================================

/**
 * Record a failure for a model
 * @param {string} modelId - Model identifier
 * @param {Object} failure - Failure details
 * @returns {Object} Updated failure stats
 */
function recordFailure(modelId, failure) {
  const now = Date.now();
  const windowStart = now - ESCALATION_THRESHOLDS.FAILURE_WINDOW_MS;

  if (!failureRegistry.has(modelId)) {
    failureRegistry.set(modelId, []);
  }

  const failures = failureRegistry.get(modelId);
  
  // Add new failure
  failures.push({
    type: failure.type,
    message: failure.message || '',
    timestamp: now,
    context: failure.context || {}
  });

  // Prune old failures outside window
  const recentFailures = failures.filter(f => f.timestamp >= windowStart);
  failureRegistry.set(modelId, recentFailures);

  return getFailureStats(modelId);
}

/**
 * Get failure statistics for a model
 * @param {string} modelId - Model identifier
 * @param {number} [windowMs] - Custom window duration
 * @returns {Object} Failure statistics
 */
function getFailureStats(modelId, windowMs = ESCALATION_THRESHOLDS.FAILURE_WINDOW_MS) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const failures = failureRegistry.get(modelId) || [];
  const recentFailures = failures.filter(f => f.timestamp >= windowStart);

  // Count by type
  const byType = {};
  for (const f of recentFailures) {
    byType[f.type] = (byType[f.type] || 0) + 1;
  }

  // Find most recent
  const sorted = [...recentFailures].sort((a, b) => b.timestamp - a.timestamp);
  const lastFailure = sorted[0] || null;
  const lastSuccess = getLastSuccess(modelId);

  return {
    modelId,
    failuresInWindow: recentFailures.length,
    windowDurationMs: windowMs,
    byType,
    lastFailure: lastFailure ? new Date(lastFailure.timestamp).toISOString() : null,
    lastSuccess: lastSuccess ? new Date(lastSuccess).toISOString() : null,
    failureRate: calculateFailureRate(modelId)
  };
}

/**
 * Track successful inference
 * @param {string} modelId - Model identifier
 */
function recordSuccess(modelId) {
  const key = `${modelId}:lastSuccess`;
  cachedResults.set(key, Date.now());
}

/**
 * Get last success timestamp
 * @param {string} modelId - Model identifier
 * @returns {number|null} Timestamp or null
 */
function getLastSuccess(modelId) {
  const key = `${modelId}:lastSuccess`;
  return cachedResults.get(key) || null;
}

/**
 * Calculate failure rate (failures per minute in window)
 * @param {string} modelId - Model identifier
 * @returns {number} Failure rate
 */
function calculateFailureRate(modelId) {
  const failures = failureRegistry.get(modelId) || [];
  const windowMinutes = ESCALATION_THRESHOLDS.FAILURE_WINDOW_MS / 60000;
  return failures.length / windowMinutes;
}

/**
 * Clear failure history for a model
 * @param {string} modelId - Model identifier
 */
function clearFailures(modelId) {
  failureRegistry.delete(modelId);
}

/**
 * Clear all failure history
 */
function clearAllFailures() {
  failureRegistry.clear();
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Check if circuit breaker is active for a model
 * @param {string} modelId - Model identifier
 * @returns {Object} Circuit breaker status
 */
function checkCircuitBreaker(modelId) {
  const state = circuitBreakerState.get(modelId);
  
  if (!state) {
    return { broken: false, remainingMs: 0 };
  }

  const now = Date.now();
  const elapsed = now - state.brokenAt;
  const remaining = state.duration - elapsed;

  if (remaining <= 0) {
    // Circuit breaker expired, auto-reset
    circuitBreakerState.delete(modelId);
    return { broken: false, remainingMs: 0, autoReset: true };
  }

  return {
    broken: true,
    remainingMs: remaining,
    brokenAt: new Date(state.brokenAt).toISOString(),
    reason: state.reason,
    failureCount: state.failureCount
  };
}

/**
 * Trip the circuit breaker for a model
 * @param {string} modelId - Model identifier
 * @param {string} reason - Reason for tripping
 * @param {number} failureCount - Number of failures
 * @param {number} [durationMs] - Custom duration
 */
function tripCircuitBreaker(modelId, reason, failureCount, durationMs = ESCALATION_THRESHOLDS.CIRCUIT_BREAK_DURATION_MS) {
  circuitBreakerState.set(modelId, {
    brokenAt: Date.now(),
    duration: durationMs,
    reason,
    failureCount
  });
}

/**
 * Manually reset circuit breaker
 * @param {string} modelId - Model identifier
 * @returns {boolean} Whether reset was successful
 */
function resetCircuitBreaker(modelId) {
  const existed = circuitBreakerState.has(modelId);
  circuitBreakerState.delete(modelId);
  clearFailures(modelId);
  return existed;
}

/**
 * Reset all circuit breakers
 */
function resetAllCircuitBreakers() {
  circuitBreakerState.clear();
  clearAllFailures();
}

/**
 * Get all active circuit breakers
 * @returns {Object[]} List of active circuit breakers
 */
function getActiveCircuitBreakers() {
  const active = [];
  
  for (const [modelId, state] of circuitBreakerState) {
    const status = checkCircuitBreaker(modelId);
    if (status.broken) {
      active.push({
        modelId,
        ...status
      });
    }
  }

  return active;
}

// ============================================================================
// ESCALATION DETERMINATION
// ============================================================================

/**
 * Determine appropriate escalation level
 * @param {string} modelId - Model identifier
 * @param {string} failureType - Type of failure
 * @param {number} [failureCount] - Override failure count
 * @returns {Object} Escalation details
 */
function determineEscalation(modelId, failureType, failureCount = null) {
  // Check for existing circuit break
  const cbStatus = checkCircuitBreaker(modelId);
  if (cbStatus.broken) {
    return {
      level: EscalationLevel.CIRCUIT_BREAK,
      reason: 'Circuit breaker active',
      remainingMs: cbStatus.remainingMs,
      shouldFallback: true,
      shouldAlert: false
    };
  }

  // Get current failure count if not provided
  const stats = getFailureStats(modelId);
  const count = failureCount !== null ? failureCount : stats.failuresInWindow;

  // Critical failure types escalate immediately
  if (ESCALATION_THRESHOLDS.CRITICAL_FAILURE_TYPES.includes(failureType)) {
    return {
      level: EscalationLevel.CRITICAL,
      reason: `Critical failure type: ${failureType}`,
      failureCount: count,
      shouldFallback: true,
      shouldAlert: true
    };
  }

  // Escalation ladder based on failure count
  if (count >= ESCALATION_THRESHOLDS.CIRCUIT_BREAK_AFTER) {
    return {
      level: EscalationLevel.CIRCUIT_BREAK,
      reason: `${count} failures in window exceeds threshold`,
      failureCount: count,
      shouldFallback: true,
      shouldAlert: true,
      shouldTripBreaker: true
    };
  }

  if (count >= ESCALATION_THRESHOLDS.ALERT_AFTER) {
    return {
      level: EscalationLevel.ALERT,
      reason: `${count} failures in window`,
      failureCount: count,
      shouldFallback: true,
      shouldAlert: true
    };
  }

  if (count >= ESCALATION_THRESHOLDS.FALLBACK_AFTER) {
    return {
      level: EscalationLevel.FALLBACK,
      reason: `Failure occurred, using fallback`,
      failureCount: count,
      shouldFallback: true,
      shouldAlert: false
    };
  }

  if (count >= ESCALATION_THRESHOLDS.LOG_AFTER) {
    return {
      level: EscalationLevel.LOG,
      reason: `Failure logged`,
      failureCount: count,
      shouldFallback: true,
      shouldAlert: false
    };
  }

  return {
    level: EscalationLevel.NONE,
    reason: 'No escalation needed',
    failureCount: count,
    shouldFallback: false,
    shouldAlert: false
  };
}

// ============================================================================
// FALLBACK RETRIEVAL
// ============================================================================

/**
 * Get fallback value for a model
 * @param {string} modelId - Model identifier
 * @param {string} [strategy] - Fallback strategy
 * @param {Object} [context] - Additional context
 * @returns {Object} Fallback value
 */
function getFallback(modelId, strategy = FallbackStrategy.USE_DEFAULT, context = {}) {
  // Try cached result first if strategy allows
  if (strategy === FallbackStrategy.USE_CACHED) {
    const cacheKey = `${modelId}:lastGood`;
    const cached = cachedResults.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        fallbackReason: 'cached_result',
        isFallback: true,
        cachedAt: new Date(cached._cachedAt).toISOString()
      };
    }
    // Fall through to default if no cache
  }

  // Conservative strategy
  if (strategy === FallbackStrategy.USE_CONSERVATIVE) {
    const defaultFallback = FALLBACK_DEFAULTS[modelId] || FALLBACK_DEFAULTS.default;
    return {
      ...defaultFallback,
      fallbackReason: 'conservative_fallback',
      conservative: true
    };
  }

  // Reject strategy
  if (strategy === FallbackStrategy.REJECT) {
    return {
      rejected: true,
      fallbackReason: 'inference_rejected',
      isFallback: true,
      modelId
    };
  }

  // Skip ML strategy
  if (strategy === FallbackStrategy.SKIP_ML) {
    return {
      skipped: true,
      fallbackReason: 'ml_skipped',
      isFallback: true,
      modelId
    };
  }

  // Default strategy
  const defaultFallback = FALLBACK_DEFAULTS[modelId] || FALLBACK_DEFAULTS.default;
  return { ...defaultFallback };
}

/**
 * Cache a successful result for potential fallback use
 * @param {string} modelId - Model identifier
 * @param {Object} result - Result to cache
 */
function cacheResult(modelId, result) {
  const cacheKey = `${modelId}:lastGood`;
  cachedResults.set(cacheKey, {
    ...result,
    _cachedAt: Date.now()
  });
}

/**
 * Get cached result
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Cached result or null
 */
function getCachedResult(modelId) {
  const cacheKey = `${modelId}:lastGood`;
  return cachedResults.get(cacheKey) || null;
}

// ============================================================================
// MAIN FAILURE HANDLER
// ============================================================================

/**
 * Handle an inference failure
 * @param {string} modelId - Model identifier
 * @param {Error|any} error - The error
 * @param {Object} [context] - Additional context
 * @returns {Object} Failure handling result
 */
function handleInferenceFailure(modelId, error, context = {}) {
  const timestamp = new Date().toISOString();
  
  // Classify the failure - only pass output if explicitly provided in context
  const failureType = 'output' in context 
    ? classifyFailure(error, context.output)
    : classifyFailure(error);
  
  // Record the failure
  const stats = recordFailure(modelId, {
    type: failureType,
    message: error?.message || String(error),
    context
  });

  // Determine escalation
  const escalation = determineEscalation(modelId, failureType);

  // Trip circuit breaker if needed
  if (escalation.shouldTripBreaker) {
    tripCircuitBreaker(
      modelId,
      escalation.reason,
      escalation.failureCount
    );
  }

  // Get fallback
  const fallbackStrategy = context.fallbackStrategy || FallbackStrategy.USE_DEFAULT;
  const fallback = getFallback(modelId, fallbackStrategy, context);

  // Build recommendations
  const recommendations = buildRecommendations(failureType, escalation, stats);

  return {
    handled: true,
    timestamp,
    
    failure: {
      type: failureType,
      modelId,
      error: error?.message || String(error),
      context: sanitizeContext(context)
    },

    escalation: {
      level: escalation.level,
      reason: escalation.reason,
      alertSent: escalation.shouldAlert,
      circuitBroken: escalation.level === EscalationLevel.CIRCUIT_BREAK
    },

    fallback,

    stats: {
      failuresInWindow: stats.failuresInWindow,
      windowDurationMs: stats.windowDurationMs,
      failureRate: stats.failureRate,
      lastSuccess: stats.lastSuccess
    },

    recommendations
  };
}

/**
 * Sanitize context for logging (remove sensitive data)
 * @param {Object} context - Raw context
 * @returns {Object} Sanitized context
 */
function sanitizeContext(context) {
  const sanitized = { ...context };
  
  // Remove potentially large or sensitive fields
  delete sanitized.rawAudio;
  delete sanitized.buffer;
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.apiKey;
  
  return sanitized;
}

/**
 * Build recommendations based on failure analysis
 * @param {string} failureType - Type of failure
 * @param {Object} escalation - Escalation details
 * @param {Object} stats - Failure stats
 * @returns {string[]} Recommendations
 */
function buildRecommendations(failureType, escalation, stats) {
  const recommendations = [];

  // Type-specific recommendations
  switch (failureType) {
    case FailureType.TIMEOUT:
      recommendations.push('Consider increasing timeout if pattern continues');
      recommendations.push('Check for resource contention or slow I/O');
      break;
    case FailureType.MODEL_UNAVAILABLE:
      recommendations.push('Verify model file exists and is accessible');
      recommendations.push('Check model version compatibility');
      break;
    case FailureType.NAN_OUTPUT:
      recommendations.push('Check for invalid input values (e.g., negative for log)');
      recommendations.push('Verify input normalization');
      break;
    case FailureType.INVALID_INPUT:
      recommendations.push('Validate input before inference');
      recommendations.push('Check for missing required fields');
      break;
    case FailureType.OUT_OF_RANGE:
      recommendations.push('Clamp input values to expected ranges');
      break;
    case FailureType.CONFIDENCE_COLLAPSE:
      recommendations.push('Input may be out-of-distribution');
      recommendations.push('Consider signal drift detection');
      break;
    default:
      recommendations.push('Monitor for additional failures');
  }

  // Escalation-based recommendations
  if (escalation.level === EscalationLevel.CIRCUIT_BREAK) {
    recommendations.push('Circuit breaker active - ML disabled temporarily');
    recommendations.push('Manual intervention may be required');
  } else if (escalation.level === EscalationLevel.ALERT) {
    recommendations.push('Elevated failure rate detected');
    recommendations.push('Review recent changes to input sources');
  }

  // Stats-based recommendations
  if (stats.failureRate > 0.5) {
    recommendations.push('High failure rate - consider disabling ML for this model');
  }

  return recommendations;
}

// ============================================================================
// WRAPPED INFERENCE
// ============================================================================

/**
 * Wrap an inference function with failure handling
 * @param {Function} fn - Inference function to wrap
 * @param {string} modelId - Model identifier
 * @param {Object} [options] - Wrapping options
 * @returns {Function} Wrapped function
 */
function wrapInference(fn, modelId, options = {}) {
  const {
    timeout = 5000,
    fallbackStrategy = FallbackStrategy.USE_DEFAULT,
    validateOutput = null,
    cacheSuccessful = true
  } = options;

  return async function wrappedInference(...args) {
    // Check circuit breaker first
    const cbStatus = checkCircuitBreaker(modelId);
    if (cbStatus.broken) {
      return {
        ...getFallback(modelId, fallbackStrategy),
        circuitBroken: true,
        remainingMs: cbStatus.remainingMs
      };
    }

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Inference timeout after ${timeout}ms`)), timeout);
      });

      // Race inference against timeout
      const result = await Promise.race([
        fn(...args),
        timeoutPromise
      ]);

      // Validate output if validator provided
      if (validateOutput) {
        const validation = validateOutput(result);
        if (!validation.valid) {
          throw new Error(validation.error || 'Output validation failed');
        }
      }

      // Check for invalid outputs
      if (result === null || result === undefined) {
        throw new Error('Null or undefined output');
      }

      if (typeof result === 'number' && Number.isNaN(result)) {
        throw new Error('NaN output');
      }

      // Success! Record and optionally cache
      recordSuccess(modelId);
      if (cacheSuccessful) {
        cacheResult(modelId, result);
      }

      return result;

    } catch (error) {
      // Handle the failure
      const handled = handleInferenceFailure(modelId, error, {
        args: args.length > 0 ? '[args provided]' : '[no args]',
        fallbackStrategy
      });

      // Return fallback with failure metadata
      return {
        ...handled.fallback,
        _inferenceError: {
          type: handled.failure.type,
          escalation: handled.escalation.level,
          handled: true
        }
      };
    }
  };
}

/**
 * Create a wrapped inference with custom options
 * @param {string} modelId - Model identifier
 * @param {Object} options - Wrapping options
 * @returns {Function} Wrapper function
 */
function createInferenceWrapper(modelId, options = {}) {
  return (fn) => wrapInference(fn, modelId, options);
}

// ============================================================================
// QUICK CHECK & ANALYSIS
// ============================================================================

/**
 * Quick health check for a model
 * @param {string} modelId - Model identifier
 * @returns {Object} Health status
 */
function quickCheck(modelId) {
  const cbStatus = checkCircuitBreaker(modelId);
  const stats = getFailureStats(modelId);

  const healthy = !cbStatus.broken && 
                  stats.failuresInWindow < ESCALATION_THRESHOLDS.ALERT_AFTER;

  return {
    modelId,
    healthy,
    circuitBroken: cbStatus.broken,
    failuresInWindow: stats.failuresInWindow,
    failureRate: stats.failureRate,
    status: cbStatus.broken ? 'CIRCUIT_BROKEN' : 
            stats.failuresInWindow >= ESCALATION_THRESHOLDS.ALERT_AFTER ? 'DEGRADED' :
            stats.failuresInWindow > 0 ? 'RECOVERING' : 'HEALTHY'
  };
}

/**
 * Full analysis of a model's failure state
 * @param {string} modelId - Model identifier
 * @returns {Object} Complete analysis
 */
function analyze(modelId) {
  const cbStatus = checkCircuitBreaker(modelId);
  const stats = getFailureStats(modelId);
  const cached = getCachedResult(modelId);
  const health = quickCheck(modelId);

  return {
    modelId,
    timestamp: new Date().toISOString(),
    
    health,

    circuitBreaker: cbStatus.broken ? {
      broken: true,
      remainingMs: cbStatus.remainingMs,
      brokenAt: cbStatus.brokenAt,
      reason: cbStatus.reason
    } : { broken: false },

    failures: {
      inWindow: stats.failuresInWindow,
      windowDurationMs: stats.windowDurationMs,
      byType: stats.byType,
      rate: stats.failureRate,
      lastFailure: stats.lastFailure,
      lastSuccess: stats.lastSuccess
    },

    cache: cached ? {
      available: true,
      cachedAt: new Date(cached._cachedAt).toISOString()
    } : { available: false },

    thresholds: {
      alertAfter: ESCALATION_THRESHOLDS.ALERT_AFTER,
      circuitBreakAfter: ESCALATION_THRESHOLDS.CIRCUIT_BREAK_AFTER,
      circuitBreakDurationMs: ESCALATION_THRESHOLDS.CIRCUIT_BREAK_DURATION_MS,
      failureWindowMs: ESCALATION_THRESHOLDS.FAILURE_WINDOW_MS
    },

    recommendations: health.healthy ? [] : [
      health.circuitBroken ? 'Wait for circuit breaker to reset or manually reset' : null,
      stats.failuresInWindow >= ESCALATION_THRESHOLDS.ALERT_AFTER ? 'Investigate recent failure causes' : null,
      !cached ? 'No cached fallback available' : null
    ].filter(Boolean)
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Enums
  FailureType,
  EscalationLevel,
  FallbackStrategy,

  // Constants
  ESCALATION_THRESHOLDS,
  FALLBACK_DEFAULTS,

  // Failure classification
  classifyFailure,

  // Failure tracking
  recordFailure,
  recordSuccess,
  getFailureStats,
  clearFailures,
  clearAllFailures,

  // Circuit breaker
  checkCircuitBreaker,
  tripCircuitBreaker,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  getActiveCircuitBreakers,

  // Escalation
  determineEscalation,

  // Fallbacks
  getFallback,
  cacheResult,
  getCachedResult,

  // Main handler
  handleInferenceFailure,

  // Wrapped inference
  wrapInference,
  createInferenceWrapper,

  // Analysis
  quickCheck,
  analyze
};
