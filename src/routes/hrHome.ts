// src/routes/hrHome.ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { db } from '../db';
import { log, error } from '../logger';

const router = Router();

// Memory storage for PDF buffers
const storage = multer.memoryStorage();
const upload = multer({ storage }).fields([
  { name: 'jdPdf', maxCount: 1 },
  { name: 'cvPdf', maxCount: 1 },
]);

// POST /api/hr/upload-jd-cv
router.post(
  '/upload-jd-cv',
  upload,
  (req: Request, res: Response) => {
    const { UID, Email } = req.body;
    const jdFile = (req.files as any)?.jdPdf?.[0];
    const cvFile = (req.files as any)?.cvPdf?.[0];

    if (!UID || !Email || !jdFile?.buffer || !cvFile?.buffer) {
      return res
        .status(400)
        .json({ error: 'Missing UID, Email, JD PDF, or CV PDF.' });
    }

    // YYYY-MM-DD HH:MM:SS
    const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const status = 0;
    const active = 0;

    const sql = `
      INSERT INTO hr_home (UID, Email, time, JD, CV, status, Active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      UID,
      Email,
      time,
      jdFile.buffer,
      cvFile.buffer,
      status,
      active,
    ];

    db.run(sql, params, function (err) {
      if (err) {
        error('DB insert error:', err.message);
        return res
          .status(500)
          .json({ error: 'Failed to store JD/CV in database.' });
      }
      log(`Inserted hr_home row for UID=${UID}`);
      res.json({ message: 'Upload successful', UID });
    });
  }
);

// POST /api/hr/get-status-active
router.post(
  '/get-status-active',
  async (req: Request, res: Response) => {
    const { UID } = req.body;
    if (!UID) {
      return res.status(400).json({ error: 'UID is required.' });
    }

    const sql = `SELECT status, Active, JD, CV FROM hr_home WHERE UID = ?`;
    db.get(sql, [UID], async (err, row: any) => {
      if (err) {
        error('DB query error:', err.message);
        return res.status(500).json({ error: 'Database query failed.' });
      }
      if (!row) {
        return res.status(404).json({ error: 'UID not found.' });
      }

      const { status, Active, JD, CV } = row;
      if (Active === 1 || status === 1) {
        return res.json({ status, active: Active });
      }

      // both flags are zero → parse PDFs
      try {
        const jdText = (await pdfParse(JD)).text;
        const cvText = (await pdfParse(CV)).text;
        res.json({ status, active: Active, jdText, cvText });
      } catch (parseErr: any) {
        error('PDF parse error:', parseErr.message);
        res.status(500).json({ error: 'Failed to extract text.' });
        return res.json({ status, active: Active });

      }
    });
  }
);

export default router;