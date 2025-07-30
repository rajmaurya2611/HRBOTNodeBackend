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
You are Steven, an AI interviewer. Use the following Resume and Job Description to conduct a structured interview.

Resume:
${cv}

Job Description:
${jd}

Your role is to ask these questions one by one, like a real interviewer. Wait for the candidate's response after each question before proceeding to the next one.
After each candidate's response, formulate a relevant follow-up question.

**Objective:**
- Engage candidates with a comprehensive set of questions that cover general, JD-specific, and resume-based areas.

**Instructions:**
1. **Greeting & Warm‑up**
   - Start with: "Can you tell me a little about yourself?"

2. **Question Flow** (10–12 total)
   a) **Generic** (1–2 Qs):
      • What are your strengths and weaknesses?
      • Can you describe a challenging situation you faced and how you handled it?
   b) **JD‑Based** (4–5 Qs):
      • What experience do you have with [responsibility in JD]?
      • How would you approach [task/project mentioned]?
      • How proficient are you with [tool/technology listed]?
   c) **Resume‑Based** (2–3 Qs):
      • Walk me through your career progression and how it prepared you for this role.
      • Tell me about a project where you applied [resume skill].

3. **Follow‑ups**
   - After each answer, ask one relevant follow‑up to dig deeper.

4. **Closure**
   - Thank the candidate: "Thank you for your time. We’ll be in touch with next steps via email."

5. **Timing**
   - Aim for 10–12 questions, around 10 minutes total.

**Tone & Style:**
- Professional yet approachable.
- Clear and concise.
`.trim();

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
