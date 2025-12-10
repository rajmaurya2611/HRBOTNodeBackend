import { Router } from "express";
import {
  askLlm,
  generateScorecard,
  ChatMessage,
  summariseCvAndJd,
  CvJdSummary,
} from "../services/llmService";
import { log, error } from "../logger";
import { BlobServiceClient } from "@azure/storage-blob";

const sessionSummaries = new Map<string, CvJdSummary>();
const router = Router();

/**
 * Build the system prompt WITHOUT embedding your literal Q8/Q9/Q10/Q11 script.
 * It gives the model guidance, not text to read verbatim.
 */
function buildSystemPrompt(cvSummary: string, jdSummary: string): string {
  return `
You are “MAX,” an AI interviewer.

Context:
- Resume: ${cvSummary || "N/A"}
- Job Description: ${jdSummary || "N/A"}

Core objectives:
- Conduct a structured, time-boxed interview of ~10–12 questions (~10 minutes).
- Keep the interaction conversational, professional, and efficient.
- Ask ONE focused question at a time and wait for the candidate’s answer.
- Do NOT bundle multiple asks in a single question (avoid “and”, “including”, “as well as” type chains).
- Always move the conversation forward; do not repeat the same question unless the candidate explicitly asks.

Language & multilingual behaviour:
- Default language is English.
- If the candidate clearly asks to switch to Hindi, or consistently responds in Hindi, switch to Hindi.
- In Hindi mode, ask questions and respond only in simple, natural Hindi using Devanagari script.
- Stay in Hindi until the candidate explicitly asks to switch back to English.

Interview coverage (use your own wording; DO NOT read this list verbatim):
- Early: brief background, current role, and key projects relevant to the JD.
- Technical depth: system design, data/ML architecture, experimentation, and productionisation of ML/LLM systems.
- Incident / hallucination scenario:
  - How they triage and mitigate hallucinations or bad behaviour in production LLM features.
  - Immediate triage steps, short-term mitigations, long-term fixes.
  - How they communicate impact, status, and mitigation to stakeholders and users.
- Leadership:
  - How they structure and lead a squad (roles/skills).
  - How they hire for gaps and raise the bar on code quality, design reviews, and postmortems.
- Execution / 30–60–90:
  - A concrete 30/60/90-day plan aligned with this JD.
  - Expected artifacts, milestones, and at least one shipped increment as an example.
- Metrics:
  - Which KPIs to track in the first 6 months (business impact, model outcomes, delivery, quality/risk, stakeholder satisfaction).
  - How to measure cost-to-serve and adoption specifically.
- Closing:
  - Give the candidate a chance to add anything about their fit.
  - Invite clarifying questions about the role or process.
  - Close the interview politely.

Style guidelines:
- Sound like a friendly, emotionally aware senior interviewer, not a chatbot.
- Be warm, encouraging, and naturally expressive, but stay factual and avoid making things up about the candidate or the company.
- Use short, clear questions.
- HARD RULE: Each reply must be at most 1–2 short sentences, and no more than 40 words in total.
- The actual question must be a single concise sentence (ideally under 20 words).
- Do NOT add long explanations, multi-sentence summaries, or paragraphs.
- Acknowledge answers with very brief phrases (e.g., “Got it.” / “Makes sense.” / “That’s helpful, thank you.”) and then ask the next question.
- Do NOT copy or reuse phrases from this instruction such as “Thanks — helpful / noted / clear”.
- Do NOT output numbered prompt text or phrases like “8)” / “9)” / “10)” / “11)” from this instruction.

Interruption handling:
- If the candidate says they need a moment (e.g., “one sec”, “wait”, “hold on”, “sorry, got interrupted”), briefly acknowledge and pause content:
  - Example: “No problem at all, take your time.”
- When they resume and refer back to the previous topic, gently reconnect:
  - Example: “Of course. You were talking about your last project — please continue from there.”
- Do NOT introduce new topics during an interruption; only resume once they are ready.

Opening behaviour:
- In your very first message, briefly introduce yourself and the structure of the interview in ONE short sentence
  (for example: who you are, that you’ll cover background, technical topics, and ways of working).
- In the same message, immediately ask the first question, focused on their background and fit for this role, as one short sentence.
- The entire opening message must be no more than 2 short sentences and 40 words total.
`;
}

/**
 * POST /api/chat
 * Body: { cv?: string; jd?: string; messages: ChatMessage[]; userText?: string; sessionId?: string }
 */
