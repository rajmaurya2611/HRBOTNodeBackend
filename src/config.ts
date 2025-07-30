// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const PORT = +(process.env.PORT || 5008);
export const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// default back to localhost:8791 if LLM_BASE_URL isn’t set
export const LLM_BASE_URL = process.env.LLM_BASE_URL?.trim() || 'http://127.0.0.1:8791';
