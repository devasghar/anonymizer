# Anonymiser

**Anonymiser** is a **CLI-first database anonymisation tool** for web projects.

It allows teams to safely generate **anonymised, realistic database dumps** for development, QA, and review — **without ever exposing production data**.

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

Reads from a database or dump and produces an anonymised, gzipped SQL dump.

```bash
npx anonymiser run
```

- No writes to source DB
- Safest for regulated environments
- Ideal for CI/CD pipelines
- Looks for config at `./anonymiser.config.ts` (current working directory)
- By default, writes output to `./database/anonymised.sql.gz`
- Input dump:
  - If `database.dumpFile` is set in config, that path is used
  - Otherwise, the tool will look for `./database/database.sql.gz` or `./database/database.sql`

---

### Direct Mode (Dangerous – Explicit Opt-In)

Writes anonymised data directly into a database.

```bash
npx anonymiser run --direct
```

Warnings:
- Strong warning shown
- Requires confirmation
- Never use against production
- Uses config at `./anonymiser.config.ts` (current working directory) if present
- Requires a valid `database.url` connection string in the config

---

## Configuration

Anonymiser is driven by a config file named:

`anonymiser.config.ts`

### Example Configuration

```ts
export default {
  database: {
    type: 'mysql',
    mode: 'dump', // or 'direct'
    // In dump mode, you can set either:
    // dumpFile: './database/database.sql.gz',
    // or leave it empty and place your dump at ./database/database.sql(.gz)
    // In direct mode, set:
    // url: 'mysql://user:password@host:3306/dbname'
  },

  output: {
    file: './database/anonymised.sql.gz'
  },

  tables: {
    users: {
      email: { action: 'update', type: 'email' },
      name: { action: 'update', type: 'fullName' },
      phone: { action: 'update', type: 'phone' }
    },

    audit_logs: 'truncate'
  }
}
```

---

## Quickstart

1) Create a config in the current directory (one-liner):

```bash
cat > anonymiser.config.ts <<'TS'
export default {
  database: {
    type: 'mysql',
    mode: 'dump',
    // Option A: use a dump file placed in ./database/
    // dumpFile: './database/database.sql.gz',
    // Option B: let the tool auto-detect ./database/database.sql(.gz)
  },
  output: { file: './database/anonymised.sql.gz' },
  tables: {
    users: {
      email: { action: 'update', type: 'email' },
      name: { action: 'update', type: 'fullName' },
      phone: { action: 'update', type: 'phone' },
    },
    audit_logs: 'truncate',
  },
}
TS
```

2) Place your dump at `./database/database.sql.gz` (or `./database/database.sql`)

3) Run dump mode:

```bash
npx anonymiser run
```

4) Alternatively, direct mode (dangerous). Edit config to include `database.url`, then:

```bash
npx anonymiser run --direct
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


## Interactive CLI

Run without arguments to launch guided setup:

```bash
npx anonymiser
```

The CLI can generate the configuration file automatically.

---

## Output

- Gzipped SQL dump (`anonymised.sql.gz`)
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
- Never sync anonymised data back to production
- Prefer truncate over encrypt
- Keep anonymisation irreversible

This tool does not replace legal advice.

---

## Report issues

Found a bug or have a feature request? Please report it on GitHub: [Create an issue](https://github.com/devasghar/anonymiser/issues)

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
