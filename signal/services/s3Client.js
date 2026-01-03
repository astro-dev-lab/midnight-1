const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const S3_ENDPOINT = process.env.S3_ENDPOINT || undefined;
const S3_REGION = process.env.S3_REGION || undefined;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_FORCE_PATH_STYLE = (process.env.S3_FORCE_PATH_STYLE || 'false') === 'true';

if (!S3_BUCKET) {
  // allow runtime usage for local dev; in production the app should provide this
  console.warn('[s3Client] S3_BUCKET not configured; S3 operations will fail until configured');
}

const clientConfig = {
  region: S3_REGION || 'us-east-1',
  forcePathStyle: S3_FORCE_PATH_STYLE
};

if (S3_ENDPOINT) clientConfig.endpoint = S3_ENDPOINT;
if (S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY
  };
}

const s3 = new S3Client(clientConfig);

async function uploadBuffer(key, buffer, options = {}) {
  if (!S3_BUCKET) throw new Error('S3_BUCKET not configured');
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: options.ContentType || 'application/octet-stream'
  };
  const cmd = new PutObjectCommand(params);
  await s3.send(cmd);
  return { Bucket: S3_BUCKET, Key: key };
}

/**
 * Stream upload using multipart (lib-storage Upload helper).
 * Accepts a Node.js readable stream and streams parts to S3 to avoid buffering large files.
 * options: { ContentType?, queueSize?, partSize? }
 */
async function uploadStream(key, readableStream, options = {}) {
  if (!S3_BUCKET) throw new Error('S3_BUCKET not configured');
  const params = {
    Bucket: S3_BUCKET,
    Key: key,
    Body: readableStream,
    ContentType: options.ContentType || 'application/octet-stream'
  };

  const upload = new Upload({
    client: s3,
    params,
    queueSize: Number(process.env.S3_UPLOAD_QUEUE_SIZE || options.queueSize || 4),
    partSize: Number(process.env.S3_PART_SIZE || options.partSize || 5 * 1024 * 1024)
  });

  await upload.done();
  return { Bucket: S3_BUCKET, Key: key };
}

async function getObjectStream(key) {
  if (!S3_BUCKET) throw new Error('S3_BUCKET not configured');
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const res = await s3.send(cmd);
  // res.Body is a stream in Node.js
  return res.Body;
}

async function headObjectExists(key) {
  if (!S3_BUCKET) throw new Error('S3_BUCKET not configured');
  try {
    const cmd = new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const res = await s3.send(cmd);
    return { exists: true, contentLength: res.ContentLength, lastModified: res.LastModified };
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return { exists: false };
    throw err;
  }
}

async function deleteObject(key) {
  if (!S3_BUCKET) throw new Error('S3_BUCKET not configured');
  const cmd = new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key });
  await s3.send(cmd);
}

async function generatePresignedUrlForGet(key, expiresIn = 3600) {
  if (!S3_BUCKET) throw new Error('S3_BUCKET not configured');
  const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return url;
}

module.exports = {
  uploadBuffer,
  getObjectStream,
  headObjectExists,
  deleteObject,
  generatePresignedUrlForGet,
  // streaming upload
  uploadStream,
  // export raw client for testing/mocking
  _s3: s3
};
