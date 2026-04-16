# Complaint Portal

Complaint management application built with Node.js, Express, plain HTML/CSS/JS rendering, and MongoDB.

## Highlights Implemented

- Plain HTML/CSS/JS rendering (no template engine).
- Auth hardening:
  - email verification flow
  - forgot/reset password flow
  - optional 2FA (email OTP)
  - login CAPTCHA and account lockout
- Finer RBAC:
  - `user`
  - `agent`
  - `department_admin`
  - `super_admin`
- Structured JSON logging + runtime monitoring snapshots.
- Backup/restore scripts for operational safety.
- Added Mongo indexes for frequent filters and sorting.
- Expanded automated tests for search, exports, status updates, history, and security paths.
- Complaint evidence attachments (JPG/PNG/PDF).
- Real notification channels:
  - email via Resend API (when configured)
  - SMS + WhatsApp via Twilio (when configured)
- Department-wise assignment and scoped staff access.
- SLA engine with reminder and escalation levels.
- Comment thread on each complaint.
- Public tracking page using tracking ID (`/track`).
- Dashboard chart visualizations and list pagination/sorting.

## Prerequisites

- Node.js 18+
- npm 9+
- MongoDB (local or hosted)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file from the template:

```bash
cp .env.example .env
```

3. Set strong values in `.env`:

- `SESSION_SECRET` (strong random secret, 32+ chars)
- `ADMIN_PASSWORD` (strong password, 12+ chars)

## Environment Variables

See [.env.example](./.env.example) for the full list:

- `MONGO_URI`
- `SESSION_SECRET`
- `SESSION_MAX_AGE_MS`
- `APP_URL`
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM`
- `TWILIO_WHATSAPP_FROM`
- `MAX_FAILED_ATTEMPTS`
- `LOCKOUT_MINUTES`
- `VERIFICATION_TOKEN_TTL_MS`
- `RESET_TOKEN_TTL_MS`
- `TWO_FA_TOKEN_TTL_MS`
- `MONITOR_INTERVAL_MS`
- `SLA_HOURS_HIGH`
- `SLA_HOURS_MEDIUM`
- `SLA_HOURS_LOW`
- `SLA_CHECK_INTERVAL_MS`
- `SLA_REMINDER_WINDOW_HOURS`
- `ADMIN_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `NODE_ENV`
- `PORT`

## Run Locally

- Development:

```bash
npm run dev
```

- Production-like local run:

```bash
npm start
```

## Testing

```bash
npm test
```

## Security Flows

- Registration sends an email verification link.
- Login requires:
  - valid credentials
  - correct CAPTCHA answer
  - verified email
  - 2FA code (if enabled for user)
- Password reset is token-based with expiry.
- Repeated failed logins trigger account lockout.

### Email Verification Toggle

Use `.env`:

```bash
EMAIL_VERIFICATION_REQUIRED=true
```

- `true`: user must verify email before login.
- `false`: verification checks are skipped and new users can login immediately.

After changing this flag, restart the server.

## Roles and Access

- `user`: submit/view own complaints.
- `agent`: access admin management pages.
- `department_admin`: admin management + analytics + exports.
- `super_admin`: full access.

## High-Impact Features Usage

### Attachments

- Submit attachments from complaint form (`/complaint`).
- Allowed types: `jpg`, `jpeg`, `png`, `pdf`.
- Max: 5 files, 5 MB each.

### Public Tracking

- Every complaint gets a public ID (example: `CP-1A2B3C4D`).
- Anyone can track limited status details at `/track`.

### SLA and Escalation

- SLA due date is auto-calculated by priority:
  - High: `SLA_HOURS_HIGH`
  - Medium: `SLA_HOURS_MEDIUM`
  - Low: `SLA_HOURS_LOW`
- Scheduler scans at `SLA_CHECK_INTERVAL_MS` and triggers:
  - reminder before due window (`SLA_REMINDER_WINDOW_HOURS`)
  - escalation level 1 when overdue
  - escalation level 2 after prolonged overdue

### Notifications

- Email:
  - if `RESEND_API_KEY` is set, real email API call is used
  - if not set, app logs email payload locally
- SMS/WhatsApp:
  - configure Twilio credentials and sender IDs to enable real sends
  - otherwise channels are skipped and logged

## Monitoring and Alerts

- `/health`: service and DB status.
- `/metrics`: process snapshot (`uptime`, memory, DB state).
- JSON structured logs emitted for key events and errors.

## Backup and Restore

Create backup:

```bash
npm run backup
```

Restore backup:

```bash
npm run restore -- ./backups/backup-<timestamp>
```

Notes:

- Backups include `users` and `complaints`.
- Restore replaces current records in those collections.
- Run restore only in controlled maintenance windows.

## Deployment Notes

- Do not commit `.env` or `node_modules`.
- Set all secrets in your hosting environment (Railway, Render, etc.).
- Rotate `SESSION_SECRET` and `ADMIN_PASSWORD` before production.
- Optional PM2 config is provided in `ecosystem.config.js`.

## Docker

Build and run:

```bash
docker build -t complaint-portal .
docker run -p 3000:3000 --env-file .env complaint-portal
```
