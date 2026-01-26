#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import { gzip as gzipCallback, gunzip as gunzipCallback } from 'node:zlib'
// encryption removed
import { promisify } from 'node:util'
import { z } from 'zod'
import { ConfigSchema, ColumnActionSchema } from './config/schema.js'
import inquirer from 'inquirer'
// encrypt action removed

const program = new Command()

program
  .name('anonymiser')
  .description('CLI-first database anonymisation tool')
  .version('0.1.0')

program
  .command('run')
  .option('-c, --config <file>', 'Config file', 'anonymiser.config.ts')
  .option('--direct', 'Run in direct DB mode (dangerous)')
  .action(async (options) => {
    if (options.direct) {
      console.log(
        chalk.yellow.bold(
          '\n⚠️  WARNING: Direct mode will modify a database in-place.\n'
        )
      )
      console.log(
        chalk.red(
          'This should NEVER be used against production databases.\n'
        )
      )
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message:
            'Are you absolutely sure you want to run in DIRECT mode on this database?',
          default: false,
        },
      ])
      if (!proceed) {
        console.log(chalk.yellow('Aborted by user.'))
        return
      }
    }

    console.log(chalk.green('Starting anonymisation…'))

    try {
      const configPath = path.resolve(process.cwd(), options.config)
      await assertFileExists(configPath)
      const rawConfig = await loadConfig(configPath)

      // Merge CLI flags into config (CLI takes precedence)
      if (options.direct) {
        rawConfig.database = rawConfig.database || {}
        rawConfig.database.mode = 'direct'
      }

      // Zod validation (shape + defaults)
      const parsed = ConfigSchema.parse(rawConfig)

      
      // Additional semantic validation
      validateSemanticConfig(parsed)

      // Brief summary
      printConfigSummary(parsed)

      // Run
      await runAnonymisation(parsed)
      console.log(chalk.green('\n✓ Completed\n'))
    } catch (err: any) {
      console.error(chalk.red('\n✖ Failed'))
      if (err?.issues) {
        // zod error
        for (const issue of err.issues) {
          console.error('-', issue.path.join('.'), issue.message)
        }
      } else {
        console.error(err?.message ?? String(err))
      }
      process.exitCode = 1
    }
  })

program.parse()

async function assertFileExists(filePath: string) {
  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`Config file not found: ${filePath}`)
  }
}

async function loadConfig(configPath: string): Promise<any> {
  const fileUrl = pathToFileURL(configPath).href
  try {
    const mod = await import(fileUrl)
    return mod.default ?? mod
  } catch (e: any) {
    throw new Error(
      `Unable to load config "${configPath}". If using TypeScript, run via "tsx" or provide a .js/.mjs file. Original error: ${e?.message}`
    )
  }
}

type AppConfig = z.infer<typeof ConfigSchema>

function validateSemanticConfig(config: AppConfig) {
  const mode = config.database.mode
  if (mode === 'direct') {
    if (!config.database.url) {
      throw new Error('database.url is required in direct mode')
    }
  } else {
    if (!config.database.url && !config.database.dumpFile) {
      throw new Error('Provide database.url or database.dumpFile in dump mode')
    }
  }

  // Validate tables structure/actions
  for (const [tableName, tableSpec] of Object.entries<any>(config.tables)) {
    if (typeof tableSpec === 'string') {
      if (tableSpec !== 'truncate') {
        throw new Error(
          `Table "${tableName}" must be "truncate" or an object mapping columns to actions`
        )
      }
      continue
    }
    if (typeof tableSpec !== 'object' || tableSpec == null) {
      throw new Error(
        `Table "${tableName}" must be "truncate" or an object mapping columns to actions`
      )
    }
    for (const [columnName, action] of Object.entries<any>(tableSpec)) {
      if (typeof action === 'string') {
        if (action !== 'truncate') {
          throw new Error(
            `Column "${tableName}.${columnName}" invalid action "${action}"`
          )
        }
        continue
      }
      const result = ColumnActionSchema.safeParse(action)
      if (!result.success) {
        throw new Error(
          `Column "${tableName}.${columnName}" has invalid action: ${result.error.message}`
        )
      }

      // encryption removed
    }
  }
}

function printConfigSummary(config: AppConfig) {
  const mode = config.database.mode
  const tablesCount = Object.keys(config.tables).length
  console.log(
    chalk.cyan(
      `\nMode: ${mode}\nOutput: ${config.output.file}\nTables: ${tablesCount}`
    )
  )
}

