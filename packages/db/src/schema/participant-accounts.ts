import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

// Invited participants are assigned to a team by the organizer before claiming
// their account. A shared team credential cannot change that assignment.
export const participantAccounts = pgTable('participant_accounts', {
  nrp: text().primaryKey().notNull(),
  name: text().notNull(),
  assignedTeamId: text('assigned_team_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  inviteHash: text('invite_hash').notNull(),
  passwordHash: text('password_hash'),
  joined: boolean().notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
})
