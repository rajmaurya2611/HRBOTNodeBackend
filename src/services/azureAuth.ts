import axios from "axios";
import qs from "qs";

const {
  AZURE_TENANT_ID,
  AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET,
  AZURE_GRAPH_SCOPE,
} = process.env;

if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
  throw new Error("Azure AD env vars missing (TENANT/CLIENT/SECRET)");
}

const TOKEN_URL = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;
const SCOPE = AZURE_GRAPH_SCOPE || "https://graph.microsoft.com/.default";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGraphAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.token;
  }

  const data = qs.stringify({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: SCOPE,
    grant_type: "client_credentials",
  });

  const resp = await axios.post(TOKEN_URL, data, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const { access_token, expires_in } = resp.data;

  cachedToken = {
    token: access_token,
    expiresAt: now + expires_in,
  };

  return access_token;
}
