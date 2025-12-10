// src/routes/recordingRoutes.ts
import express from "express";
import multer from "multer";
import { BlobServiceClient } from "@azure/storage-blob";

const router = express.Router();

// Multer config: keep file in memory, we stream to Blob
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 500, // 500 MB safety limit
  },
});

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const containerName = process.env.AZURE_BLOB_CONTAINER || "interview-recordings";

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient(containerName);

// Ensure container exists on first use
(async () => {
  try {
    await containerClient.createIfNotExists();
    console.log(`[Blob] Container "${containerName}" ready.`);
  } catch (err) {
    console.error("[Blob] Error ensuring container:", err);
  }
})();

/**
 * POST /api/recordings/upload
 * Body: multipart/form-data
 *  - file: the webm file
 *  - uid: unique session / candidate / interview uid (required for folder)
 *  - (optional) candidateId, interviewId, recordedDuration, etc.
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const file = req.file; // buffer + mimetype + originalname
    const now = new Date();

    // ===== NEW: uid from frontend =====
    const uid = (req.body.uid || "").toString().trim();
    if (!uid) {
      return res.status(400).json({ message: "Missing required field: uid" });
    }

    // Optional metadata from frontend
    const candidateId = (req.body.candidateId || "anon").toString();
    const interviewId = (req.body.interviewId || "na").toString();

    // Timestamp for uniqueness
    const ts = now.toISOString().replace(/[:.]/g, "-"); // safe for blob name

    // --------- BLOB NAMING STRATEGY ----------
    // Container: interview-recordings
    // Blob path: {uid}/candidate-{candidateId}-interview-{interviewId}-{ts}.webm
    // Example: "abc123/candidate-raj@demo.com-interview-job123-2025-12-09T16-23-11-123Z.webm"
    const fileName = `candidate-${candidateId}-interview-${interviewId}-${ts}.webm`;
    const blobName = `${uid}/${fileName}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: {
        blobContentType: file.mimetype || "video/webm",
      },
      metadata: {
        uid,
        candidateId,
        interviewId,
        recordedDuration: (req.body.recordedDuration || "").toString(),
      },
    });

    const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const blobUrl = account
      ? `https://${account}.blob.core.windows.net/${containerName}/${blobName}`
      : blockBlobClient.url;

    return res.status(201).json({
      message: "Recording uploaded successfully",
      uid,          // for downstream correlation
      blobName,     // "{uid}/..."
      url: blobUrl, // direct link if container is public / SAS-enabled
    });
  } catch (err) {
    console.error("[Blob] Upload error:", err);
    return res.status(500).json({
      message: "Failed to upload recording",
      error: (err as Error).message,
    });
  }
});

export default router;




// // src/routes/recordingRoutes.ts
// import express from "express";
// import multer from "multer";
// import { BlobServiceClient } from "@azure/storage-blob";

// const router = express.Router();

// // Multer config: keep file in memory, we stream to Blob
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 1024 * 1024 * 500, // 500 MB safety limit
//   },
// });

// const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
// const containerName = process.env.AZURE_BLOB_CONTAINER || "interview-recordings";

// const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
// const containerClient = blobServiceClient.getContainerClient(containerName);

// // Ensure container exists on first use
// (async () => {
//   try {
//     await containerClient.createIfNotExists();
//     console.log(`[Blob] Container "${containerName}" ready.`);
//   } catch (err) {
//     console.error("[Blob] Error ensuring container:", err);
//   }
// })();

// /**
//  * POST /api/recordings/upload
//  * Body: multipart/form-data
//  *  - file: the webm file
//  *  - (optional) candidateId, interviewId, etc.
//  */
// router.post("/upload", upload.single("file"), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }

//     const file = req.file; // buffer + mimetype + originalname
//     const now = new Date();

//     // Date folder: YYYY-MM-DD
//     const dateFolder = now.toISOString().slice(0, 10); // e.g. "2025-12-03"

//     // Timestamp for uniqueness
//     const ts = now.toISOString().replace(/[:.]/g, "-"); // safe for blob name

//     // Optional metadata from frontend
//     const candidateId = (req.body.candidateId || "anon").toString();
//     const interviewId = (req.body.interviewId || "na").toString();

//     // Final blob name: e.g. "2025-12-03/candidate-anon-interview-na-2025-12-03T11-10-30-123Z.webm"
//     const blobName = `${dateFolder}/candidate-${candidateId}-interview-${interviewId}-${ts}.webm`;

//     const blockBlobClient = containerClient.getBlockBlobClient(blobName);

//     await blockBlobClient.uploadData(file.buffer, {
//       blobHTTPHeaders: {
//         blobContentType: file.mimetype || "video/webm",
//       },
//       metadata: {
//         candidateId,
//         interviewId,
//         recordedDuration: (req.body.recordedDuration || "").toString(),
//       },
//     });

//     // Build public-ish URL (depends on container access policy)
//     const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
//     const blobUrl = account
//       ? `https://${account}.blob.core.windows.net/${containerName}/${blobName}`
//       : blockBlobClient.url;

//     return res.status(201).json({
//       message: "Recording uploaded successfully",
//       blobName,
//       url: blobUrl,
//     });
//   } catch (err) {
//     console.error("[Blob] Upload error:", err);
//     return res.status(500).json({
//       message: "Failed to upload recording",
//       error: (err as Error).message,
//     });
//   }
// });

// export default router;