async function runAnonymisation(config: AppConfig) {
  const mode = config.database.mode
  if (mode === 'direct') {
    const dbType = config.database.type
    if (dbType !== 'mysql') {
      console.log(
        chalk.yellow(
          `Direct mode for "${dbType}" is not implemented yet. Use dump mode instead.`
        )
      )
      return
    }
    if (!config.database.url) {
      throw new Error('database.url is required in direct mode')
    }
    await runDirectMysql(config)
  } else {
    // If a dump file is provided, transform it by anonymizing literal INSERT data.
    // Otherwise, fall back to emitting minimal SQL (truncate/update).
    const gzip = promisify(gzipCallback)
    const outputPath = path.resolve(process.cwd(), config.output.file)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    if (config.database.dumpFile) {
      const inputPath = path.resolve(process.cwd(), config.database.dumpFile)
      const dumpText = await readInputDump(inputPath)
      const transformed = transformDumpLiterals(dumpText, config)
      const gz = await gzip(Buffer.from(transformed, 'utf8'))
      await fs.writeFile(outputPath, gz)
      console.log(chalk.green(`Wrote anonymised dump to ${outputPath}`))
    } else {
      const sql = buildDumpSql(config)
      const gz = await gzip(Buffer.from(sql, 'utf8'))
      await fs.writeFile(outputPath, gz)
      console.log(chalk.green(`Wrote anonymised dump to ${outputPath}`))
    }
  }
}

async function runDirectMysql(config: AppConfig) {
  const mysql = await import('mysql2/promise')
  const conn = await mysql.createConnection(config.database.url as string)
  try {
    for (const [tableName, tableSpec] of Object.entries<any>(config.tables)) {
      if (typeof tableSpec === 'string') {
        if (tableSpec === 'truncate') {
          await mysqlTruncateIfExists(conn, tableName)
          console.log(chalk.green(`Truncated (if exists): ${tableName}`))
        }
        continue
      }
      // Build UPDATE for columns with update action
      const setClauses: string[] = []
      for (const [col, action] of Object.entries<any>(tableSpec)) {
        if (typeof action === 'string') continue
        if (action.action === 'update') {
          const expr = getTypeAwareExpression(col, tableName, String(action.type || 'text'))
          if (expr) setClauses.push(`\`${col}\` = ${expr}`)
        }
      }
      if (setClauses.length > 0) {
        const sql = 'UPDATE ?? SET ' + setClauses.join(', ')
        await conn.query(sql, [tableName])
        console.log(chalk.green(`Updated: ${tableName} (${setClauses.length} columns)`))
      }
    }
  } finally {
    await conn.end()
  }
}

async function mysqlTruncateIfExists(
  conn: any,
  tableName: string
) {
  const [rows] = await conn.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName]
  )
  const exists = Array.isArray(rows) && rows.length > 0 && (rows[0] as any).c > 0
  if (!exists) return
  await conn.query('TRUNCATE TABLE ??', [tableName])
}

async function readInputDump(filePath: string): Promise<string> {
  const gunzip = promisify(gunzipCallback)
  const buf = await fs.readFile(filePath)
  const isGz = filePath.toLowerCase().endsWith('.gz')
  if (isGz) {
    const unzipped = await gunzip(buf)
    return unzipped.toString('utf8')
  }
  return buf.toString('utf8')
}

type TableColumnsMap = Map<string, string[]>

