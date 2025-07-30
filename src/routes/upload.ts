import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR } from '../config';
import { extractTextFromPdf } from '../services/pdfService';
import { log, error } from '../logger';

const router = Router();
const upload = multer({ dest: UPLOAD_DIR });

router.post(
  '/',
  upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'jd', maxCount: 1 }]),
  async (req, res) => {
    try {
      const files = req.files as any;
      if (!files?.cv?.[0] || !files?.jd?.[0]) {
        return res.status(400).json({ error: 'Both CV and JD are required.' });
      }
      const [cvFile, jdFile] = [files.cv[0].filename, files.jd[0].filename];
      const [cvText, jdText] = await Promise.all([
        extractTextFromPdf(cvFile),
        extractTextFromPdf(jdFile),
      ]);
      log('✔ Extracted CV & JD text');
      res.json({ cvText, jdText });
    } catch (err) {
      error('Upload route error', err);
      res.status(500).json({ error: 'PDF processing failed' });
    } finally {
      const files = (req.files as any) || {};
      ['cv', 'jd'].forEach((key: string) => {
        const f = files[key]?.[0]?.filename;
        if (f) fs.unlink(path.join(UPLOAD_DIR, f), () => {});
      });
    }
  }
);

export default router;
