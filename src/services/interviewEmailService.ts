// src/services/interviewEmailService.ts
import axios from "axios";

const LOGICAPP_EMAIL_WEBHOOK_URL =
  process.env.LOGICAPP_EMAIL_WEBHOOK_URL || "";

if (!LOGICAPP_EMAIL_WEBHOOK_URL) {
  console.warn(
    "[InterviewEmail] LOGICAPP_EMAIL_WEBHOOK_URL is not configured. Email sending will fail."
  );
}

export interface EmailAttachment {
  name: string;            // e.g. "JD.pdf"
  contentBase64: string;   // base64 encoded file
  contentType?: string;    // e.g. "application/pdf"
}

/**
 * Build the HTML body for the AI interview invite.
 */
function buildInterviewInviteEmailBody(
  candidateName: string | undefined,
  interviewLink: string
): string {
  const safeName =
    candidateName && candidateName.trim() !== "" ? candidateName : "Candidate";

  return `
  <p>Hello ${safeName},</p>

  <p>Thank you for applying to <b>Motherson Technology Services Limited</b>.</p>

  <p>
    We’re excited to move you forward in our hiring process and would like to invite you to
    complete your interview using our <b>AI-powered interview assistant</b> — an interactive,
    proctored, real-time voice-based experience designed for your convenience.
  </p>

  <p><b>Start your interview:</b><br/>
    <a href="${interviewLink}" target="_blank" rel="noopener noreferrer">
      ${interviewLink}
    </a>
  </p>

  <p>
    <b>Note:</b> This link will remain active for the next <b>72 hours</b>.<br/>
    Please ensure you complete your interview before the link expires.
    The interview needs to be taken on a <b>desktop/laptop</b> and not on mobile phones.
  </p>

  <p><b>Dress Code:</b> Smart Casuals</p>

  <p><b>Interview DO’s &amp; DON’Ts</b><br/>
  Please read the following guidelines carefully to ensure a smooth interview experience:</p>

  <p><b>DO’s</b></p>
  <ul>
    <li>Be alone in the room while taking the interview to maintain privacy and interview integrity.</li>
    <li>Choose a quiet, well-lit location where you won’t be interrupted.</li>
    <li>Ensure your device is fully charged and connected to a stable internet connection.</li>
    <li>Test your camera, microphone, and internet connection before starting.</li>
    <li>Maintain eye contact with the camera for natural engagement.</li>
    <li>Use preparation time wisely (you will typically get around 30 seconds before each question).</li>
    <li>Complete the interview in one continuous session.</li>
    <li>Read and accept the AI Video Interview Disclaimer before beginning.</li>
    <li>Allow full screen sharing with system audio when prompted — this is required for proper interview functioning.</li>
  </ul>

  <p><b>DON’Ts</b></p>
  <ul>
    <li>Do not attempt the interview in noisy or poorly lit environments.</li>
    <li>Do not keep other applications running or multitask during the session.</li>
    <li>Do not refresh, reload, or close your browser once the interview has started, as this may end your session.</li>
    <li>Do not cover your camera or mute your microphone while responding.</li>
    <li>Do not allow interruptions from phone calls, messages, or people entering the room.</li>
    <li>Do not attempt to restart or retake the interview unless the system explicitly allows a re-record option.</li>
  </ul>

  <p><b>✅ Before You Begin – Final Checklist</b></p>
  <ul>
    <li>✔️ Read and accepted the AI Video Interview Disclaimer</li>
    <li>✔️ A working camera and microphone</li>
    <li>✔️ A quiet, private environment (you must be alone)</li>
    <li>✔️ Allowed entire screen sharing with system audio when prompted</li>
  </ul>

  <p>
    <b>MTSL:</b>
    <a href="https://www.mothersontechnology.com/" target="_blank" rel="noopener noreferrer">
      https://www.mothersontechnology.com/
    </a><br/>
    <b>Motherson:</b>
    <a href="https://www.motherson.com/" target="_blank" rel="noopener noreferrer">
      https://www.motherson.com/
    </a>
  </p>

  <p>Regards,<br/>
  <b>Motherson Technology Services Limited</b></p>
  `;
}

export async function sendInterviewInviteEmail(params: {
  to: string;
  candidateName?: string;
  interviewLink: string;
  attachments?: EmailAttachment[];   // optional attachments
}): Promise<void> {
  if (!LOGICAPP_EMAIL_WEBHOOK_URL) {
    throw new Error("LOGICAPP_EMAIL_WEBHOOK_URL not configured");
  }

  const { to, candidateName, interviewLink, attachments } = params;

  const subject =
    "AI Video Interview Invitation – Motherson Technology Services Limited";

  const emailBody = buildInterviewInviteEmailBody(candidateName, interviewLink);

  // Base payload for Logic App
  const payload: any = {
    to,
    subject,
    emailBody
  };

  // 🔹 Map attachments to what Logic App expects: fileName + fileContent
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((att) => ({
      fileName: att.name,                        // Logic App schema
      fileContent: att.contentBase64,            // Logic App schema
      contentType: att.contentType || "application/pdf"
    }));
  }

  try {
    await axios.post(LOGICAPP_EMAIL_WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

    console.log(
      "[InterviewEmail] Logic App triggered for:",
      to,
      "attachments:",
      Array.isArray(attachments) ? attachments.length : 0
    );
  } catch (err: any) {
    console.error(
      "[InterviewEmail] Error triggering Logic App:",
      err.response?.status,
      err.response?.data || err.message
    );
    throw new Error("Failed to send interview invite email");
  }
}



// // src/services/interviewEmailService.ts
// import axios from "axios";

// const LOGICAPP_EMAIL_WEBHOOK_URL =
//   process.env.LOGICAPP_EMAIL_WEBHOOK_URL || "";

