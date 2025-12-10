// src/routes/chat.ts

import { Router } from 'express';
import fs from 'fs-extra';
import path from 'path';
import {
  askLlm,
  generateScorecard,
  ChatMessage
} from '../services/llmService';
import { log, error } from '../logger';

const router = Router();

/**
 * POST /api/chat
 * Body: { cv?: string; jd?: string; messages: ChatMessage[]; userText?: string }
 */
router.post('/', async (req, res) => {
  try {
    const {
      cv = '',
      jd = '',
      messages,
      userText
    } = req.body as {
      cv?: string;
      jd?: string;
      messages: ChatMessage[];
      userText?: string;
    };

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages format' });
    }

    // Inject the FULL system prompt on the very first turn
    if (messages.length === 0) {
      const systemPrompt = `
You are “Lisa,” an AI interviewer.

Inputs:
Resume: ${cv}
Job Description: ${jd}

Opening (say once):
“Hi, I’m Lisa—your AI interviewer; we’ll go one question at a time—please answer briefly, be specific, and speak clearly.”

Language & Multilingual Behavior:
- By default, conduct the interview in English.
- If the candidate explicitly asks you to switch to Hindi (e.g., “ask me in Hindi”, “let's switch to Hindi”) or starts consistently answering in Hindi, then from that point onwards you MUST:
  • Ask all questions in Hindi.
  • Respond only in natural, simple Hindi, using Devanagari script.
- Stay in Hindi mode until the candidate clearly asks to switch back to English.
- Always respond in the same language as your current question, unless the candidate explicitly asks you to translate or use another language.
- When the candidate complains about translation quality or language issues, reply in the language they requested (e.g., Hindi if they said “switch to Hindi”) and then continue the interview in that language.

Rules:
- Ask ONE short question at a time (1-2 sentence); wait for the answer.
- Don't ask compound questions. If a pair is common (e.g., strengths vs weaknesses), ask in separate turns.
- After each answer, ask ONE brief follow-up (≤1 sentence) if needed.
- Do NOT repeat questions or parrot the candidate’s wording.
- Use brief transitions every 2–3 questions (“Moving on…”, “Next up…”).
- Always end with a question, except during interruptions.

Interruption / Barge-in (strict):
- If the candidate starts speaking while you’re responding: cancel and output NOTHING.
- Wait silently; respond only to the NEXT finalized utterance.
- Treat “stop/hold on/wait” as control signals; stop and wait (no content reply).

**Instructions:**

1. **Question Flow** (10–12 total)
   a) **Generic** (1–2 Qs):
      • What are your strengths and weaknesses?
      • Can you describe a challenging situation you faced and how you handled it?
   b) **JD-Based** (4–5 Qs):
      • What experience do you have with [responsibility in JD]?
      • How would you approach [task/project mentioned]?
      • How proficient are you with [tool/technology listed]?
   c) **Resume-Based** (2–3 Qs):
      • Walk me through your career progression and how it prepared you for this role.
      • Tell me about a project where you applied [resume skill].

2. **Follow-ups**
   - After each answer, ask one relevant follow-up to dig deeper.

3. **Closure**
   - Thank the candidate: "Thank you for your time. We’ll be in touch with next steps via email."

4. **Timing**
   - Aim for 10–12 questions, around 10 minutes total.

**Tone & Style:**
- Professional yet approachable.
- Clear and concise.`.trim();

      messages.push({ role: 'system', content: systemPrompt });
    }

    // Call LLM service with full history
    const updated = await askLlm(messages, userText);
    log('✔ LLM replied');
    res.json(updated);

  } catch (err: any) {
    error('Chat route error', err);
    res.status(502).json({ error: err.message });
  }
});

/**
 * POST /api/chat/scorecard
 * Body: { conversation: ChatMessage[] }
 */
router.post('/scorecard', async (req, res) => {
  try {
    const { conversation } = req.body as { conversation: ChatMessage[] };
    if (!Array.isArray(conversation)) {
      return res.status(400).json({ error: 'Invalid conversation' });
    }

    const pdf = await generateScorecard(conversation);
    res
      .status(200)
      .header('Content-Type','application/pdf')
      .header('Content-Disposition','attachment; filename="Scorecard.pdf"')
      .send(pdf);

  } catch (err: any) {
    error('Scorecard route error', err);
    res.status(502).json({ error: err.message });
  }
});

/**
 * POST /api/chat/save
 * Body: { name: string; conversation: ChatMessage[] }
 *
 * Saves:
 *  - saved/<name>/transcript.txt
 *  - saved/<name>/Scorecard.pdf
 */
router.post('/save', async (req, res) => {
  try {
    const { name, conversation } = req.body as {
      name: string;
      conversation: ChatMessage[];
    };
    if (!name || !Array.isArray(conversation)) {
      return res.status(400).json({ error: 'Missing name or invalid conversation' });
    }

    // Ensure directory exists
    const outDir = path.join(__dirname, '../../saved', name);
    await fs.ensureDir(outDir);

    // Write transcript.txt
    const transcript = conversation
      .map(msg => {
        const who =
          msg.role === 'assistant' ? 'HR Bot' :
          msg.role === 'user' ? name :
          'System';
        return `${who}: ${msg.content}`;
      })
      .join('\n');
    await fs.writeFile(path.join(outDir, 'transcript.txt'), transcript);

    // Generate & write Scorecard.pdf
    const pdfBuffer = await generateScorecard(conversation);
    await fs.writeFile(path.join(outDir, 'Scorecard.pdf'), pdfBuffer);

    log(`✔ Saved transcript & scorecard for ${name}`);
    res.json({ success: true, path: outDir });

  } catch (err: any) {
    error('Save route error', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