router.post("/", async (req, res) => {
  try {
    const {
      cv = "",
      jd = "",
      messages,
      userText,
      sessionId,
    } = req.body as {
      cv?: string;
      jd?: string;
      messages: ChatMessage[];
      userText?: string;
      sessionId?: string;
    };

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages format" });
    }

    log("[🛡️] [chat] Incoming", {
      count: messages.length,
      hasUserText: !!userText,
      sessionId: sessionId || null,
    });

    let convo: ChatMessage[];

    // First turn: generate or reuse CV/JD summaries and build system prompt
    if (messages.length === 0) {
      let summaries: CvJdSummary | undefined;

      if (sessionId) {
        summaries = sessionSummaries.get(sessionId);
      }

      if (!summaries) {
        log("[chat] Generating CV/JD summaries", {
          sessionId: sessionId || null,
        });
        summaries = await summariseCvAndJd(cv, jd);
        if (sessionId) {
          sessionSummaries.set(sessionId, summaries);
        }
      }

      const systemPrompt = buildSystemPrompt(
        summaries.cvSummary,
        summaries.jdSummary
      );

      convo = [
        {
          role: "system",
          content: systemPrompt,
        },
      ];
    } else {
      // Subsequent turns: trust full history from frontend
      convo = messages;
    }

    const updatedHistory = await askLlm(convo, userText);

    return res.json(updatedHistory);
  } catch (err: any) {
    error("[❌] [chat] Chat route error", err);
    const status = err?.status || 502;
    return res.status(status).json({ error: "LLM chat failure" });
  }
});

/**
 * POST /api/chat/scorecard
 * Body: { conversation: ChatMessage[] }
 * Returns: PDF buffer
 */
router.post("/scorecard", async (req, res) => {
  try {
    const { conversation } = req.body as { conversation: ChatMessage[] };

    if (!Array.isArray(conversation) || conversation.length === 0) {
      return res.status(400).json({ error: "Conversation is required" });
    }

    const pdfBuffer = await generateScorecard(conversation);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="scorecard.pdf"'
    );

    return res.send(pdfBuffer);
  } catch (err) {
    error("[❌] [chat] Scorecard route error", err);
    return res.status(500).json({ error: "Failed to generate scorecard" });
  }
});

/**
 * Azure Blob setup for saving transcript + scorecard
 * Container: saved-conversations (or AZURE_BLOB_CONTAINER_TXT from env)
 * Layout:
 *   saved-conversations/<uid>/transcript.txt
 *   saved-conversations/<uid>/Scorecard.pdf
 */

const AZURE_STORAGE_CONNECTION_STRING =
  process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_BLOB_CONTAINER_TXT =
  process.env.AZURE_BLOB_CONTAINER_TXT || "saved-conversations";

if (!AZURE_STORAGE_CONNECTION_STRING) {
  throw new Error("Azure Storage Connection String is missing in .env");
}

const blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);
const containerClient =
  blobServiceClient.getContainerClient(AZURE_BLOB_CONTAINER_TXT);

/**
 * POST /api/chat/save
 * Body: { name: string; conversation: ChatMessage[] }
 *
 * We treat `name` as the UID for this interview session.
 * Saves to Azure Blob:
 *   saved-conversations/<uid>/transcript.txt
 *   saved-conversations/<uid>/Scorecard.pdf
 */
