import { config } from '@rctf/config'
import type { Hono } from 'hono'
import type { AppEnv, ApiContext } from '../lib/app-env'
import { createToken, parseToken, TokenKind } from '../lib/tokens'
import {
  authenticateParticipant,
  getParticipant,
  joinAssignedTeam,
  registerParticipant,
} from '../services/participant-accounts'
import { getUser } from '../services/users'

const message = (kind: string, message: string) => ({ kind, message })
const invalid = message(
  'badParticipantCredentials',
  'NRP or password is invalid, or the NRP is already registered.'
)
const unauthorized = message(
  'badParticipantToken',
  'Please sign in with your participant account.'
)

const readBody = async (ctx: ApiContext): Promise<Record<string, unknown>> => {
  try {
    const reader = ctx.req.raw.body?.getReader()
    if (!reader) return {}
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) {
        await reader.cancel()
        return {}
      }
      chunks.push(value)
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const playerFromRequest = async (ctx: ApiContext) => {
  const authorization = ctx.req.header('Authorization')
  if (!authorization?.startsWith('Bearer ')) return undefined
  const nrp = await parseToken(TokenKind.Participant, authorization.slice(7))
  return nrp ? getParticipant(ctx.var.db, nrp) : undefined
}

const allowedAttempt = async (ctx: ApiContext, action: string, nrp: string) => {
  const ipResult = await ctx.var.redis.rctfRateLimit(
    `participant:${action}:ip:${ctx.var.ip}`,
    '100',
    '600000'
  )
  const nrpResult = await ctx.var.redis.rctfRateLimit(
    `participant:${action}:nrp:${nrp}`,
    '6',
    '600000'
  )
  return ipResult === -1 && nrpResult === -1
}

export const registerParticipantRoutes = (app: Hono<AppEnv>) => {
  app.post('/api/v2/participants/register', async ctx => {
    if (!config.individualAuthEnabled)
      return ctx.json(message('badEndpoint', 'Not available.'), 404)
    const body = await readBody(ctx)
    const { nrp, password } = body
    if (
      typeof nrp !== 'string' ||
      typeof password !== 'string' ||
      !/^\d{10}$/.test(nrp) ||
      password.length > 128
    )
      return ctx.json(invalid, 400)
    if (!(await allowedAttempt(ctx, 'register', nrp)))
      return ctx.json(
        message('badRateLimit', 'Too many attempts. Try again later.'),
        429
      )
    if (
      !(await registerParticipant(ctx.var.db, {
        nrp,
        password,
      }))
    )
      return ctx.json(invalid, 400)
    return ctx.json(
      message('goodParticipantRegistered', 'Account created. Please log in.'),
      200
    )
  })

  app.post('/api/v2/participants/login', async ctx => {
    if (!config.individualAuthEnabled)
      return ctx.json(message('badEndpoint', 'Not available.'), 404)
    const { nrp, password } = await readBody(ctx)
    if (
      typeof nrp !== 'string' ||
      typeof password !== 'string' ||
      !/^\d{10}$/.test(nrp) ||
      password.length > 128
    )
      return ctx.json(invalid, 400)
    if (!(await allowedAttempt(ctx, 'login', nrp)))
      return ctx.json(
        message('badRateLimit', 'Too many attempts. Try again later.'),
        429
      )
    if (!(await authenticateParticipant(ctx.var.db, nrp, password)))
      return ctx.json(invalid, 401)
    const token = await createToken(TokenKind.Participant, nrp)
    const participant = await getParticipant(ctx.var.db, nrp)
    return ctx.json(
      {
        kind: 'goodParticipantLogin',
        data: { token, joined: participant?.joined === true },
      },
      200
    )
  })

  app.get('/api/v2/participants/me', async ctx => {
    if (!config.individualAuthEnabled)
      return ctx.json(message('badEndpoint', 'Not available.'), 404)
    const participant = await playerFromRequest(ctx)
    if (!participant?.passwordHash) return ctx.json(unauthorized, 401)
    const team = participant.joined
      ? await getUser(ctx.var.db, participant.assignedTeamId)
      : undefined
    return ctx.json(
      {
        kind: 'goodParticipantSelf',
        data: {
          nrp: participant.nrp,
          name: participant.name,
          joined: participant.joined,
          team: team?.name ?? null,
        },
      },
      200
    )
  })

  app.post('/api/v2/participants/join', async ctx => {
    if (!config.individualAuthEnabled)
      return ctx.json(message('badEndpoint', 'Not available.'), 404)
    const participant = await playerFromRequest(ctx)
    if (!participant?.passwordHash) return ctx.json(unauthorized, 401)
    const { teamToken } = await readBody(ctx)
    if (typeof teamToken !== 'string' || teamToken.length > 2048)
      return ctx.json(invalid, 400)
    if (!(await allowedAttempt(ctx, 'join', participant.nrp)))
      return ctx.json(
        message('badRateLimit', 'Too many attempts. Try again later.'),
        429
      )
    const teamId = await parseToken(TokenKind.Team, teamToken)
    if (
      !teamId ||
      !(await joinAssignedTeam(ctx.var.db, participant.nrp, teamId))
    )
      return ctx.json(
        message('badTeamCode', 'This team code is not valid for your account.'),
        400
      )
    return ctx.json(
      message('goodParticipantJoined', 'You joined your assigned team.'),
      200
    )
  })
}