// if (!LOGICAPP_EMAIL_WEBHOOK_URL) {
//   console.warn(
//     "[InterviewEmail] LOGICAPP_EMAIL_WEBHOOK_URL is not configured. Email sending will fail."
//   );
// }

// export interface EmailAttachment {
//   name: string;            // e.g. "JD.pdf"
//   contentBase64: string;   // base64 encoded file
//   contentType?: string;    // e.g. "application/pdf"
// }

// /**
//  * Build the HTML body for the AI interview invite.
//  */
// function buildInterviewInviteEmailBody(
//   candidateName: string | undefined,
//   interviewLink: string
// ): string {
//   const safeName =
//     candidateName && candidateName.trim() !== "" ? candidateName : "Candidate";

//   return `
//   <p>Hello ${safeName},</p>

//   <p>Thank you for applying to <b>Motherson Technology Services Limited</b>.</p>

//   <p>
//     We’re excited to move you forward in our hiring process and would like to invite you to
//     complete your interview using our <b>AI-powered interview assistant</b> — an interactive,
//     proctored, real-time voice-based experience designed for your convenience.
//   </p>

//   <p><b>Start your interview:</b><br/>
//     <a href="${interviewLink}" target="_blank" rel="noopener noreferrer">
//       ${interviewLink}
//     </a>
//   </p>

//   <p>
//     <b>Note:</b> This link will remain active for the next <b>72 hours</b>.<br/>
//     Please ensure you complete your interview before the link expires.
//     The interview needs to be taken on a <b>desktop/laptop</b> and not on mobile phones.
//   </p>

//   <p><b>Dress Code:</b> Smart Casuals</p>

//   <p><b>Interview DO’s &amp; DON’Ts</b><br/>
//   Please read the following guidelines carefully to ensure a smooth interview experience:</p>

//   <p><b>DO’s</b></p>
//   <ul>
//     <li>Be alone in the room while taking the interview to maintain privacy and interview integrity.</li>
//     <li>Choose a quiet, well-lit location where you won’t be interrupted.</li>
//     <li>Ensure your device is fully charged and connected to a stable internet connection.</li>
//     <li>Test your camera, microphone, and internet connection before starting.</li>
//     <li>Maintain eye contact with the camera for natural engagement.</li>
//     <li>Use preparation time wisely (you will typically get around 30 seconds before each question).</li>
//     <li>Complete the interview in one continuous session.</li>
//     <li>Read and accept the AI Video Interview Disclaimer before beginning.</li>
//     <li>Allow full screen sharing with system audio when prompted — this is required for proper interview functioning.</li>
//   </ul>

//   <p><b>DON’Ts</b></p>
//   <ul>
//     <li>Do not attempt the interview in noisy or poorly lit environments.</li>
//     <li>Do not keep other applications running or multitask during the session.</li>
//     <li>Do not refresh, reload, or close your browser once the interview has started, as this may end your session.</li>
//     <li>Do not cover your camera or mute your microphone while responding.</li>
//     <li>Do not allow interruptions from phone calls, messages, or people entering the room.</li>
//     <li>Do not attempt to restart or retake the interview unless the system explicitly allows a re-record option.</li>
//   </ul>

//   <p><b>✅ Before You Begin – Final Checklist</b></p>
//   <ul>
//     <li>✔️ Read and accepted the AI Video Interview Disclaimer</li>
//     <li>✔️ A working camera and microphone</li>
//     <li>✔️ A quiet, private environment (you must be alone)</li>
//     <li>✔️ Allowed entire screen sharing with system audio when prompted</li>
//   </ul>

//   <p>
//     <b>MTSL:</b>
//     <a href="https://www.mothersontechnology.com/" target="_blank" rel="noopener noreferrer">
//       https://www.mothersontechnology.com/
//     </a><br/>
//     <b>Motherson:</b>
//     <a href="https://www.motherson.com/" target="_blank" rel="noopener noreferrer">
//       https://www.motherson.com/
//     </a>
//   </p>

//   <p>Regards,<br/>
//   <b>Motherson Technology Services Limited</b></p>
//   `;
// }

// export async function sendInterviewInviteEmail(params: {
//   to: string;
//   candidateName?: string;
//   interviewLink: string;
//   attachments?: EmailAttachment[];   // optional attachments
// }): Promise<void> {
//   if (!LOGICAPP_EMAIL_WEBHOOK_URL) {
//     throw new Error("LOGICAPP_EMAIL_WEBHOOK_URL not configured");
//   }

//   const { to, candidateName, interviewLink, attachments } = params;

//   const subject =
//     "AI Video Interview Invitation – Motherson Technology Services Limited";

//   const emailBody = buildInterviewInviteEmailBody(candidateName, interviewLink);

//   // Base payload
//   const payload: any = {
//     to,
//     subject,
//     emailBody,
//   };

//   // Optional attachments: only send if array exists and has items
//   if (attachments && attachments.length > 0) {
//     payload.attachments = attachments.map((att) => ({
//       name: att.name,
//       contentBase64: att.contentBase64,
//       contentType: att.contentType || "application/octet-stream",
//     }));
//   }

//   try {
//     await axios.post(LOGICAPP_EMAIL_WEBHOOK_URL, payload, {
//       headers: { "Content-Type": "application/json" },
//       timeout: 10000,
//     });

//     console.log(
//       "[InterviewEmail] Logic App triggered for:",
//       to,
//       "attachments:",
//       Array.isArray(attachments) ? attachments.length : 0
//     );
//   } catch (err: any) {
//     console.error(
//       "[InterviewEmail] Error triggering Logic App:",
//       err.response?.status,
//       err.response?.data || err.message
//     );
//     throw new Error("Failed to send interview invite email");
//   }
// }
