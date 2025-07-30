// src/services/llmService.ts

import axios from 'axios';
import { LLM_BASE_URL } from '../config';
import { log, error } from '../logger';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const client = axios.create({
  baseURL: LLM_BASE_URL,
  timeout: 30000,
});

// Helper to go { role, content } → [role, content]
function toTuplePayload(messages: ChatMessage[]) {
  return messages.map(({ role, content }) => [role, content] as [string, string]);
}

export async function askLlm(
  messages: ChatMessage[],
  userText?: string
): Promise<ChatMessage[]> {
  const payload: any = { messages: toTuplePayload(messages) };
  if (userText) payload.user_text = userText;

  try {
    log('→ POST /ai_interview/ask_llm', payload);
    const resp = await client.post<Array<[string,string]>>(
      '/ai_interview/ask_llm',
      payload
    );

    // turn it back into ChatMessage[]
    return resp.data.map(([role, content]) => ({ role: role as any, content }));
  } catch (err) {
    error('askLlm error', err);
    throw new Error('LLM service unavailable');
  }
}

export async function generateScorecard(
  conversation: ChatMessage[]
): Promise<Buffer> {
  try {
    log('→ POST /ai_interview/generate_scorecard');
    const resp = await client.post(
      '/ai_interview/generate_scorecard',
      { conversation: toTuplePayload(conversation) },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(resp.data);
  } catch (err) {
    error('generateScorecard error', err);
    throw new Error('Scoring service unavailable');
  }
}
