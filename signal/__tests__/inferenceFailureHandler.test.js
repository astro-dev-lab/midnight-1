/**
 * Inference Failure Escalation Handler Tests
 * 
 * Tests for fail-closed ML inference behavior including:
 * - Failure classification
 * - Escalation ladder
 * - Circuit breaker
 * - Fallback strategies
 * 
 * @jest-environment node
 */

const {
  FailureType,
  EscalationLevel,
  FallbackStrategy,
  ESCALATION_THRESHOLDS,
  FALLBACK_DEFAULTS,
  classifyFailure,
  recordFailure,
  recordSuccess,
  getFailureStats,
  clearFailures,
  clearAllFailures,
  checkCircuitBreaker,
  tripCircuitBreaker,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  getActiveCircuitBreakers,
  determineEscalation,
  getFallback,
  cacheResult,
  getCachedResult,
  handleInferenceFailure,
  wrapInference,
  createInferenceWrapper,
  quickCheck,
  analyze
} = require('../services/inferenceFailureHandler');

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Inference Failure Handler', () => {
  beforeEach(() => {
    // Clean state before each test
    resetAllCircuitBreakers();
  });

  // ==========================================================================
  // FAILURE TYPE CLASSIFICATION
  // ==========================================================================

  describe('Failure Classification', () => {
    describe('classifyFailure', () => {
      test('should classify timeout errors', () => {
        expect(classifyFailure(new Error('Request timeout'))).toBe(FailureType.TIMEOUT);
        expect(classifyFailure(new Error('Operation timed out'))).toBe(FailureType.TIMEOUT);
        expect(classifyFailure(new Error('Timeout exceeded 5000ms'))).toBe(FailureType.TIMEOUT);
        expect(classifyFailure({ code: 'ETIMEDOUT' })).toBe(FailureType.TIMEOUT);
        expect(classifyFailure({ code: 'ESOCKETTIMEDOUT' })).toBe(FailureType.TIMEOUT);
      });

      test('should classify model unavailable errors', () => {
        expect(classifyFailure(new Error('Model not found'))).toBe(FailureType.MODEL_UNAVAILABLE);
        expect(classifyFailure(new Error('Model unavailable'))).toBe(FailureType.MODEL_UNAVAILABLE);
        expect(classifyFailure(new Error('Failed to load model'))).toBe(FailureType.MODEL_UNAVAILABLE);
        expect(classifyFailure({ code: 'ENOENT', message: 'No such file' })).toBe(FailureType.MODEL_UNAVAILABLE);
      });

      test('should classify invalid input errors', () => {
        expect(classifyFailure(new Error('Invalid input format'))).toBe(FailureType.INVALID_INPUT);
        expect(classifyFailure(new Error('Bad input provided'))).toBe(FailureType.INVALID_INPUT);
        expect(classifyFailure(new Error('Input validation failed'))).toBe(FailureType.INVALID_INPUT);
        expect(classifyFailure(new Error('Missing required field'))).toBe(FailureType.INVALID_INPUT);
      });

      test('should classify invalid shape errors', () => {
        expect(classifyFailure(new Error('Invalid shape'))).toBe(FailureType.INVALID_SHAPE);
        expect(classifyFailure(new Error('Dimension mismatch'))).toBe(FailureType.INVALID_SHAPE);
        expect(classifyFailure(new Error('Expected array'))).toBe(FailureType.INVALID_SHAPE);
        expect(classifyFailure(new Error('Type mismatch'))).toBe(FailureType.INVALID_SHAPE);
      });

      test('should classify out of range errors', () => {
        expect(classifyFailure(new Error('Value out of range'))).toBe(FailureType.OUT_OF_RANGE);
        expect(classifyFailure(new Error('Integer overflow'))).toBe(FailureType.OUT_OF_RANGE);
        expect(classifyFailure(new Error('Underflow detected'))).toBe(FailureType.OUT_OF_RANGE);
        expect(classifyFailure(new Error('Out of bounds'))).toBe(FailureType.OUT_OF_RANGE);
      });

      test('should classify confidence collapse errors', () => {
        expect(classifyFailure(new Error('Confidence too low'))).toBe(FailureType.CONFIDENCE_COLLAPSE);
        expect(classifyFailure(new Error('Probability collapsed'))).toBe(FailureType.CONFIDENCE_COLLAPSE);
        expect(classifyFailure(new Error('Certainty undefined'))).toBe(FailureType.CONFIDENCE_COLLAPSE);
      });

      test('should classify NaN output from error message', () => {
        expect(classifyFailure(new Error('Result is NaN'))).toBe(FailureType.NAN_OUTPUT);
        expect(classifyFailure(new Error('NaN detected in output'))).toBe(FailureType.NAN_OUTPUT);
      });

      test('should classify NaN from output value', () => {
        expect(classifyFailure(null, NaN)).toBe(FailureType.NAN_OUTPUT);
        expect(classifyFailure(null, { value: NaN })).toBe(FailureType.NAN_OUTPUT);
      });

      test('should classify null output', () => {
        expect(classifyFailure(null, null)).toBe(FailureType.NULL_OUTPUT);
      });

      test('should classify undefined output', () => {
        expect(classifyFailure(null, undefined)).toBe(FailureType.UNDEFINED_OUTPUT);
      });

      test('should classify generic Error as exception', () => {
        expect(classifyFailure(new Error('Something went wrong'))).toBe(FailureType.EXCEPTION);
        expect(classifyFailure(new TypeError('Type error'))).toBe(FailureType.EXCEPTION);
      });

      test('should return UNKNOWN for non-errors without specific message', () => {
        expect(classifyFailure(null)).toBe(FailureType.UNKNOWN);
        expect(classifyFailure({ foo: 'bar' })).toBe(FailureType.UNKNOWN);
      });

      test('should handle string errors', () => {
        expect(classifyFailure('timeout')).toBe(FailureType.TIMEOUT);
        expect(classifyFailure('model not found')).toBe(FailureType.MODEL_UNAVAILABLE);
      });
    });
  });

  // ==========================================================================
  // FAILURE TRACKING
  // ==========================================================================

  describe('Failure Tracking', () => {
    const modelId = 'test_model';

    beforeEach(() => {
      clearFailures(modelId);
    });

    describe('recordFailure', () => {
      test('should record a failure and return stats', () => {
        const stats = recordFailure(modelId, {
          type: FailureType.TIMEOUT,
          message: 'Test timeout'
        });

        expect(stats.failuresInWindow).toBe(1);
        expect(stats.byType[FailureType.TIMEOUT]).toBe(1);
      });

      test('should accumulate multiple failures', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure(modelId, { type: FailureType.EXCEPTION });

        const stats = getFailureStats(modelId);
        expect(stats.failuresInWindow).toBe(3);
        expect(stats.byType[FailureType.TIMEOUT]).toBe(2);
        expect(stats.byType[FailureType.EXCEPTION]).toBe(1);
      });

      test('should track context with failures', () => {
        recordFailure(modelId, {
          type: FailureType.TIMEOUT,
          message: 'Test',
          context: { inputSize: 1000 }
        });

        const stats = getFailureStats(modelId);
        expect(stats.failuresInWindow).toBe(1);
      });
    });

    describe('getFailureStats', () => {
      test('should return empty stats for unknown model', () => {
        const stats = getFailureStats('unknown_model');

        expect(stats.failuresInWindow).toBe(0);
        expect(stats.byType).toEqual({});
        expect(stats.lastFailure).toBeNull();
      });

      test('should calculate failure rate', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure(modelId, { type: FailureType.TIMEOUT });

        const stats = getFailureStats(modelId);
        expect(stats.failureRate).toBeGreaterThan(0);
      });

      test('should track last failure timestamp', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });

        const stats = getFailureStats(modelId);
        expect(stats.lastFailure).not.toBeNull();
        expect(new Date(stats.lastFailure).getTime()).toBeLessThanOrEqual(Date.now());
      });
    });

    describe('recordSuccess', () => {
      test('should track last success', () => {
        recordSuccess(modelId);

        const stats = getFailureStats(modelId);
        expect(stats.lastSuccess).not.toBeNull();
      });
    });

    describe('clearFailures', () => {
      test('should clear failures for specific model', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure('other_model', { type: FailureType.TIMEOUT });

        clearFailures(modelId);

        expect(getFailureStats(modelId).failuresInWindow).toBe(0);
        expect(getFailureStats('other_model').failuresInWindow).toBe(1);
      });
    });

    describe('clearAllFailures', () => {
      test('should clear all failures', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure('other_model', { type: FailureType.TIMEOUT });

        clearAllFailures();

        expect(getFailureStats(modelId).failuresInWindow).toBe(0);
        expect(getFailureStats('other_model').failuresInWindow).toBe(0);
      });
    });
  });

  // ==========================================================================
  // CIRCUIT BREAKER
  // ==========================================================================

  describe('Circuit Breaker', () => {
    const modelId = 'circuit_test_model';

    beforeEach(() => {
      resetCircuitBreaker(modelId);
    });

    describe('checkCircuitBreaker', () => {
      test('should return not broken for unknown model', () => {
        const status = checkCircuitBreaker('unknown');

        expect(status.broken).toBe(false);
        expect(status.remainingMs).toBe(0);
      });

      test('should return broken status when tripped', () => {
        tripCircuitBreaker(modelId, 'Test reason', 5);

        const status = checkCircuitBreaker(modelId);
        expect(status.broken).toBe(true);
        expect(status.remainingMs).toBeGreaterThan(0);
        expect(status.reason).toBe('Test reason');
        expect(status.failureCount).toBe(5);
      });

      test('should auto-reset after duration expires', async () => {
        // Trip with very short duration
        tripCircuitBreaker(modelId, 'Test', 1, 10);

        expect(checkCircuitBreaker(modelId).broken).toBe(true);

        // Wait for expiry
        await new Promise(resolve => setTimeout(resolve, 20));

        const status = checkCircuitBreaker(modelId);
        expect(status.broken).toBe(false);
        expect(status.autoReset).toBe(true);
      });
    });

    describe('tripCircuitBreaker', () => {
      test('should trip circuit breaker with default duration', () => {
        tripCircuitBreaker(modelId, 'Too many failures', 5);

        const status = checkCircuitBreaker(modelId);
        expect(status.broken).toBe(true);
        expect(status.remainingMs).toBeLessThanOrEqual(ESCALATION_THRESHOLDS.CIRCUIT_BREAK_DURATION_MS);
      });

      test('should trip with custom duration', () => {
        tripCircuitBreaker(modelId, 'Custom duration', 3, 120000);

        const status = checkCircuitBreaker(modelId);
        expect(status.broken).toBe(true);
        expect(status.remainingMs).toBeLessThanOrEqual(120000);
      });
    });

    describe('resetCircuitBreaker', () => {
      test('should reset tripped circuit breaker', () => {
        tripCircuitBreaker(modelId, 'Test', 5);
        expect(checkCircuitBreaker(modelId).broken).toBe(true);

        const result = resetCircuitBreaker(modelId);
        expect(result).toBe(true);
        expect(checkCircuitBreaker(modelId).broken).toBe(false);
      });

      test('should return false for non-existent breaker', () => {
        const result = resetCircuitBreaker('unknown');
        expect(result).toBe(false);
      });

      test('should also clear failures', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        tripCircuitBreaker(modelId, 'Test', 5);

        resetCircuitBreaker(modelId);

        expect(getFailureStats(modelId).failuresInWindow).toBe(0);
      });
    });

    describe('getActiveCircuitBreakers', () => {
      test('should return empty array when none active', () => {
        expect(getActiveCircuitBreakers()).toEqual([]);
      });

      test('should return active circuit breakers', () => {
        tripCircuitBreaker('model1', 'Reason 1', 5);
        tripCircuitBreaker('model2', 'Reason 2', 3);

        const active = getActiveCircuitBreakers();
        expect(active.length).toBe(2);
        expect(active.map(a => a.modelId)).toContain('model1');
        expect(active.map(a => a.modelId)).toContain('model2');
      });

      test('should not include expired circuit breakers', async () => {
        tripCircuitBreaker('expiring', 'Test', 1, 10);
        tripCircuitBreaker('staying', 'Test', 1, 60000);

        await new Promise(resolve => setTimeout(resolve, 20));

        const active = getActiveCircuitBreakers();
        expect(active.map(a => a.modelId)).not.toContain('expiring');
        expect(active.map(a => a.modelId)).toContain('staying');
      });
    });
  });

  // ==========================================================================
  // ESCALATION DETERMINATION
  // ==========================================================================

  describe('Escalation Determination', () => {
    const modelId = 'escalation_test';

    beforeEach(() => {
      resetCircuitBreaker(modelId);
    });

    describe('determineEscalation', () => {
      test('should return CIRCUIT_BREAK if already broken', () => {
        tripCircuitBreaker(modelId, 'Pre-broken', 5);

        const escalation = determineEscalation(modelId, FailureType.TIMEOUT);
        expect(escalation.level).toBe(EscalationLevel.CIRCUIT_BREAK);
        expect(escalation.shouldFallback).toBe(true);
      });

      test('should escalate CRITICAL for critical failure types', () => {
        const escalation = determineEscalation(modelId, FailureType.MODEL_UNAVAILABLE, 1);
        expect(escalation.level).toBe(EscalationLevel.CRITICAL);
        expect(escalation.shouldAlert).toBe(true);
        expect(escalation.shouldFallback).toBe(true);
      });

      test('should escalate to CIRCUIT_BREAK at threshold', () => {
        const escalation = determineEscalation(
          modelId, 
          FailureType.TIMEOUT, 
          ESCALATION_THRESHOLDS.CIRCUIT_BREAK_AFTER
        );
        expect(escalation.level).toBe(EscalationLevel.CIRCUIT_BREAK);
        expect(escalation.shouldTripBreaker).toBe(true);
      });

      test('should escalate to ALERT at threshold', () => {
        const escalation = determineEscalation(
          modelId, 
          FailureType.TIMEOUT, 
          ESCALATION_THRESHOLDS.ALERT_AFTER
        );
        expect(escalation.level).toBe(EscalationLevel.ALERT);
        expect(escalation.shouldAlert).toBe(true);
      });

      test('should escalate to FALLBACK on first failure', () => {
        const escalation = determineEscalation(modelId, FailureType.TIMEOUT, 1);
        expect(escalation.level).toBe(EscalationLevel.FALLBACK);
        expect(escalation.shouldFallback).toBe(true);
        expect(escalation.shouldAlert).toBe(false);
      });

      test('should return NONE for zero failures', () => {
        const escalation = determineEscalation(modelId, FailureType.TIMEOUT, 0);
        expect(escalation.level).toBe(EscalationLevel.NONE);
        expect(escalation.shouldFallback).toBe(false);
      });

      test('should use actual failure count when not provided', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure(modelId, { type: FailureType.TIMEOUT });

        const escalation = determineEscalation(modelId, FailureType.TIMEOUT);
        expect(escalation.failureCount).toBe(3);
        expect(escalation.level).toBe(EscalationLevel.ALERT);
      });
    });
  });

  // ==========================================================================
  // FALLBACK RETRIEVAL
  // ==========================================================================

  describe('Fallback Retrieval', () => {
    describe('getFallback', () => {
      test('should return default fallback for known model', () => {
        const fallback = getFallback('subgenre_classification');

        expect(fallback.subgenre).toBe('hybrid');
        expect(fallback.confidence).toBe(0.35);
        expect(fallback.isFallback).toBe(true);
        expect(fallback.fallbackReason).toBe('inference_failure');
      });

      test('should return generic fallback for unknown model', () => {
        const fallback = getFallback('unknown_model');

        expect(fallback.result).toBeNull();
        expect(fallback.isFallback).toBe(true);
      });

      test('should use cached result when strategy is USE_CACHED', () => {
        const modelId = 'cache_test';
        const cachedValue = { subgenre: 'drill', confidence: 0.9 };
        
        cacheResult(modelId, cachedValue);

        const fallback = getFallback(modelId, FallbackStrategy.USE_CACHED);
        expect(fallback.subgenre).toBe('drill');
        expect(fallback.confidence).toBe(0.9);
        expect(fallback.fallbackReason).toBe('cached_result');
      });

      test('should fall back to default when no cache available', () => {
        const fallback = getFallback('subgenre_classification', FallbackStrategy.USE_CACHED);

        expect(fallback.subgenre).toBe('hybrid');
        expect(fallback.fallbackReason).toBe('inference_failure');
      });

      test('should return conservative fallback', () => {
        const fallback = getFallback('subgenre_classification', FallbackStrategy.USE_CONSERVATIVE);

        expect(fallback.conservative).toBe(true);
        expect(fallback.fallbackReason).toBe('conservative_fallback');
      });

      test('should return rejected for REJECT strategy', () => {
        const fallback = getFallback('test_model', FallbackStrategy.REJECT);

        expect(fallback.rejected).toBe(true);
        expect(fallback.fallbackReason).toBe('inference_rejected');
      });

      test('should return skipped for SKIP_ML strategy', () => {
        const fallback = getFallback('test_model', FallbackStrategy.SKIP_ML);

        expect(fallback.skipped).toBe(true);
        expect(fallback.fallbackReason).toBe('ml_skipped');
      });
    });

    describe('cacheResult and getCachedResult', () => {
      test('should cache and retrieve results', () => {
        const modelId = 'cache_test';
        const result = { value: 42 };

        cacheResult(modelId, result);
        const cached = getCachedResult(modelId);

        expect(cached.value).toBe(42);
        expect(cached._cachedAt).toBeDefined();
      });

      test('should return null for uncached model', () => {
        expect(getCachedResult('unknown')).toBeNull();
      });

      test('should overwrite previous cache', () => {
        const modelId = 'cache_test';

        cacheResult(modelId, { value: 1 });
        cacheResult(modelId, { value: 2 });

        expect(getCachedResult(modelId).value).toBe(2);
      });
    });
  });

  // ==========================================================================
  // MAIN FAILURE HANDLER
  // ==========================================================================

  describe('Main Failure Handler', () => {
    const modelId = 'handler_test';

    beforeEach(() => {
      resetCircuitBreaker(modelId);
    });

    describe('handleInferenceFailure', () => {
      test('should handle timeout failure', () => {
        const result = handleInferenceFailure(
          modelId,
          new Error('Request timeout')
        );

        expect(result.handled).toBe(true);
        expect(result.failure.type).toBe(FailureType.TIMEOUT);
        expect(result.failure.modelId).toBe(modelId);
        expect(result.escalation.level).toBe(EscalationLevel.FALLBACK);
        expect(result.fallback).toBeDefined();
        expect(result.stats.failuresInWindow).toBe(1);
      });

      test('should include recommendations', () => {
        const result = handleInferenceFailure(
          modelId,
          new Error('Request timeout')
        );

        expect(result.recommendations).toBeInstanceOf(Array);
        expect(result.recommendations.length).toBeGreaterThan(0);
      });

      test('should use provided fallback strategy', () => {
        const result = handleInferenceFailure(
          'subgenre_classification',
          new Error('Test error'),
          { fallbackStrategy: FallbackStrategy.USE_CONSERVATIVE }
        );

        expect(result.fallback.conservative).toBe(true);
      });

      test('should trip circuit breaker after threshold failures', () => {
        for (let i = 0; i < ESCALATION_THRESHOLDS.CIRCUIT_BREAK_AFTER; i++) {
          handleInferenceFailure(modelId, new Error('Test error'));
        }

        expect(checkCircuitBreaker(modelId).broken).toBe(true);
      });

      test('should sanitize context', () => {
        const result = handleInferenceFailure(
          modelId,
          new Error('Test'),
          { 
            normalField: 'ok',
            password: 'secret',
            apiKey: 'key123',
            rawAudio: Buffer.from([1, 2, 3])
          }
        );

        expect(result.failure.context.normalField).toBe('ok');
        expect(result.failure.context.password).toBeUndefined();
        expect(result.failure.context.apiKey).toBeUndefined();
        expect(result.failure.context.rawAudio).toBeUndefined();
      });

      test('should include timestamp', () => {
        const result = handleInferenceFailure(modelId, new Error('Test'));

        expect(result.timestamp).toBeDefined();
        expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
      });
    });
  });

  // ==========================================================================
  // WRAPPED INFERENCE
  // ==========================================================================

  describe('Wrapped Inference', () => {
    const modelId = 'wrap_test';

    beforeEach(() => {
      resetCircuitBreaker(modelId);
    });

    describe('wrapInference', () => {
      test('should pass through successful inference', async () => {
        const inference = async (x) => ({ result: x * 2 });
        const wrapped = wrapInference(inference, modelId);

        const result = await wrapped(5);
        expect(result.result).toBe(10);
      });

      test('should handle thrown errors', async () => {
        const inference = async () => { throw new Error('Test error'); };
        const wrapped = wrapInference(inference, modelId);

        const result = await wrapped();
        expect(result.isFallback).toBe(true);
        expect(result._inferenceError).toBeDefined();
        expect(result._inferenceError.handled).toBe(true);
      });

      test('should handle timeout', async () => {
        const slowInference = async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return { result: 'done' };
        };
        const wrapped = wrapInference(slowInference, modelId, { timeout: 10 });

        const result = await wrapped();
        expect(result.isFallback).toBe(true);
        expect(result._inferenceError.type).toBe(FailureType.TIMEOUT);
      });

      test('should return fallback when circuit breaker active', async () => {
        tripCircuitBreaker(modelId, 'Test', 5);

        const inference = async () => ({ result: 'should not run' });
        const wrapped = wrapInference(inference, modelId);

        const result = await wrapped();
        expect(result.circuitBroken).toBe(true);
        expect(result.remainingMs).toBeGreaterThan(0);
      });

      test('should handle null output', async () => {
        const inference = async () => null;
        const wrapped = wrapInference(inference, modelId);

        const result = await wrapped();
        expect(result.isFallback).toBe(true);
      });

      test('should handle NaN output', async () => {
        const inference = async () => NaN;
        const wrapped = wrapInference(inference, modelId);

        const result = await wrapped();
        expect(result.isFallback).toBe(true);
      });

      test('should validate output with custom validator', async () => {
        const inference = async () => ({ score: -1 });
        const validateOutput = (result) => ({
          valid: result.score >= 0,
          error: 'Score must be non-negative'
        });
        const wrapped = wrapInference(inference, modelId, { validateOutput });

        const result = await wrapped();
        expect(result.isFallback).toBe(true);
      });

      test('should cache successful results when enabled', async () => {
        const inference = async () => ({ subgenre: 'drill', confidence: 0.9 });
        const wrapped = wrapInference(inference, modelId, { cacheSuccessful: true });

        await wrapped();

        const cached = getCachedResult(modelId);
        expect(cached.subgenre).toBe('drill');
      });

      test('should not cache when disabled', async () => {
        const freshModelId = 'no_cache_model';
        const inference = async () => ({ value: 42 });
        const wrapped = wrapInference(inference, freshModelId, { cacheSuccessful: false });

        await wrapped();

        expect(getCachedResult(freshModelId)).toBeNull();
      });

      test('should record success', async () => {
        const inference = async () => ({ result: 'ok' });
        const wrapped = wrapInference(inference, modelId);

        await wrapped();

        const stats = getFailureStats(modelId);
        expect(stats.lastSuccess).not.toBeNull();
      });
    });

    describe('createInferenceWrapper', () => {
      test('should create wrapper with preset options', async () => {
        const wrapper = createInferenceWrapper(modelId, { timeout: 5000 });
        const inference = async () => ({ result: 'ok' });
        const wrapped = wrapper(inference);

        const result = await wrapped();
        expect(result.result).toBe('ok');
      });
    });
  });

  // ==========================================================================
  // QUICK CHECK & ANALYSIS
  // ==========================================================================

  describe('Quick Check & Analysis', () => {
    const modelId = 'analysis_test';

    beforeEach(() => {
      resetCircuitBreaker(modelId);
    });

    describe('quickCheck', () => {
      test('should return healthy for new model', () => {
        const check = quickCheck(modelId);

        expect(check.healthy).toBe(true);
        expect(check.status).toBe('HEALTHY');
        expect(check.circuitBroken).toBe(false);
        expect(check.failuresInWindow).toBe(0);
      });

      test('should return degraded status with failures', () => {
        for (let i = 0; i < ESCALATION_THRESHOLDS.ALERT_AFTER; i++) {
          recordFailure(modelId, { type: FailureType.TIMEOUT });
        }

        const check = quickCheck(modelId);
        expect(check.healthy).toBe(false);
        expect(check.status).toBe('DEGRADED');
      });

      test('should return circuit broken status', () => {
        tripCircuitBreaker(modelId, 'Test', 5);

        const check = quickCheck(modelId);
        expect(check.healthy).toBe(false);
        expect(check.status).toBe('CIRCUIT_BROKEN');
        expect(check.circuitBroken).toBe(true);
      });

      test('should return recovering status', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });

        const check = quickCheck(modelId);
        expect(check.status).toBe('RECOVERING');
      });
    });

    describe('analyze', () => {
      test('should return complete analysis', () => {
        const analysis = analyze(modelId);

        expect(analysis.modelId).toBe(modelId);
        expect(analysis.timestamp).toBeDefined();
        expect(analysis.health).toBeDefined();
        expect(analysis.circuitBreaker).toBeDefined();
        expect(analysis.failures).toBeDefined();
        expect(analysis.cache).toBeDefined();
        expect(analysis.thresholds).toBeDefined();
        expect(analysis.recommendations).toBeInstanceOf(Array);
      });

      test('should include failure breakdown by type', () => {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
        recordFailure(modelId, { type: FailureType.EXCEPTION });

        const analysis = analyze(modelId);
        expect(analysis.failures.byType[FailureType.TIMEOUT]).toBe(1);
        expect(analysis.failures.byType[FailureType.EXCEPTION]).toBe(1);
      });

      test('should include cache availability', () => {
        cacheResult(modelId, { value: 42 });

        const analysis = analyze(modelId);
        expect(analysis.cache.available).toBe(true);
        expect(analysis.cache.cachedAt).toBeDefined();
      });

      test('should include recommendations for unhealthy models', () => {
        tripCircuitBreaker(modelId, 'Test', 5);

        const analysis = analyze(modelId);
        expect(analysis.recommendations.length).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    test('should handle rapid successive failures', () => {
      const modelId = 'rapid_test';

      for (let i = 0; i < 100; i++) {
        recordFailure(modelId, { type: FailureType.TIMEOUT });
      }

      const stats = getFailureStats(modelId);
      expect(stats.failuresInWindow).toBe(100);
    });

    test('should handle multiple models independently', () => {
      const model1 = 'model_1';
      const model2 = 'model_2';

      recordFailure(model1, { type: FailureType.TIMEOUT });
      tripCircuitBreaker(model2, 'Test', 5);

      expect(getFailureStats(model1).failuresInWindow).toBe(1);
      expect(checkCircuitBreaker(model1).broken).toBe(false);
      expect(checkCircuitBreaker(model2).broken).toBe(true);
    });

    test('should handle empty error message', () => {
      const type = classifyFailure(new Error(''));
      expect(type).toBe(FailureType.EXCEPTION);
    });

    test('should handle null in object output', () => {
      const type = classifyFailure(null, { value: null });
      // Should not classify as NULL_OUTPUT since it's inside object
      expect(type).not.toBe(FailureType.NAN_OUTPUT);
    });
  });

  // ==========================================================================
  // CONSTANTS VALIDATION
  // ==========================================================================

  describe('Constants Validation', () => {
    test('FailureType should have all expected values', () => {
      expect(Object.keys(FailureType).length).toBeGreaterThanOrEqual(10);
      expect(FailureType.TIMEOUT).toBeDefined();
      expect(FailureType.EXCEPTION).toBeDefined();
      expect(FailureType.NAN_OUTPUT).toBeDefined();
    });

    test('EscalationLevel should have all expected values', () => {
      expect(Object.keys(EscalationLevel).length).toBeGreaterThanOrEqual(5);
      expect(EscalationLevel.NONE).toBeDefined();
      expect(EscalationLevel.CRITICAL).toBeDefined();
    });

    test('FallbackStrategy should have all expected values', () => {
      expect(Object.keys(FallbackStrategy).length).toBeGreaterThanOrEqual(4);
      expect(FallbackStrategy.USE_DEFAULT).toBeDefined();
      expect(FallbackStrategy.REJECT).toBeDefined();
    });

    test('ESCALATION_THRESHOLDS should be reasonable', () => {
      expect(ESCALATION_THRESHOLDS.CIRCUIT_BREAK_AFTER).toBeGreaterThan(ESCALATION_THRESHOLDS.ALERT_AFTER);
      expect(ESCALATION_THRESHOLDS.ALERT_AFTER).toBeGreaterThanOrEqual(ESCALATION_THRESHOLDS.LOG_AFTER);
    });

    test('FALLBACK_DEFAULTS should have required keys', () => {
      expect(FALLBACK_DEFAULTS.subgenre_classification).toBeDefined();
      expect(FALLBACK_DEFAULTS.subgenre_classification.subgenre).toBe('hybrid');
      expect(FALLBACK_DEFAULTS.subgenre_classification.confidence).toBeLessThan(0.5);
    });
  });
});
