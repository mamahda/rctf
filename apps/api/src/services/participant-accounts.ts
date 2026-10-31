import { participantAccounts, type DatabaseClient } from '@rctf/db'
import { and, eq, isNull } from 'drizzle-orm'
import { timingSafeEqual } from 'node:crypto'

export const hashInvitation = (code: string): string =>
  new Bun.SHA256().update(code).digest('hex')

const matchesInvitation = (actualHash: string, code: string): boolean => {
  const expected = Buffer.from(actualHash, 'hex')
  const actual = Buffer.from(hashInvitation(code), 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export const getParticipant = async (db: DatabaseClient, nrp: string) => {
  const [participant] = await db
    .select()
    .from(participantAccounts)
    .where(eq(participantAccounts.nrp, nrp))
    .limit(1)
  return participant
}

// The conditional update ensures two simultaneous claims cannot both succeed.
export const registerParticipant = async (
  db: DatabaseClient,
  params: {
    nrp: string
    inviteCode: string
    password: string
  }
): Promise<boolean> => {
  if (
    !/^\d{10}$/.test(params.nrp) ||
    params.password.length < 12 ||
    params.password.length > 128 ||
    params.inviteCode.length > 128
  )
    return false
  const participant = await getParticipant(db, params.nrp)
  if (
    !participant ||
    participant.passwordHash ||
    !matchesInvitation(participant.inviteHash, params.inviteCode)
  )
    return false
  const passwordHash = await Bun.password.hash(params.password, {
    algorithm: 'argon2id',
  })
  const updated = await db
    .update(participantAccounts)
    .set({ passwordHash })
    .where(
      and(
        eq(participantAccounts.nrp, params.nrp),
        isNull(participantAccounts.passwordHash)
      )
    )
    .returning({ nrp: participantAccounts.nrp })
  return updated.length === 1
}

export const authenticateParticipant = async (
  db: DatabaseClient,
  nrp: string,
  password: string
): Promise<boolean> => {
  if (!/^\d{10}$/.test(nrp) || password.length > 128) return false
  const participant = await getParticipant(db, nrp)
  return (
    !!participant?.passwordHash &&
    (await Bun.password.verify(password, participant.passwordHash))
  )
}

export const joinAssignedTeam = async (
  db: DatabaseClient,
  nrp: string,
  teamId: string
): Promise<boolean> => {
  const updated = await db
    .update(participantAccounts)
    .set({ joined: true })
    .where(
      and(
        eq(participantAccounts.nrp, nrp),
        eq(participantAccounts.assignedTeamId, teamId)
      )
    )
    .returning({ nrp: participantAccounts.nrp })
  return updated.length === 1
}
