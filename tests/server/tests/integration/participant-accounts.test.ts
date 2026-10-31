import { config } from '@rctf/config'
import { createDatabase, participantAccounts, submissions } from '@rctf/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Hono } from 'hono'
import { createToken, TokenKind } from '../../../../apps/api/src/lib/tokens'
import { hashInvitation } from '../../../../apps/api/src/services/participant-accounts'
import { getApp, request } from '../../app'
import { generateChallenge, generateRealTestUser } from '../../util'
let app: Hono<any>
const db = () => createDatabase(config.database.sql).db
let team: Awaited<ReturnType<typeof generateRealTestUser>>
let other: Awaited<ReturnType<typeof generateRealTestUser>>
let challenge: Awaited<ReturnType<typeof generateChallenge>>
const nrp = '5025261249'
const invitationCode = 'test-invitation-unique-1234567890'
const password = 'a sufficiently long password'
let participantToken: string
let teamToken: string
let legacyAuthToken: string
const original = config.individualAuthEnabled
const api = (path: string, body?: unknown, token?: string) =>
  request(app, `/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
beforeAll(async () => {
  app = await getApp()
  config.individualAuthEnabled = true
  team = await generateRealTestUser()
  other = await generateRealTestUser()
  challenge = await generateChallenge()
  teamToken = await createToken(TokenKind.Team, team.user.id)
  legacyAuthToken = await createToken(TokenKind.Auth, team.user.id)
  await db()
    .insert(participantAccounts)
    .values({
      nrp,
      name: 'Test Participant',
      assignedTeamId: team.user.id,
      inviteHash: hashInvitation(invitationCode),
    })
})
afterAll(async () => {
  config.individualAuthEnabled = original
  await db().delete(participantAccounts).where(eq(participantAccounts.nrp, nrp))
  await team.cleanup()
  await other.cleanup()
  await challenge.cleanup()
})
describe('individual participant accounts', () => {
  test('registration requires an invitation and it can only be claimed once', async () => {
    expect(
      (
        await api('/v2/participants/register', {
          nrp,
          invitationCode: 'wrong',
          password,
        })
      ).status
    ).toBe(400)
    expect(
      (
        await api('/v2/participants/register', {
          nrp,
          invitationCode,
          password: 'short',
        })
      ).status
    ).toBe(400)
    expect(
      (
        await api('/v2/participants/register', {
          nrp,
          invitationCode,
          password,
        })
      ).status
    ).toBe(200)
    expect(
      (
        await api('/v2/participants/register', {
          nrp,
          invitationCode,
          password,
        })
      ).status
    ).toBe(400)
  })
  test('rejects uninvited NRPs and makes simultaneous claims atomic', async () => {
    const otherNrp = '1234567890'
    await db()
      .insert(participantAccounts)
      .values({
        nrp: otherNrp,
        name: 'Second Participant',
        assignedTeamId: team.user.id,
        inviteHash: hashInvitation(invitationCode),
      })
    try {
      expect(
        (
          await api('/v2/participants/register', {
            nrp: '0000000000',
            invitationCode,
            password,
          })
        ).status
      ).toBe(400)
      const attempts = await Promise.all([
        api('/v2/participants/register', {
          nrp: otherNrp,
          invitationCode,
          password,
        }),
        api('/v2/participants/register', {
          nrp: otherNrp,
          invitationCode,
          password,
        }),
      ])
      expect(attempts.map(r => r.status).sort()).toEqual([200, 400].sort())
    } finally {
      await db()
        .delete(participantAccounts)
        .where(eq(participantAccounts.nrp, otherNrp))
    }
  })
  test('login and joining only the assigned team', async () => {
    expect(
      (await api('/v2/participants/login', { nrp, password: 'wrong' })).status
    ).toBe(401)
    const login = (await (
      await api('/v2/participants/login', { nrp, password })
    ).json()) as { data: { token: string; joined: boolean } }
    participantToken = login.data.token
    expect(login.data.joined).toBe(false)
    expect(
      (await api('/v2/users/me', undefined, participantToken)).status
    ).toBe(401)
    const wrongToken = await createToken(TokenKind.Team, other.user.id)
    expect(
      (
        await api(
          '/v2/participants/join',
          { teamToken: wrongToken },
          participantToken
        )
      ).status
    ).toBe(400)
    expect(
      (await api('/v2/participants/join', { teamToken }, participantToken))
        .status
    ).toBe(200)
    const me = (await (
      await api('/v2/users/me', undefined, participantToken)
    ).json()) as { data: { name: string; teamToken: string } }
    expect(me.data.name).toBe(team.user.name)
    expect(me.data.teamToken).toBe('')
  })
  test('blocks legacy team token and old non-admin sessions', async () => {
    expect((await api('/v1/auth/login', { teamToken })).status).toBe(401)
    expect(
      (await api('/v2/auth/verify', { verifyToken: teamToken })).status
    ).toBe(401)
    expect((await api('/v2/users/me', undefined, legacyAuthToken)).status).toBe(
      401
    )
  })
  test('keeps organizer accounts able to log in using the existing team token', async () => {
    const admin = await generateRealTestUser(63)
    try {
      const adminTeamToken = await createToken(TokenKind.Team, admin.user.id)
      const login = await api('/v1/auth/login', { teamToken: adminTeamToken })
      expect(login.status).toBe(200)
      const data = (await login.json()) as { data: { authToken: string } }
      expect(
        (await api('/v2/users/me', undefined, data.data.authToken)).status
      ).toBe(200)
    } finally {
      await admin.cleanup()
    }
  })
  test('submission records the individual and keeps team scoring identity', async () => {
    const form = new FormData()
    form.append('flag', 'wrong')
    const response = await request(
      app,
      `/api/v2/challs/${challenge.challenge.id}/submit`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${participantToken}` },
        body: form,
      }
    )
    expect(response.status).toBe(400)
    const [submission] = await db()
      .select()
      .from(submissions)
      .where(eq(submissions.userId, team.user.id))
    expect(submission.details.participant).toEqual({
      nrp,
      name: 'Test Participant',
    })
    for (const [flag, expectedKind] of [
      [challenge.challenge.flag, 'goodFlag'],
      [challenge.challenge.flag, 'badAlreadySolvedChallenge'],
    ]) {
      const form = new FormData()
      form.append('flag', flag)
      const result = await request(
        app,
        `/api/v2/challs/${challenge.challenge.id}/submit`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${participantToken}` },
          body: form,
        }
      )
      expect((await result.json()).kind).toBe(expectedKind)
    }
    const entries = await db()
      .select()
      .from(submissions)
      .where(eq(submissions.userId, team.user.id))
    expect(entries).toHaveLength(3)
    for (const entry of entries)
      expect(entry.details.participant).toEqual({
        nrp,
        name: 'Test Participant',
      })
  })
})
