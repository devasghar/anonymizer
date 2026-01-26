import { z } from 'zod'

export const DatabaseSchema = z.object({
  type: z.enum(['mysql', 'postgres']).default('mysql'),
  mode: z.enum(['dump', 'direct']).default('dump'),
  url: z.string().optional(),
  dumpFile: z.string().optional(),
})

export const ColumnActionSchema = z.union([
  z.literal('truncate'),
  z.object({
    action: z.literal('update'),
    type: z.string(),
  }),
  z.object({
    action: z.literal('encrypt'),
    algorithm: z.literal('aes-256-gcm'),
    keyEnv: z.string(),
  }),
])

export const ConfigSchema = z.object({
  database: DatabaseSchema,
  output: z.object({
    file: z.string().default('./anonymised.sql.gz'),
  }),
  tables: z.record(z.any()),
})
