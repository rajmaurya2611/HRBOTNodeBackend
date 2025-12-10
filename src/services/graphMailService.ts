import axios from "axios";
import { getGraphAccessToken } from "./azureAuth";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const SENDER = process.env.AZURE_MAIL_SENDER || "";

if (!SENDER) {
  console.warn("[GraphMail] AZURE_MAIL_SENDER not configured.");
}

export interface SendMailOptions {
  to: string[];
  subject: string;
  htmlBody?: string;
  textBody?: string;
  cc?: string[];
  bcc?: string[];
}

export async function sendMailViaGraph(options: SendMailOptions): Promise<void> {
  const token = await getGraphAccessToken();

  const bodyContent = options.htmlBody
    ? { contentType: "HTML", content: options.htmlBody }
    : { contentType: "Text", content: options.textBody ?? "" };

  const message = {
    subject: options.subject,
    body: bodyContent,
    toRecipients: options.to.map((email) => ({
      emailAddress: { address: email },
    })),
    ccRecipients: (options.cc ?? []).map((email) => ({
      emailAddress: { address: email },
    })),
    bccRecipients: (options.bcc ?? []).map((email) => ({
      emailAddress: { address: email },
    })),
  };

  const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(
    SENDER
  )}/sendMail`;

  try {
    await axios.post(
      url,
      { message, saveToSentItems: true },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("[GraphMail] Mail sent to:", options.to);
  } catch (err: any) {
    console.error(
      "[GraphMail] Error sending mail:",
      err.response?.status,
      err.response?.data || err.message
    );
    throw new Error("Graph mail send failed");
  }
}
