#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import { z } from 'zod'
import { ConfigSchema, ColumnActionSchema } from './config/schema.js'

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

      if (typeof result.data !== 'string' && result.data.action === 'encrypt') {
        const keyName = result.data.keyEnv
        const key = process.env[keyName]
        if (!key) {
          throw new Error(
            `Encryption key env "${keyName}" is not set for "${tableName}.${columnName}"`
          )
        }
      }
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
    console.log(chalk.yellow('Direct mode execution is not yet implemented.'))
    // Future: connect using config.database.url and perform updates
  } else {
    console.log(
      chalk.yellow(
        `Dump mode execution is not yet implemented. Target file: ${config.output.file}`
      )
    )
    // Future: read from dump or url, transform rows, write gzipped SQL
  }
}