router.post("/save", async (req, res) => {
  try {
    const { name, conversation } = req.body as {
      name: string; // this is the uid
      conversation: ChatMessage[];
    };

    if (!name || !Array.isArray(conversation)) {
      return res
        .status(400)
        .json({ error: "Missing name or invalid conversation" });
    }

    // Ensure container exists
    await containerClient.createIfNotExists();

    const uidFolder = name; // uid from frontend
    const now = new Date().toISOString();

    // Build transcript text
    const transcript = conversation
      .map((msg) => {
        const who =
          msg.role === "assistant"
            ? "HR Bot"
            : msg.role === "user"
            ? name
            : "System";
        return `${who}: ${msg.content}`;
      })
      .join("\n");

    // Generate PDF scorecard
    const pdfBuffer = await generateScorecard(conversation);

    // Blob paths: EXACTLY <uid>/transcript.txt and <uid>/Scorecard.pdf
    const transcriptBlobPath = `${uidFolder}/transcript.txt`;
    const pdfBlobPath = `${uidFolder}/Scorecard.pdf`;

    // Upload transcript
    const transcriptBlockClient =
      containerClient.getBlockBlobClient(transcriptBlobPath);
    await transcriptBlockClient.upload(transcript, transcript.length, {
      blobHTTPHeaders: { blobContentType: "text/plain; charset=utf-8" },
      metadata: {
        uid: uidFolder,
        savedAt: now,
        type: "transcript",
      },
    });

    // Upload scorecard PDF
    const pdfBlockClient = containerClient.getBlockBlobClient(pdfBlobPath);
    await pdfBlockClient.uploadData(pdfBuffer, {
      blobHTTPHeaders: { blobContentType: "application/pdf" },
      metadata: {
        uid: uidFolder,
        savedAt: now,
        type: "scorecard",
      },
    });

    log(
      `✔ Saved transcript & scorecard for uid=${uidFolder} in Azure container: ${AZURE_BLOB_CONTAINER_TXT}`
    );

    return res.json({
      success: true,
      container: AZURE_BLOB_CONTAINER_TXT,
      path: uidFolder, // parent folder containing both files
    });
  } catch (err: any) {
    error("Save route error", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;


// // src/routes/chat.ts
 
// import { Router } from 'express';
// import {
//   askLlm,
//   generateScorecard,
//   ChatMessage,
//   summariseCvAndJd,
//   CvJdSummary
// } from '../services/llmService';
// import { log, error } from '../logger';
 
// const sessionSummaries = new Map<string, CvJdSummary>();
// const router = Router();
 
// /**
//  * Build the system prompt WITHOUT embedding your literal Q8/Q9/Q10/Q11 script.
//  * It gives the model guidance, not text to read verbatim.
//  */
// function buildSystemPrompt(cvSummary: string, jdSummary: string): string {
//   return `
// You are “MAX,” an AI interviewer.
 
// Context:
// - Resume: ${cvSummary || 'N/A'}
// - Job Description: ${jdSummary || 'N/A'}
 
// Core objectives:
// - Conduct a structured, time-boxed interview of ~10–12 questions (~10 minutes).
// - Keep the interaction conversational, professional, and efficient.
// - Ask ONE focused question at a time and wait for the candidate’s answer.
// - Do NOT bundle multiple asks in a single question (avoid “and”, “including”, “as well as” type chains).
// - Always move the conversation forward; do not repeat the same question unless the candidate explicitly asks.
 
// Language & multilingual behaviour:
// - Default language is English.
// - If the candidate clearly asks to switch to Hindi, or consistently responds in Hindi, switch to Hindi.
// - In Hindi mode, ask questions and respond only in simple, natural Hindi using Devanagari script.
// - Stay in Hindi until the candidate explicitly asks to switch back to English.
 
// Interview coverage (use your own wording; DO NOT read this list verbatim):
// - Early: brief background, current role, and key projects relevant to the JD.
// - Technical depth: system design, data/ML architecture, experimentation, and productionisation of ML/LLM systems.
// - Incident / hallucination scenario:
//   - How they triage and mitigate hallucinations or bad behaviour in production LLM features.
//   - Immediate triage steps, short-term mitigations, long-term fixes.
//   - How they communicate impact, status, and mitigation to stakeholders and users.
// - Leadership:
//   - How they structure and lead a squad (roles/skills).
//   - How they hire for gaps and raise the bar on code quality, design reviews, and postmortems.
// - Execution / 30–60–90:
//   - A concrete 30/60/90-day plan aligned with this JD.
//   - Expected artifacts, milestones, and at least one shipped increment as an example.
// - Metrics:
//   - Which KPIs to track in the first 6 months (business impact, model outcomes, delivery, quality/risk, stakeholder satisfaction).
//   - How to measure cost-to-serve and adoption specifically.
// - Closing:
//   - Give the candidate a chance to add anything about their fit.
//   - Invite clarifying questions about the role or process.
//   - Close the interview politely.
 
// Style guidelines:
// - Sound like a friendly, emotionally aware senior interviewer, not a chatbot.
// - Be warm, encouraging, and naturally expressive, but stay factual and avoid making things up about the candidate or the company.
// - Use short, clear questions.
// - HARD RULE: Each reply must be at most 1–2 short sentences, and no more than 40 words in total.
// - The actual question must be a single concise sentence (ideally under 20 words).
// - Do NOT add long explanations, multi-sentence summaries, or paragraphs.
// - Acknowledge answers with very brief phrases (e.g., “Got it.” / “Makes sense.” / “That’s helpful, thank you.”) and then ask the next question.
// - Do NOT copy or reuse phrases from this instruction such as “Thanks — helpful / noted / clear”.
// - Do NOT output numbered prompt text or phrases like “8)” / “9)” / “10)” / “11)” from this instruction.
 
// Interruption handling:
// - If the candidate says they need a moment (e.g., “one sec”, “wait”, “hold on”, “sorry, got interrupted”), briefly acknowledge and pause content:
//   - Example: “No problem at all, take your time.”
// - When they resume and refer back to the previous topic, gently reconnect:
//   - Example: “Of course. You were talking about your last project — please continue from there.”
// - Do NOT introduce new topics during an interruption; only resume once they are ready.
 
// Opening behaviour:
// - In your very first message, briefly introduce yourself and the structure of the interview in ONE short sentence
//   (for example: who you are, that you’ll cover background, technical topics, and ways of working).
// - In the same message, immediately ask the first question, focused on their background and fit for this role, as one short sentence.
// - The entire opening message must be no more than 2 short sentences and 40 words total.
// `;
// }
 
// /**
//  * POST /api/chat
//  * Body: { cv?: string; jd?: string; messages: ChatMessage[]; userText?: string; sessionId?: string }
//  */
// router.post('/', async (req, res) => {
//   try {
//     const {
//       cv = '',
//       jd = '',
//       messages,
//       userText,
//       sessionId
//     } = req.body as {
//       cv?: string;
//       jd?: string;
//       messages: ChatMessage[];
//       userText?: string;
//       sessionId?: string;
//     };
 
//     if (!Array.isArray(messages)) {
//       return res.status(400).json({ error: 'Invalid messages format' });
//     }
 
//     log('[🛡️] [chat] Incoming', {
//       count: messages.length,
//       hasUserText: !!userText,
//       sessionId: sessionId || null
//     });
 
//     let convo: ChatMessage[];
 
//     // First turn: inject ONLY the system prompt, let the model generate greeting + Q1
//     // if (messages.length === 0) {
//     //   const systemPrompt = buildSystemPrompt(cv, jd);
 
//     //   convo = [
//     //     {
//     //       role: 'system',
//     //       content: systemPrompt
//     //     }
//     //   ];
//     // } else {
//     //   // Subsequent turns: trust full history coming from the front-end (no trimming)
//     //   convo = messages;
//     // }
 
//     //NEW ADDED:
//     if (messages.length === 0) {
//       // ✅ First turn: get or build summaries
//       let summaries: CvJdSummary | undefined;
 
//       if (sessionId) {
//         summaries = sessionSummaries.get(sessionId);
//       }
 
//       if (!summaries) {
//         log('[chat] Generating CV/JD summaries', { sessionId: sessionId || null });
//         summaries = await summariseCvAndJd(cv, jd);
//         if (sessionId) {
//           sessionSummaries.set(sessionId, summaries);
//         }
//       }
 
//       const systemPrompt = buildSystemPrompt(
//         summaries.cvSummary,
//         summaries.jdSummary
//       );
 
//       convo = [
//         {
//           role: 'system',
//           content: systemPrompt,
//         },
//       ];
//     } else {
//       // Subsequent turns: trust full history from frontend
//       convo = messages;
//     }
 
 
//     const updatedHistory = await askLlm(convo, userText);
 
//     return res.json(updatedHistory);
//   } catch (err: any) {
//     error('[❌] [chat] Chat route error', err);
//     const status = err?.status || 502;
//     return res.status(status).json({ error: 'LLM chat failure' });
//   }
// });
 
// /**
//  * POST /api/chat/scorecard
//  * Body: { conversation: ChatMessage[] }
//  * Returns: PDF buffer
//  */
// router.post('/scorecard', async (req, res) => {
//   try {
//     const { conversation } = req.body as { conversation: ChatMessage[] };
 
//     if (!Array.isArray(conversation) || conversation.length === 0) {
//       return res.status(400).json({ error: 'Conversation is required' });
//     }
 
//     const pdfBuffer = await generateScorecard(conversation);
 
//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader(
//       'Content-Disposition',
//       'attachment; filename="scorecard.pdf"'
//     );
 
//     return res.send(pdfBuffer);
//   } catch (err) {
//     error('[❌] [chat] Scorecard route error', err);
//     return res.status(500).json({ error: 'Failed to generate scorecard' });
//   }
// });
 
// export default router;