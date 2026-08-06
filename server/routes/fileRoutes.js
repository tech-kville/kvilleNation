const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const streamifier = require('streamifier');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Use a dedicated bucket name (creates collections: uploads.files + uploads.chunks)
function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB not connected yet.');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'uploads' });
}

async function findLatestByKind(kind) {
  const db = mongoose.connection.db;
  const files = await db
    .collection('uploads.files')
    .find({ 'metadata.kind': kind })
    .sort({ uploadDate: -1 })
    .limit(1)
    .toArray();
  return files[0] || null;
}

async function deleteAllByKind(kind) {
  const db = mongoose.connection.db;
  const bucket = getBucket();

  const files = await db.collection('uploads.files').find({ 'metadata.kind': kind }).toArray();
  // Delete each file (also removes its chunks)
  await Promise.all(files.map((f) => bucket.delete(f._id).catch(() => {})));
}

// Parses a "Range: bytes=start-end" header into { start, end } (both inclusive),
// clamped to the file size. Returns null if there's no usable range.
function parseRange(rangeHeader, fileSize) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || '');
  if (!match) return null;

  const [, startStr, endStr] = match;
  if (startStr === '' && endStr === '') return null;

  let start;
  let end;
  if (startStr === '') {
    // Suffix range, e.g. "bytes=-500" = last 500 bytes
    const suffixLength = parseInt(endStr, 10);
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === '' ? fileSize - 1 : parseInt(endStr, 10);
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) return null;
  return { start, end: Math.min(end, fileSize - 1) };
}

// Streams the latest file of `kind` to the response, honoring Range requests so a
// long PDF (or any large file) can be fetched in chunks instead of start-to-finish
// every time. Safe to cache aggressively because the URL is cache-busted with
// ?v=<uploadDate> whenever a new file is uploaded (see the META routes below).
async function streamLatestByKind(req, res, kind) {
  const latest = await findLatestByKind(kind);
  if (!latest) return res.status(404).send(`No ${kind} file`);

  const fileSize = latest.length;
  const bucket = getBucket();

  res.setHeader('Content-Type', latest.contentType || 'application/pdf');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `inline; filename="${kind}.pdf"`);

  const range = parseRange(req.headers.range, fileSize);
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fileSize}`);
    res.setHeader('Content-Length', range.end - range.start + 1);
    return bucket.openDownloadStream(latest._id, { start: range.start, end: range.end + 1 }).pipe(res);
  }

  res.setHeader('Content-Length', fileSize);
  return bucket.openDownloadStream(latest._id).pipe(res);
}

async function uploadNew(kind, file) {
  const bucket = getBucket();

  // Keep a stable name in Mongo (helpful for debugging)
  const filename = `${kind}.pdf`;

  // Upload stream into GridFS
  const uploadStream = bucket.openUploadStream(filename, {
    contentType: file.mimetype || 'application/pdf',
    metadata: {
      kind, // "policy" or "calendar"
      originalName: file.originalname,
    },
  });

  await new Promise((resolve, reject) => {
    streamifier
      .createReadStream(file.buffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', resolve);
  });

  return uploadStream.id;
}

// ------------------- POLICY META -------------------
router.get('/policy', async (_req, res) => {
  try {
    const latest = await findLatestByKind('policy');
    if (!latest) return res.json({ url: null, updatedAt: null });

    // Cache-bust using uploadDate timestamp
    const v = new Date(latest.uploadDate).getTime();

    return res.json({
      url: `/api/files/policy/download?v=${v}`,
      updatedAt: latest.uploadDate,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to fetch policy metadata' });
  }
});

// ------------------- POLICY DOWNLOAD -------------------
router.get('/policy/download', async (req, res) => {
  try {
    await streamLatestByKind(req, res, 'policy');
  } catch (e) {
    if (!res.headersSent) res.status(500).send(e.message || 'Failed to download policy');
  }
});

// ------------------- POLICY UPLOAD -------------------
router.post('/policy', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Replace the current policy
    await deleteAllByKind('policy');
    await uploadNew('policy', req.file);

    return res.json({ ok: true, message: 'Policy uploaded' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
});

// ------------------- CALENDAR META -------------------
router.get('/calendar', async (_req, res) => {
  try {
    const latest = await findLatestByKind('calendar');
    if (!latest) return res.json({ url: null, updatedAt: null });

    const v = new Date(latest.uploadDate).getTime();

    return res.json({
      url: `/api/files/calendar/download?v=${v}`,
      updatedAt: latest.uploadDate,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to fetch calendar metadata' });
  }
});

// ------------------- CALENDAR DOWNLOAD -------------------
router.get('/calendar/download', async (req, res) => {
  try {
    await streamLatestByKind(req, res, 'calendar');
  } catch (e) {
    if (!res.headersSent) res.status(500).send(e.message || 'Failed to download calendar');
  }
});

// ------------------- CALENDAR UPLOAD -------------------
router.post('/calendar', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    await deleteAllByKind('calendar');
    await uploadNew('calendar', req.file);

    return res.json({ ok: true, message: 'Calendar uploaded' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Upload failed' });
  }
});

module.exports = router;