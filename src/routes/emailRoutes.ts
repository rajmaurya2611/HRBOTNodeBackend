// src/routes/emailRoutes.ts
import { Router } from "express";
import {
  sendInterviewInviteEmail,
  EmailAttachment,
} from "../services/interviewEmailService";

const router = Router();

/**
 * POST /api/email/send-interview-invite
 * Body:
 * {
 *   "to": "candidate@example.com",
 *   "candidateName": "John Doe",           // optional
 *   "interviewLink": "https://.../uuid/..",
 *   "attachments": [                       // optional
 *     {
 *       "name": "JD.pdf",
 *       "contentBase64": "<base64>",
 *       "contentType": "application/pdf"
 *     },
 *     {
 *       "name": "CV.pdf",
 *       "contentBase64": "<base64>",
 *       "contentType": "application/pdf"
 *     }
 *   ]
 * }
 */
router.post("/send-interview-invite", async (req, res) => {
  try {
    const { to, candidateName, interviewLink, attachments } = req.body;

    if (!to || !interviewLink) {
      return res
        .status(400)
        .json({ error: "Missing 'to' or 'interviewLink' in request body" });
    }

    let parsedAttachments: EmailAttachment[] | undefined = undefined;

    // ✅ Only parse if frontend sends attachments AND it's an array
    if (Array.isArray(attachments) && attachments.length > 0) {
      parsedAttachments = attachments
        .filter(
          (att) => att && att.name && att.contentBase64 // basic guard
        )
        .map((att) => ({
          name: att.name,
          contentBase64: att.contentBase64,
          contentType: att.contentType,
        }));
    }

    await sendInterviewInviteEmail({
      to,
      candidateName: candidateName || "Candidate",
      interviewLink,
      attachments: parsedAttachments, // can be undefined or []
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error("[EmailRoute] send-interview-invite error:", e.message);
    return res.status(500).json({ error: "Failed to send interview invite" });
  }
});

export default router;