function inferTableColumnsFromDump(dumpText: string): TableColumnsMap {
  const map: TableColumnsMap = new Map()
  const lines = dumpText.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const m = line.match(/^CREATE\s+TABLE\s+(?:`[^`]+`\.)?`([^`]+)`\s*\(/i) || line.match(/^CREATE\s+TABLE\s+(?:\w+\.)?(\w+)\s*\(/i)
    if (!m) {
      i++
      continue
    }
    const table = m[1]
    const cols: string[] = []
    i++
    while (i < lines.length) {
      const l = lines[i]
      if (/^\)\s*/.test(l)) break
      const cm = l.match(/^\s*`([^`]+)`\s+[A-Za-z]/)
      if (cm) cols.push(cm[1])
      i++
    }
    map.set(table, cols)
    i++
  }
  return map
}

function transformDumpLiterals(dumpText: string, config: AppConfig): string {
  const truncateTables = new Set<string>()
  const updateSpec: Record<string, Record<string, any>> = {}
  for (const [table, spec] of Object.entries<any>(config.tables)) {
    if (typeof spec === 'string') {
      if (spec === 'truncate') truncateTables.add(table)
    } else if (typeof spec === 'object' && spec) {
      updateSpec[table] = spec
    }
  }
  const tableCols = inferTableColumnsFromDump(dumpText)
  const out: string[] = []
  const text = dumpText
  let i = 0
  const len = text.length
  while (i < len) {
    const insertMatch = matchInsertAt(text, i)
    if (!insertMatch) {
      out.push(text[i])
      i++
      continue
    }
    // Push up to match start
    if (insertMatch.start > i) {
      out.push(text.slice(i, insertMatch.start))
    }
    const { table, columns, valuesStart, statementEnd } = insertMatch
    // Skip entire INSERT if table is marked truncate
    if (truncateTables.has(table)) {
      i = statementEnd + 1
      continue
    }
    const colOrder =
      columns ??
      tableCols.get(table) ??
      null
    if (!colOrder) {
      // Unknown columns order; keep as is
      out.push(text.slice(insertMatch.start, statementEnd + 1))
      i = statementEnd + 1
      continue
    }
    const originalValues = text.slice(valuesStart, statementEnd) // excludes trailing ';'
    const transformedValues = transformValuesList(
      originalValues,
      table,
      colOrder,
      updateSpec[table] || {}
    )
    // Rebuild INSERT
    const head = text.slice(insertMatch.start, insertMatch.valuesStart)
    out.push(head, transformedValues, ';')
    i = statementEnd + 1
  }
  return out.join('')
}

function matchInsertAt(text: string, pos: number): null | {
  start: number
  table: string
  columns: string[] | null
  valuesStart: number
  statementEnd: number
} {
  // Support: INSERT INTO `table`, INSERT INTO table, INSERT INTO `schema`.`table`, INSERT INTO schema.table
  const re = /INSERT\s+INTO\s+((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))?)\s*(?:\(([^)]+)\))?\s+VALUES\s*/iy
  re.lastIndex = pos
  const m = re.exec(text)
  if (!m) return null
  const start = m.index
  const rawIdent = m[1]
  // Extract table name (after optional schema.)
  let tableIdent = rawIdent
  const dotIdx = rawIdent.lastIndexOf('.')
  if (dotIdx !== -1) tableIdent = rawIdent.slice(dotIdx + 1)
  const table = tableIdent.replace(/^`|`$/g, '')
  const columns = m[2]
    ? m[2].split(',').map((s) => s.replace(/[` \t\r\n]+/g, '').replace(/^`|`$/g, '')).filter(Boolean)
    : null
  const valuesStart = re.lastIndex
  // Find statement end ';' respecting quotes/escapes and parentheses level
  let i = valuesStart
  let inStr = false
  let prev = ''
  let level = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inStr) {
      if (ch === "'" && prev !== '\\') {
        // handle doubled '' escape
        const next = i + 1 < n ? text[i + 1] : ''
        if (next === "'") {
          i += 2
          prev = ''
          continue
        }
        inStr = false
      }
      prev = ch
      i++
      continue
    } else {
      if (ch === "'") {
        inStr = true
        prev = ch
        i++
        continue
      }
      if (ch === '(') level++
      else if (ch === ')') level = Math.max(0, level - 1)
      else if (ch === ';' && level === 0) {
        return {
          start,
          table,
          columns,
          valuesStart,
          statementEnd: i,
        }
      }
      i++
    }
  }
  return null
}

function transformValuesList(
  valuesSrc: string,
  table: string,
  colOrder: string[],
  colActions: Record<string, any>
): string {
  // Parse tuples separated by commas at top level
  const tuples: string[] = []
  let i = 0
  const n = valuesSrc.length
  while (i < n) {
    // Skip whitespace
    while (i < n && /\s/.test(valuesSrc[i])) i++
    if (i >= n) break
    if (valuesSrc[i] !== '(') {
      // Unexpected; bail out
      return valuesSrc
    }
    const start = i
    let level = 0
    let inStr = false
    let prev = ''
    while (i < n) {
      const ch = valuesSrc[i]
      if (inStr) {
        if (ch === "'" && prev !== '\\') {
          const next = i + 1 < n ? valuesSrc[i + 1] : ''
          if (next === "'") {
            i += 2
            prev = ''
            continue
          }
          inStr = false
        }
        prev = ch
        i++
        continue
      } else {
        if (ch === "'") {
          inStr = true
          prev = ch
          i++
          continue
        }
        if (ch === '(') level++
        else if (ch === ')') {
          level--
          if (level === 0) {
            i++
            break
          }
        }
        i++
      }
    }
    const tuple = valuesSrc.slice(start, i) // includes parentheses
    tuples.push(tuple)
    // Skip trailing spaces and comma
    while (i < n && /\s/.test(valuesSrc[i])) i++
    if (i < n && valuesSrc[i] === ',') i++
  }
  const transformed = tuples.map((t) =>
    transformSingleTuple(t, table, colOrder, colActions)
  )
  return transformed.join(',\n')
}

