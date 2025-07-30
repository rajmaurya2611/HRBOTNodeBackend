import dotenv from 'dotenv';
dotenv.config();

export const PORT         = +(process.env.PORT  || 4000);
export const UPLOAD_DIR   = process.env.UPLOAD_DIR || 'uploads';
export const LLM_BASE_URL = process.env.LLM_BASE_URL;  // Flask service