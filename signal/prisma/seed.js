const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('password123', 10);

  // ==========================================================================
  // USERS
  // ==========================================================================
  
  // Internal users (Dashboard One)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@studioos.test' },
    update: {},
    create: {
      email: 'admin@studioos.test',
      passwordHash,
      internalRole: 'ADVANCED'
    },
  });

  const producer = await prisma.user.upsert({
    where: { email: 'producer@studioos.test' },
    update: {},
    create: {
      email: 'producer@studioos.test',
      passwordHash,
      internalRole: 'STANDARD'
    },
  });

  const basic = await prisma.user.upsert({
    where: { email: 'basic@studioos.test' },
    update: {},
    create: {
      email: 'basic@studioos.test',
      passwordHash,
      internalRole: 'BASIC'
    },
  });

  // External users (Dashboard Two - Client Portal)
  const approver = await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: {
      email: 'client@example.com',
      passwordHash,
      externalRole: 'APPROVER'
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: 'viewer@example.com' },
    update: {},
    create: {
      email: 'viewer@example.com',
      passwordHash,
      externalRole: 'VIEWER'
    },
  });

  console.log('✓ Seeded users');

  // ==========================================================================
  // PROJECTS
  // ==========================================================================
  
  // Project 1: Album in progress (PROCESSING)
  const albumProject = await prisma.project.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Summer Vibes EP',
      state: 'PROCESSING',
      ownerId: admin.id,
    },
  });

  // Project 2: Single ready for review (READY)
  const singleProject = await prisma.project.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Midnight Dreams - Single',
      state: 'READY',
      ownerId: producer.id,
    },
  });

  // Project 3: Delivered project (DELIVERED)
  const deliveredProject = await prisma.project.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'Acoustic Sessions Vol. 1',
      state: 'DELIVERED',
      ownerId: admin.id,
    },
  });

  // Project 4: New draft project (DRAFT)
  const draftProject = await prisma.project.upsert({
    where: { id: 4 },
    update: {},
    create: {
      name: 'Untitled Project',
      state: 'DRAFT',
      ownerId: basic.id,
    },
  });

  console.log('✓ Seeded projects');

  // ==========================================================================
  // ASSETS - Raw, Derived, and Final
  // ==========================================================================
  
  // Project 1 assets (Album in progress)
  const track1Raw = await prisma.asset.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Track 01 - Sunrise.wav',
      category: 'RAW',
      fileKey: 'uploads/project-1/track01-sunrise.wav',
      mimeType: 'audio/wav',
      sizeBytes: BigInt(52428800), // 50MB
      metadata: { duration: 245, sampleRate: 48000, bitDepth: 24, channels: 2 },
      projectId: albumProject.id,
    },
  });

  const track1Derived = await prisma.asset.upsert({
    where: { id: 2 },
    update: {},
    create: {
      name: 'Track 01 - Sunrise (Mastered).wav',
      category: 'DERIVED',
      fileKey: 'outputs/project-1/track01-sunrise-mastered.wav',
      mimeType: 'audio/wav',
      sizeBytes: BigInt(52428800),
      metadata: { duration: 245, sampleRate: 48000, bitDepth: 24, channels: 2, lufs: -14 },
      parentId: track1Raw.id,
      projectId: albumProject.id,
    },
  });

  const track2Raw = await prisma.asset.upsert({
    where: { id: 3 },
    update: {},
    create: {
      name: 'Track 02 - Ocean Breeze.wav',
      category: 'RAW',
      fileKey: 'uploads/project-1/track02-ocean-breeze.wav',
      mimeType: 'audio/wav',
      sizeBytes: BigInt(41943040), // 40MB
      metadata: { duration: 198, sampleRate: 48000, bitDepth: 24, channels: 2 },
      projectId: albumProject.id,
    },
  });

  const track3Raw = await prisma.asset.upsert({
    where: { id: 4 },
    update: {},
    create: {
      name: 'Track 03 - Sunset Boulevard.wav',
      category: 'RAW',
      fileKey: 'uploads/project-1/track03-sunset-blvd.wav',
      mimeType: 'audio/wav',
      sizeBytes: BigInt(62914560), // 60MB
      metadata: { duration: 312, sampleRate: 48000, bitDepth: 24, channels: 2 },
      projectId: albumProject.id,
    },
  });

  // Project 2 assets (Single ready for review)
  const singleRaw = await prisma.asset.upsert({
    where: { id: 5 },
    update: {},
    create: {
      name: 'Midnight Dreams (Mix).wav',
      category: 'RAW',
      fileKey: 'uploads/project-2/midnight-dreams-mix.wav',
      mimeType: 'audio/wav',
      sizeBytes: BigInt(46137344), // 44MB
      metadata: { duration: 218, sampleRate: 44100, bitDepth: 24, channels: 2 },
      projectId: singleProject.id,
    },
  });

  const singleMastered = await prisma.asset.upsert({
    where: { id: 6 },
    update: {},
    create: {
      name: 'Midnight Dreams (Master).wav',
      category: 'DERIVED',
      fileKey: 'outputs/project-2/midnight-dreams-master.wav',
      mimeType: 'audio/wav',
      sizeBytes: BigInt(46137344),
      metadata: { duration: 218, sampleRate: 44100, bitDepth: 24, channels: 2, lufs: -14 },
      parentId: singleRaw.id,
      projectId: singleProject.id,
    },
  });

  const singleFinal = await prisma.asset.upsert({
    where: { id: 7 },
    update: {},
    create: {
      name: 'Midnight Dreams (Final).mp3',
      category: 'FINAL',
      fileKey: 'outputs/project-2/midnight-dreams-final.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: BigInt(5242880), // 5MB
      metadata: { duration: 218, sampleRate: 44100, bitRate: 320, channels: 2, lufs: -14 },
      parentId: singleMastered.id,
      projectId: singleProject.id,
    },
  });

  // Project 3 assets (Delivered)
  const acousticFinal = await prisma.asset.upsert({
    where: { id: 8 },
    update: {},
    create: {
      name: 'Acoustic Sessions Complete.zip',
      category: 'FINAL',
      fileKey: 'outputs/project-3/acoustic-sessions-complete.zip',
      mimeType: 'application/zip',
      sizeBytes: BigInt(157286400), // 150MB
      metadata: { trackCount: 8, format: 'WAV 24bit/48kHz', deliveredTo: 'Spotify, Apple Music' },
      projectId: deliveredProject.id,
    },
  });

  console.log('✓ Seeded assets');

  // ==========================================================================
  // JOBS - Various states with reports
  // ==========================================================================
  
  // Completed mastering job for Project 1
  const masteringJob = await prisma.job.upsert({
    where: { id: 1 },
    update: {},
    create: {
      state: 'COMPLETED',
      preset: 'master-standard',
      parameters: { targetLufs: -14, ceiling: -1, stereoWidth: 100 },
      createdById: admin.id,
      projectId: albumProject.id,
      startedAt: new Date(Date.now() - 3600000), // 1 hour ago
      completedAt: new Date(Date.now() - 3000000), // 50 min ago
    },
  });

  // Link job inputs and outputs
  await prisma.jobInput.upsert({
    where: { id: 1 },
    update: {},
    create: {
      jobId: masteringJob.id,
      assetId: track1Raw.id,
    },
  });

  // Update derived asset to reference the job
  await prisma.asset.update({
    where: { id: track1Derived.id },
    data: { outputJobId: masteringJob.id },
  });

  // Report for completed job
  await prisma.report.upsert({
    where: { jobId: masteringJob.id },
    update: {},
    create: {
      type: 'MASTERING',
      summary: 'Mastered Track 01 - Sunrise using master-standard preset. Target LUFS: -14, Ceiling: -1dB.',
      changesApplied: 'Applied multiband compression, limiting, stereo imaging, and loudness normalization.',
      rationale: 'Standard mastering preset selected to achieve streaming-ready loudness while preserving dynamics.',
      impactAssessment: 'Dynamic range reduced by 3dB. Loudness increased from -18 LUFS to -14 LUFS. Frequency balance preserved.',
      confidence: 'High',
      limitations: 'Minor limiting artifacts possible on transient peaks. Recommend A/B comparison with source.',
      jobId: masteringJob.id,
    },
  });

  // Running analysis job for Project 1
  const analysisJob = await prisma.job.upsert({
    where: { id: 2 },
    update: {},
    create: {
      state: 'RUNNING',
      preset: 'analyze-full',
      parameters: {},
      createdById: producer.id,
      projectId: albumProject.id,
      startedAt: new Date(Date.now() - 120000), // 2 min ago
    },
  });

  await prisma.jobInput.upsert({
    where: { id: 2 },
    update: {},
    create: {
      jobId: analysisJob.id,
      assetId: track2Raw.id,
    },
  });

  // Queued job for Project 1
  const queuedJob = await prisma.job.upsert({
    where: { id: 3 },
    update: {},
    create: {
      state: 'QUEUED',
      preset: 'master-streaming',
      parameters: { targetLufs: -14 },
      createdById: admin.id,
      projectId: albumProject.id,
    },
  });

  await prisma.jobInput.upsert({
    where: { id: 3 },
    update: {},
    create: {
      jobId: queuedJob.id,
      assetId: track3Raw.id,
    },
  });

  // Completed job for Project 2 (single)
  const singleMasterJob = await prisma.job.upsert({
    where: { id: 4 },
    update: {},
    create: {
      state: 'COMPLETED',
      preset: 'master-standard',
      parameters: { targetLufs: -14, ceiling: -1 },
      createdById: producer.id,
      projectId: singleProject.id,
      startedAt: new Date(Date.now() - 86400000), // 1 day ago
      completedAt: new Date(Date.now() - 85800000),
    },
  });

  await prisma.jobInput.upsert({
    where: { id: 4 },
    update: {},
    create: {
      jobId: singleMasterJob.id,
      assetId: singleRaw.id,
    },
  });

  await prisma.asset.update({
    where: { id: singleMastered.id },
    data: { outputJobId: singleMasterJob.id },
  });

  await prisma.report.upsert({
    where: { jobId: singleMasterJob.id },
    update: {},
    create: {
      type: 'MASTERING',
      summary: 'Mastered Midnight Dreams using master-standard preset.',
      changesApplied: 'Applied EQ, multiband compression, stereo enhancement, limiting, and loudness normalization to -14 LUFS.',
      rationale: 'Client requested streaming-ready master suitable for Spotify and Apple Music.',
      impactAssessment: 'Loudness increased to -14 LUFS integrated. Dynamic range preserved at 8 LU. True peak limited to -1dBTP.',
      confidence: 'High',
      jobId: singleMasterJob.id,
    },
  });

  // Conversion job for Project 2
  const conversionJob = await prisma.job.upsert({
    where: { id: 5 },
    update: {},
    create: {
      state: 'COMPLETED',
      preset: 'convert-mp3',
      parameters: { bitrate: 320, quality: 'high' },
      createdById: producer.id,
      projectId: singleProject.id,
      startedAt: new Date(Date.now() - 82800000),
      completedAt: new Date(Date.now() - 82700000),
    },
  });

  await prisma.jobInput.upsert({
    where: { id: 5 },
    update: {},
    create: {
      jobId: conversionJob.id,
      assetId: singleMastered.id,
    },
  });

  await prisma.asset.update({
    where: { id: singleFinal.id },
    data: { outputJobId: conversionJob.id },
  });

  await prisma.report.upsert({
    where: { jobId: conversionJob.id },
    update: {},
    create: {
      type: 'CONVERSION',
      summary: 'Converted mastered WAV to 320kbps MP3 for distribution.',
      changesApplied: 'Encoded to MP3 format using LAME encoder at 320kbps CBR.',
      rationale: 'MP3 format requested for broad platform compatibility.',
      impactAssessment: 'File size reduced from 44MB to 5MB. Perceptual quality preserved at 320kbps.',
      confidence: 'High',
      jobId: conversionJob.id,
    },
  });

  // Failed job example
  const failedJob = await prisma.job.upsert({
    where: { id: 6 },
    update: {},
    create: {
      state: 'FAILED',
      preset: 'split-stems',
      parameters: {},
      createdById: basic.id,
      projectId: draftProject.id,
      startedAt: new Date(Date.now() - 7200000),
      completedAt: new Date(Date.now() - 7100000),
      errorCategory: 'PROCESSING',
      errorMessage: 'Stem separation failed: Audio file too short (minimum 10 seconds required).',
    },
  });

  console.log('✓ Seeded jobs with reports');

  // ==========================================================================
  // DELIVERIES
  // ==========================================================================
  
  await prisma.delivery.upsert({
    where: { id: 1 },
    update: {},
    create: {
      destination: 'Spotify',
      status: 'completed',
      projectId: deliveredProject.id,
      completedAt: new Date(Date.now() - 604800000), // 1 week ago
    },
  });

  await prisma.delivery.upsert({
    where: { id: 2 },
    update: {},
    create: {
      destination: 'Apple Music',
      status: 'completed',
      projectId: deliveredProject.id,
      completedAt: new Date(Date.now() - 604800000),
    },
  });

  await prisma.delivery.upsert({
    where: { id: 3 },
    update: {},
    create: {
      destination: 'Download',
      status: 'pending',
      projectId: singleProject.id,
    },
  });

  console.log('✓ Seeded deliveries');

  // ==========================================================================
  // PROJECT ACCESS (for external users)
  // ==========================================================================
  
  await prisma.projectAccess.upsert({
    where: { projectId_userId: { projectId: singleProject.id, userId: approver.id } },
    update: {},
    create: {
      projectId: singleProject.id,
      userId: approver.id,
    },
  });

  await prisma.projectAccess.upsert({
    where: { projectId_userId: { projectId: singleProject.id, userId: viewer.id } },
    update: {},
    create: {
      projectId: singleProject.id,
      userId: viewer.id,
    },
  });

  await prisma.projectAccess.upsert({
    where: { projectId_userId: { projectId: deliveredProject.id, userId: approver.id } },
    update: {},
    create: {
      projectId: deliveredProject.id,
      userId: approver.id,
    },
  });

  console.log('✓ Seeded project access');

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  
  console.log('\n========================================');
  console.log('Seed completed successfully!');
  console.log('========================================\n');
  console.log('Test Users:');
  console.log('  Internal (Dashboard One):');
  console.log('    admin@studioos.test     (ADVANCED)');
  console.log('    producer@studioos.test  (STANDARD)');
  console.log('    basic@studioos.test     (BASIC)');
  console.log('  External (Dashboard Two):');
  console.log('    client@example.com      (APPROVER)');
  console.log('    viewer@example.com      (VIEWER)');
  console.log('  Password for all: password123\n');
  console.log('Projects:');
  console.log('  1. Summer Vibes EP        (PROCESSING) - 4 assets, 3 jobs');
  console.log('  2. Midnight Dreams        (READY)      - 3 assets, 2 jobs');
  console.log('  3. Acoustic Sessions      (DELIVERED)  - 1 asset, delivered');
  console.log('  4. Untitled Project       (DRAFT)      - 0 assets, 1 failed job');
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
