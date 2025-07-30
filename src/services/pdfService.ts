import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { UPLOAD_DIR } from '../config';
import { error } from '../logger';

export async function extractTextFromPdf(filename: string): Promise<string> {
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    const buffer = await fs.readFile(filePath);
    const { text } = await pdfParse(buffer);
    return text;
  } catch (err) {
    error('PDF parse failed for', filename, err);
    throw new Error('PDF text extraction failed');
  }
}
