# 🪝 DevOps Sentinel — GitHub Webhook Integration Guide

To enable automated autonomous scans and PR reviews whenever code is pushed or Pull Requests are opened in your repository, configure the GitHub Webhook pointing to your deployment of **DevOps Sentinel**.

---

## 1. Endpoint Configuration in GitHub

1. Go to your GitHub repository settings: **Settings → Webhooks → Add webhook**.
2. **Payload URL**: `https://your-domain.com/api/webhooks/github` (or `http://localhost:3009/api/webhooks/github` for local testing).
3. **Content type**: `application/json`.
4. **Secret**: Enter your secure webhook secret (matches `GITHUB_WEBHOOK_SECRET` in your environment variables).
5. **Which events would you like to trigger this webhook?**: Select **"Let me select individual events"** and check:
   - **Pull requests** (`pull_request`)
   - **Pushes** (`push`)
6. Click **Add webhook**.

---

## 2. Example Payload Verification (Node.js)

Sentinel's webhook listener (`app/api/webhooks/github/route.ts`) automatically validates incoming events and triggers the autonomous agent scan queue.

```typescript
import crypto from 'crypto';

export function verifySignature(body: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(body).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

---

## 3. Testing Webhooks Locally with cURL

You can simulate a GitHub `pull_request` event locally using cURL:

```bash
curl -X POST http://localhost:3009/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{
    "action": "opened",
    "pull_request": {
      "html_url": "https://github.com/obviousmarketingdigital-lab/sentinel-devops-agent/pull/1",
      "number": 1
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Webhook processed"
}
```
