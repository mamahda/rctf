import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { bytea } from '../db-types'

// Solver proofs attached to flag submissions, stored once per file content.
// Kept out of the upload provider because uploads are served publicly.
export const submissionProofs = pgTable('submission_proofs', {
  sha256: text().primaryKey().notNull(),
  data: bytea('data').notNull(),
  size: integer().notNull(),
  contentType: text('content_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
})
