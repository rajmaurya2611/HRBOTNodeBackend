// src/services/llmService.ts
 
import axios, { AxiosError } from 'axios';
import { LLM_BASE_URL } from '../config';
import { log, error } from '../logger';
 
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
 
/**
 * -------------------------------
 *  PYTHON SCORING SERVICE CLIENT
 *  (unchanged – still used only for scorecard PDF)
 * -------------------------------
 */
const pythonClient = axios.create({
  baseURL: LLM_BASE_URL,
  timeout: 60000,
  proxy: false,
});
 
// Helper to go { role, content } → [role, content]
function toTuplePayload(messages: ChatMessage[]) {
  return messages.map(({ role, content }) => [role, content] as [string, string]);
}
 
/**
 * -------------------------------
 *  AZURE OPENAI CHAT CONFIG
 * -------------------------------
 */
 
const {
  AZURE_OPENAI_API_KEY,
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_API_VERSION,
  // embeddings envs kept for future usage
  AZURE_OPENAI_EMBEDDING_KEY,
  AZURE_OPENAI_EMBEDDING_ENDPOINT,
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  AZURE_OPENAI_EMBEDDING_VERSION,
  model_name,
} = process.env;
 
const CHAT_URL =
  AZURE_OPENAI_ENDPOINT &&
  AZURE_OPENAI_DEPLOYMENT &&
  AZURE_OPENAI_API_VERSION
    ? `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`
    : '';
 
/**
 * Map our ChatMessage[] → Azure chat messages.
 * (We keep roles as-is, no trimming, no dedupe – you rely on duplicates for barge-in.)
 */
function toAzureMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}
 
/**
 * Safely extract text from Azure `choices[0].message`,
 * handling both classic `string` and new `content: [{ type: 'output_text', text: '...' }]` shapes.
 */
function extractAssistantContent(choice: any): string {
  if (!choice || !choice.message) return '';
 
  const msg = choice.message;
 
  // Classic: content is a plain string
  if (typeof msg.content === 'string') {
    return msg.content;
  }
 
  // Responses-style: content is an array of parts
  if (Array.isArray(msg.content)) {
    const pieces = msg.content
      .map((part: any) => {
        if (!part) return '';
 
        // String directly
        if (typeof part === 'string') return part;
 
        // { type: 'output_text', text: '...' }
        if (typeof part.text === 'string') return part.text;
 
        // { type: 'output_text', text: { content: '...' } }
        if (part.text && typeof part.text.content === 'string') {
          return part.text.content;
        }
 
        // { type: 'text', text: '...' }
        if (part.type === 'text' && typeof part.text === 'string') {
          return part.text;
        }
 
        return '';
      })
      .filter(Boolean);
 
    return pieces.join('');
  }
 
  return '';
}
 
/**
 * Core Azure call – parameterized for gpt-5-mini constraints.
 */
// async function callAzureChat(
//   messages: ChatMessage[],
//   userText?: string
// ): Promise<string> {
//   if (!CHAT_URL || !AZURE_OPENAI_API_KEY) {
//     throw new Error('Azure OpenAI config is missing');
//   }
 
//   const azureMessages = toAzureMessages(messages);
//   const model = model_name || 'gpt-5-mini';
 
//   const body: any = {
//     messages: azureMessages,
//     // gpt-5-mini specific: use max_completion_tokens, NOT max_tokens; do NOT send top_p.
//     // max_completion_tokens: 2048, // give room for reasoning + actual answer
//     max_completion_tokens: 500,
//     temperature: 0.5,
//     // model is technically ignored for Azure deployment-based URL,
//     // but we log it for observability.
//     model,
//   };
 
//   if (userText) {
//     // standard "user" metadata field; safe to send
//     body.user = userText.slice(0, 64); // keep it short
//   }
 
//   log('🛡️ → Azure ChatCompletions', {
//     url: CHAT_URL,
//     messagesCount: azureMessages.length,
//     model_name: model,
//   });
 
//   try {
//     const resp = await axios.post(CHAT_URL, body, {
//       headers: {
//         'Content-Type': 'application/json',
//         'api-key': AZURE_OPENAI_API_KEY,
//       },
//       timeout: 30000,
//       proxy: false,
//     });
 
//     const data = resp.data;
//     const choice = data?.choices?.[0];
 
//     const content = extractAssistantContent(choice);
 
//     if (!content) {
//       // This is exactly the case you logged: finish_reason "length" and 512 reasoning tokens, but no surface text.
//       log('❌ askLlm: no message content in Azure response', data);
//       throw new Error('Azure OpenAI returned no content');
//     }
 
//     return content;
//   } catch (err) {
//     const axErr = err as AxiosError<any>;
//     const status = axErr.response?.status;
//     const data = axErr.response?.data;
 
//     error('askLlm Azure error', {
//       status,
//       data,
//       message: axErr.message,
//     });
 
//     if (status) {
//       throw new Error(`Azure OpenAI error (${status})`);
//     }
//     throw new Error('Azure OpenAI error (unknown)');
//   }
// }
 
 
// src/services/llmService.ts
 
