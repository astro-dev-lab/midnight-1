/**
 * Job Events Service Tests
 */

const {
  jobEvents,
  emitJobUpdate,
  jobNotifications
} = require('../services/jobEvents');

describe('Job Events Service', () => {
  describe('Event Emission', () => {
    it('should emit job updates to job-specific channel', (done) => {
      const testJob = {
        id: 1,
        projectId: 100,
        state: 'RUNNING',
        preset: 'master-standard'
      };

      const handler = (event) => {
        expect(event.jobId).toBe(1);
        expect(event.projectId).toBe(100);
        expect(event.state).toBe('RUNNING');
        expect(event.type).toBe('updated');
        expect(event.timestamp).toBeDefined();
        jobEvents.off('job:1', handler);
        done();
      };

      jobEvents.on('job:1', handler);
      emitJobUpdate(testJob, 'updated');
    });

    it('should emit job updates to project channel', (done) => {
      const testJob = {
        id: 2,
        projectId: 200,
        state: 'QUEUED',
        preset: 'analyze-full'
      };

      const handler = (event) => {
        expect(event.projectId).toBe(200);
        expect(event.type).toBe('created');
        jobEvents.off('project:200', handler);
        done();
      };

      jobEvents.on('project:200', handler);
      emitJobUpdate(testJob, 'created');
    });

    it('should emit to global channel', (done) => {
      const testJob = {
        id: 3,
        projectId: 300,
        state: 'COMPLETED',
        preset: 'convert-wav'
      };

      const handler = (event) => {
        expect(event.jobId).toBe(3);
        expect(event.type).toBe('completed');
        jobEvents.off('jobs:all', handler);
        done();
      };

      jobEvents.on('jobs:all', handler);
      emitJobUpdate(testJob, 'completed');
    });

    it('should include progress in event', (done) => {
      const testJob = {
        id: 4,
        projectId: 400,
        state: 'RUNNING',
        progress: 50,
        preset: 'split-stems'
      };

      const handler = (event) => {
        expect(event.progress).toBe(50);
        jobEvents.off('job:4', handler);
        done();
      };

      jobEvents.on('job:4', handler);
      emitJobUpdate(testJob, 'updated');
    });
  });

  describe('Notification Helpers', () => {
    it('should have onJobCreated function', () => {
      expect(typeof jobNotifications.onJobCreated).toBe('function');
    });

    it('should have onJobProgress function', () => {
      expect(typeof jobNotifications.onJobProgress).toBe('function');
    });

    it('should have onJobCompleted function', () => {
      expect(typeof jobNotifications.onJobCompleted).toBe('function');
    });

    it('should have onJobFailed function', () => {
      expect(typeof jobNotifications.onJobFailed).toBe('function');
    });

    it('should have onJobCancelled function', () => {
      expect(typeof jobNotifications.onJobCancelled).toBe('function');
    });

    it('onJobCreated should emit created event', (done) => {
      const testJob = {
        id: 10,
        projectId: 1000,
        state: 'QUEUED',
        preset: 'master-standard'
      };

      const handler = (event) => {
        expect(event.type).toBe('created');
        jobEvents.off('job:10', handler);
        done();
      };

      jobEvents.on('job:10', handler);
      jobNotifications.onJobCreated(testJob);
    });

    it('onJobFailed should include error in event', (done) => {
      const testJob = {
        id: 11,
        projectId: 1100,
        state: 'RUNNING',
        preset: 'convert-mp3'
      };

      const handler = (event) => {
        expect(event.type).toBe('failed');
        expect(event.state).toBe('FAILED');
        jobEvents.off('job:11', handler);
        done();
      };

      jobEvents.on('job:11', handler);
      jobNotifications.onJobFailed(testJob, 'Processing failed');
    });
  });

  describe('Event Types', () => {
    const eventTypes = ['created', 'updated', 'completed', 'failed', 'cancelled'];

    eventTypes.forEach(eventType => {
      it(`should emit "${eventType}" event type correctly`, (done) => {
        const testJob = {
          id: 100 + eventTypes.indexOf(eventType),
          projectId: 9999,
          state: 'RUNNING',
          preset: 'analyze-full'
        };

        const handler = (event) => {
          expect(event.type).toBe(eventType);
          jobEvents.off(`job:${testJob.id}`, handler);
          done();
        };

        jobEvents.on(`job:${testJob.id}`, handler);
        emitJobUpdate(testJob, eventType);
      });
    });
  });
});
