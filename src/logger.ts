// src/logger.ts
export const log   = (...args: unknown[]) => console.log('[🛡️]', ...args);
export const error = (...args: unknown[]) => console.error('[❌]', ...args);
