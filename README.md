# Anonymiser

**Anonymiser** is a **CLI-first database anonymisation tool** for web projects.

It allows teams to safely generate **anonymized, realistic database dumps** for development, QA, and review — **without ever exposing production data**.

Designed for:
- MySQL & PostgreSQL
- Modern web stacks (Node.js, CI/CD, cloud)
- Regulated environments (GDPR, SOC2, ISO-aligned workflows)

Distributed as an **npm package** and executed via **npx** — no global installs, no language mismatch.

---

## Why Anonymiser?

Using production databases in development is:
- **Dangerous** (data leaks happen)
- **Illegal** under GDPR in most cases
- **Operationally risky** (accidental writes, corruption)

Anonymiser ensures:
- No real personal data leaves secure environments
- Anonymized data remains **structurally realistic**
- Teams can work with confidence and speed

---

## Key Features

- Database-first (MySQL default, PostgreSQL supported)
- Gzipped SQL dump output (`.sql.gz`)
- Deterministic anonymisation (referential integrity preserved)
- Safe by default (dump mode, no direct writes)
- Config-driven with optional interactive CLI prompts
- Audit-friendly summaries and reports
- No Python, no Ruby — Node.js only

---

## Installation

No installation required.

Run directly via:

```bash
npx anonymiser
```

### Requirements

- Node.js 18 or higher

---

## Supported Databases

| Database | Status |
|---------|--------|
| MySQL / MariaDB | Default |
| PostgreSQL | Supported |

---

## Execution Modes

### Dump Mode (Default & Recommended)

Reads from a database or dump and produces an anonymized, gzipped SQL dump.

```bash
npx anonymiser run
```

- No writes to source DB
- Safest for regulated environments
- Ideal for CI/CD pipelines

---

### Direct Mode (Dangerous – Explicit Opt-In)

Writes anonymized data directly into a database.

```bash
npx anonymiser run --direct
```

Warnings:
- Strong warning shown
- Requires confirmation
- Never use against production

---

## Configuration

Anonymiser is driven by a config file named:

`anonymiser.config.ts`

### Example Configuration

```ts
export default {
  database: {
    type: 'mysql',
    mode: 'dump',
    url: process.env.DATABASE_URL
  },

  output: {
    file: './anonymized.sql.gz'
  },

  tables: {
    users: {
      email: { action: 'update', type: 'email' },
      name: { action: 'update', type: 'fullName' },
      phone: { action: 'update', type: 'phone' },
      national_id: {
        action: 'encrypt',
        algorithm: 'aes-256-gcm',
        keyEnv: 'ANONYMISER_SECRET'
      }
    },

    audit_logs: 'truncate'
  }
}
```

---

## Column Actions

Each column supports following action.

### truncate

Removes data completely.

```ts
audit_logs: 'truncate'
```

Recommended for logs, events, and sessions.

---

### update (Replace with Dummy Data)

Replaces values with realistic fake data.

```ts
email: { action: 'update', type: 'email' }
```

Supported text-based types:
- email
- firstName
- lastName
- fullName
- phone
- address
- city
- country
- ip
- uuid
- text

---

### encrypt (Reversible – Advanced Use)

Encrypts values using symmetric encryption.

```ts
ssn: {
  action: 'encrypt',
  algorithm: 'aes-256-gcm',
  keyEnv: 'ANONYMISER_SECRET'
}
```

Notes:
- This is pseudonymization, not anonymisation
- Key must come from environment variables
- Intended for controlled workflows only

---

## Interactive CLI

Run without arguments to launch guided setup:

```bash
npx anonymiser
```

The CLI can generate the configuration file automatically.

---

## Output

- Gzipped SQL dump (`anonymized.sql.gz`)
- Terminal summary
- Machine-readable JSON report

---

## CI/CD Usage

Example GitHub Actions step:

```yaml
- name: Anonymize Database
  run: npx anonymiser run --config anonymiser.config.ts
```

---

## GDPR & Compliance Notes

Compliance depends on correct usage.

Best practices:
- Never expose production credentials
- Never sync anonymized data back to production
- Prefer truncate over encrypt
- Keep anonymisation irreversible

This tool does not replace legal advice.

---

## Development

```bash
npm install
npm run dev
npm run build
```

---

## License

MIT License

---

## Philosophy

- Human decides WHAT goes live.
- Machine executes HOW it happens.
