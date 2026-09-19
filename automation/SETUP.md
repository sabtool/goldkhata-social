# GoldKhata auto-posting

Posts go out by themselves to Instagram and Facebook — Monday, Wednesday and
Friday at 7:30 pm IST — even when the Mac is off and nobody is online.

```
Claude makes a month of posts ──▶ automation/queue/calendar.json ──▶ GitHub robot, every 30 min
                                                                   ├─▶ Instagram
                                                                   └─▶ Facebook Page
```

## What the owner ever needs to do

- Day to day: nothing.
- Once a month: message Claude "next month's posts".
- If you change your Facebook password: tell Claude. Posting stops until
  the key is renewed, and GitHub emails you about the failed run.
- To stop a post: tell Claude (or set `"approved": false` on it in the queue).
- WhatsApp Status stays manual — WhatsApp has no way for software to post a
  status. The images are in `output/`.

## How the robot decides

- Posts an item once its IST date/time has passed and `approved` is true.
- Never posts anything more than 24 hours late: it marks it `skipped_stale`
  instead. If the robot was down, re-date the queue.
- Never posts the same platform twice; a failed platform retries every
  30 minutes and the error is written into the queue file.
- Without `META_ACCESS_TOKEN` it does nothing (this is the state before the
  accounts are connected).

## The connection (one time)

1. Meta app **GoldKhata Autopost** at developers.facebook.com (Business type),
   switched to Live with goldkhata.com/privacy as its privacy policy.
2. Permissions: `pages_show_list`, `pages_read_engagement`,
   `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`,
   `business_management`.
3. Graph API Explorer token → extended in the Access Token Debugger →
   `GET /me/accounts` → the GoldKhata Page's `access_token` (a Page token
   that does not expire in normal use).
4. The Page ID and Instagram business account ID are written into
   `automation/config.json` (not secret). The Page token is the only secret:
   GitHub repo → Settings → Secrets and variables → Actions →
   `META_ACCESS_TOKEN`.
5. The repo (sabtool/goldkhata-social) is public because Instagram downloads
   each image from raw.githubusercontent.com. It holds images, captions and
   code only — never keys.

To renew the key after a password change, repeat steps 3 and 4 (the secret
is updated, not added).

## By hand

- `cd automation && node src/run-scheduler.js --dry-run` — shows what would
  post, changes nothing.
- GitHub → Actions → "Auto-post social content" → Run workflow — posts
  anything due right now.

## YouTube (later)

`src/post-youtube.js` and `npm run yt-token` are ready. Add the
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `YOUTUBE_REFRESH_TOKEN`
secrets and put `npm install` back into the workflow.