async function callAzureChat(
  messages: ChatMessage[],
  userText?: string,
  options?: {
    maxCompletionTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  if (!CHAT_URL || !AZURE_OPENAI_API_KEY) {
    throw new Error('Azure OpenAI config is missing');
  }
 
  const azureMessages = toAzureMessages(messages);
  const model = model_name || 'gpt-5-mini';
 
  const body: any = {
    messages: azureMessages,
    max_completion_tokens: options?.maxCompletionTokens ?? 500, // default unchanged
    temperature: options?.temperature ?? 0.5,
    model,
  };
 
  if (userText) {
    body.user = userText.slice(0, 64);
  }
 
  log('🛡️ → Azure ChatCompletions', {
    url: CHAT_URL,
    messagesCount: azureMessages.length,
    model_name: model,
  });
 
  try {
    const resp = await axios.post(CHAT_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY,
      },
      timeout: 30000,
     // proxy: false,
    });
 
    const data = resp.data;
    const choice = data?.choices?.[0];
 
    const content = extractAssistantContent(choice);
 
    if (!content) {
      log('❌ askLlm: no message content in Azure response', data);
      throw new Error('Azure OpenAI returned no content');
    }
 
    return content;
  } catch (err) {
    const axErr = err as AxiosError<any>;
    const status = axErr.response?.status;
    const data = axErr.response?.data;
 
    error('askLlm Azure error', {
      status,
      data,
      message: axErr.message,
    });
 
    if (status) {
      throw new Error(`Azure OpenAI error (${status})`);
    }
    throw new Error('Azure OpenAI error (unknown)');
  }
}
 
 
export interface CvJdSummary {
  cvSummary: string;
  jdSummary: string;
}
 
/**
 * One-time summarisation of CV + JD for the interview.
 * We keep it short and structured so the system prompt can be small and stable.
 */
export async function summariseCvAndJd(
  cv: string,
  jd: string
): Promise<CvJdSummary> {
  // If either is empty, still pass N/A so the model stays robust
  const safeCv = cv || 'N/A';
  const safeJd = jd || 'N/A';
 
  const system: ChatMessage = {
    role: 'system',
    content:
      'You summarise resumes and job descriptions for an AI interviewer. ' +
      'Return compact summaries that highlight only the most important points.',
  };
 
  const user: ChatMessage = {
    role: 'user',
    content: `
Summarise the following resume and job description for use in a technical AI/ML interview.
 
Resume:
${safeCv}
 
Job Description:
${safeJd}
 
Return a JSON object with exactly these fields:
- "cv_summary": a short paragraph (max 120 words) summarising the candidate's background, experience, and core skills.
- "jd_summary": a short paragraph (max 120 words) summarising the role, key responsibilities, and required skills.
 
Do not include any other fields. Do not include markdown.
`.trim(),
  };
 
  const raw = await callAzureChat([system, user], undefined, {
    maxCompletionTokens: 256,
    temperature: 0.3,
  });
 
  // Try to parse JSON; if it fails, fall back to simple string use.
  try {
    const parsed = JSON.parse(raw);
    const cvSummary = String(parsed.cv_summary || '').trim();
    const jdSummary = String(parsed.jd_summary || '').trim();
 
    if (!cvSummary || !jdSummary) {
      throw new Error('Missing cv_summary or jd_summary');
    }
 
    return { cvSummary, jdSummary };
  } catch (e) {
    // Fallback: treat entire response as a single blob,
    // put the same text in both fields so the system prompt still works.
    error('summariseCvAndJd JSON parse failed, using fallback', {
      raw,
      err: (e as Error).message,
    });
 
    const trimmed = raw.trim();
    return {
      cvSummary: trimmed,
      jdSummary: trimmed,
    };
  }
}
 
 
 
 
/**
 * -------------------------------
 *  PUBLIC: askLlm
 *  – uses Azure OpenAI directly
 *  – returns full updated history (for your frontend)
 * -------------------------------
 */
export async function askLlm(
  messages: ChatMessage[],
  userText?: string
): Promise<ChatMessage[]> {
  log('[chat] Incoming', {
    count: messages.length,
    hasUserText: !!userText,
  });
 
  // No dedupe, no trimming – preserve the entire dialog,
  // including duplicate turns required for barge-in / regeneration flows.
  const assistantReply = await callAzureChat(messages, userText);
 
  const updatedHistory: ChatMessage[] = [
    ...messages,
    {
      role: 'assistant',
      content: assistantReply,
    },
  ];
 
  return updatedHistory;
}
 
/**
 * -------------------------------
 *  PUBLIC: generateScorecard
 *  – still delegated to Python service (PDF via reportlab etc.)
 * -------------------------------
 */
export async function generateScorecard(
  conversation: ChatMessage[]
): Promise<Buffer> {
  try {
    log('→ POST /ai_interview/generate_scorecard');
    const resp = await pythonClient.post(
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