function transformSingleTuple(
  tupleSrc: string,
  table: string,
  colOrder: string[],
  colActions: Record<string, any>
): string {
  // Remove outer parentheses
  const inner = tupleSrc.slice(1, -1)
  const tokens = splitValues(inner)
  if (tokens.length !== colOrder.length) {
    // Column count mismatch; keep original
    return tupleSrc
  }
  const newTokens = tokens.map((tok, idx) => {
    const col = colOrder[idx]
    const action = colActions[col]
    if (!action || typeof action === 'string') return tok // no change
    if (action.action === 'update') {
      // Only transform string literals
      if (!tok.isString) return tok
      const original = tok.value
      const transformed = anonymizeByCharClass(original, `${table}.${col}`)
      return { ...tok, value: transformed }
    }
    // encryption removed
    return tok
  })
  // Rebuild tuple with proper quoting/escaping
  const rebuilt = newTokens
    .map((t) => (t.isString ? `'${sqlEscape(t.value)}'` : t.raw))
    .join(', ')
  return `(${rebuilt})`
}

type ValueToken =
  | { isString: true; value: string; raw: string }
  | { isString: false; value: null; raw: string }

function splitValues(src: string): ValueToken[] {
  const tokens: ValueToken[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++
    if (i >= n) break
    if (src[i] === "'") {
      // string
      i++
      let val = ''
      while (i < n) {
        const ch = src[i]
        if (ch === "'") {
          const next = i + 1 < n ? src[i + 1] : ''
          if (next === "'") {
            val += "'"
            i += 2
            continue
          }
          i++
          break
        }
        if (ch === '\\') {
          const next = i + 1 < n ? src[i + 1] : ''
          // Basic backslash escape
          val += next
          i += 2
          continue
        }
        val += ch
        i++
      }
      tokens.push({ isString: true, value: val, raw: `'${sqlEscape(val)}'` })
    } else {
      // non-string token up to comma
      const start = i
      while (i < n && src[i] !== ',') i++
      const raw = src.slice(start, i).trim()
      const upper = raw.toUpperCase()
      if (upper === 'NULL') {
        tokens.push({ isString: false, value: null, raw })
      } else {
        tokens.push({ isString: false, value: null, raw })
      }
    }
    while (i < n && /\s/.test(src[i])) i++
    if (i < n && src[i] === ',') i++
  }
  return tokens
}

function sqlEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''")
}

function anonymizeByCharClass(input: string, seedKey: string): string {
  const seed = hashString32(input + '|' + seedKey)
  const rng = mulberry32(seed)
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const code = ch.charCodeAt(0)
    if (code >= 48 && code <= 57) {
      // digit
      out += String.fromCharCode(48 + randomInt(rng, 0, 9))
    } else if (code >= 65 && code <= 90) {
      // upper
      out += String.fromCharCode(65 + randomInt(rng, 0, 25))
    } else if (code >= 97 && code <= 122) {
      // lower
      out += String.fromCharCode(97 + randomInt(rng, 0, 25))
    } else {
      out += ch
    }
  }
  return out
}

function hashString32(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

// encryption removed

function buildDumpSql(config: AppConfig): string {
  const lines: string[] = []
  lines.push('-- Anonymiser dump (basic)')
  lines.push('-- Generated at ' + new Date().toISOString())
  lines.push('')
  for (const [tableName, tableSpec] of Object.entries<any>(config.tables)) {
    if (typeof tableSpec === 'string') {
      if (tableSpec === 'truncate') {
        lines.push(`-- Truncate ${tableName} if it exists`)
        const safeName = tableName.replace(/'/g, "''")
        lines.push(`SET @tbl := '${safeName}';`)
        lines.push(
          "SET @exists := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = @tbl);"
        )
        lines.push(
          "SET @sql := IF(@exists > 0, CONCAT('TRUNCATE TABLE `', @tbl, '`'), 'SELECT 1');"
        )
        lines.push('PREPARE stmt FROM @sql;')
        lines.push('EXECUTE stmt;')
        lines.push('DEALLOCATE PREPARE stmt;')
        lines.push('')
      }
      continue
    }
    // Build UPDATE statements for 'update' actions
    const setClauses: string[] = []
    for (const [col, action] of Object.entries<any>(tableSpec)) {
      if (typeof action === 'string') {
        // ignore here (handled by truncate above if any)
        continue
      }
      if (action.action === 'update') {
        // Type-aware, random-looking, bounded to original length
        const expr = getTypeAwareExpression(col, tableName, String(action.type || 'text'))
        if (expr) {
          setClauses.push(`\`${col}\` = ${expr}`)
        }
      }
    }
    if (setClauses.length > 0) {
      lines.push(`-- Update columns for ${tableName}`)
      lines.push(`UPDATE \`${tableName}\` SET ${setClauses.join(', ')};`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

function getTypeAwareExpression(column: string, table: string, type: string): string {
  const len = `CHAR_LENGTH(\`${column}\`)`
  const base = `COALESCE(\`${column}\`, '')`
  const seed = `'::${table}.${column}::'`
  const hex = `LOWER(SHA2(CONCAT(${base}, ${seed}), 256))` // 64 hex chars
  // Map hex to digits (a-f -> 0-5)
  const hexToDigits =
    `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${hex},'a','0'),'b','1'),'c','2'),'d','3'),'e','4'),'f','5')`
  const digits = `REPEAT(${hexToDigits}, CEIL(${len}/64))`
  const randomSameLen = `LEFT(REPEAT(${hex}, CEIL(${len}/64)), ${len})`

  switch (type) {
    case 'email':
    case 'phone':
    case 'cnic':
    case 'firstName':
    case 'lastName':
    case 'fullName':
    case 'name':
    case 'ip':
    case 'text':
    case 'address':
    case 'city':
    case 'country':
      return randomizeByCharClass(column, table)
    case 'uuid': {
      // Always a valid UUID; if column is shorter it will truncate (rare for UUID columns)
      return `IF(\`${column}\` IS NULL, NULL, UUID())`
    }
    default: {
      return randomizeByCharClass(column, table)
    }
  }
}

function randomizeByCharClass(column: string, table: string): string {
  const base = `COALESCE(\`${column}\`, '')`
  const seed = `'::${table}.${column}::'`
  let expr = base
  // Use control-char-only markers to avoid interfering replacements
  const dOpen = 'CHAR(1)', dClose = 'CHAR(2)'
  const lOpen = 'CHAR(3)', lClose = 'CHAR(4)'
  const uOpen = 'CHAR(5)', uClose = 'CHAR(6)'
  // Mark digits
  for (let d = 0; d <= 9; d++) {
    expr = `REPLACE(${expr}, '${d}', CONCAT(${dOpen},'${d}',${dClose}))`
  }
  // Mark lowercase letters
  const lowers = 'abcdefghijklmnopqrstuvwxyz'
  for (let i = 0; i < lowers.length; i++) {
    const ch = lowers[i]
    expr = `REPLACE(${expr}, '${ch}', CONCAT(${lOpen},'${ch}',${lClose}))`
  }
  // Mark uppercase letters
  const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (let i = 0; i < uppers.length; i++) {
    const ch = uppers[i]
    expr = `REPLACE(${expr}, '${ch}', CONCAT(${uOpen},'${ch}',${uClose}))`
  }
  // Replace digit markers with new digits
  for (let d = 0; d <= 9; d++) {
    const marker = `CONCAT(${dOpen},'${d}',${dClose})`
    const mapped = `CHAR(ASCII('0') + (CONV(SUBSTRING(SHA2(CONCAT(${base}, ${seed}, 'D${d}'), 256), 1, 2), 16, 10) % 10))`
    expr = `REPLACE(${expr}, ${marker}, ${mapped})`
  }
  // Replace lowercase markers with new lowercase letters
  for (let i = 0; i < lowers.length; i++) {
    const ch = lowers[i]
    const marker = `CONCAT(${lOpen},'${ch}',${lClose})`
    const mapped = `CHAR(ASCII('a') + (CONV(SUBSTRING(SHA2(CONCAT(${base}, ${seed}, 'L${ch}'), 256), 1, 2), 16, 10) % 26))`
    expr = `REPLACE(${expr}, ${marker}, ${mapped})`
  }
  // Replace uppercase markers with new uppercase letters
  for (let i = 0; i < uppers.length; i++) {
    const ch = uppers[i]
    const marker = `CONCAT(${uOpen},'${ch}',${uClose})`
    const mapped = `CHAR(ASCII('A') + (CONV(SUBSTRING(SHA2(CONCAT(${base}, ${seed}, 'U${ch}'), 256), 1, 2), 16, 10) % 26))`
    expr = `REPLACE(${expr}, ${marker}, ${mapped})`
  }
  // Safety: ensure we never exceed original length in case of unforeseen expansion
  return `IF(\`${column}\` IS NULL, NULL, LEFT(${expr}, CHAR_LENGTH(\`${column}\`)))`
}

