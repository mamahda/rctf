import { config } from '@rctf/config'
import { createDatabase, submissions, submissionProofs } from '@rctf/db'
import {
  BadBody,
  BadPerms,
  BadUnknownSubmission,
  GoodAdminSubmissionUpdated,
  Permissions,
  SubmissionKind,
  SubmissionResult,
} from '@rctf/types'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { uploadProvider } from '../../../../apps/api/src/providers/instances/uploads'
import { getApp, request } from '../../app'
import {
  clearDatabase,
  expectResponse,
  generateAuthToken,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

let app: Hono<any>
const getDb = () => createDatabase(config.database.sql).db

beforeAll(async () => {
  app = await getApp()
})

beforeEach(async () => {
  await clearDatabase()
})

const adminToken = async (
  perms = Permissions.usersWrite | Permissions.challsRead
) => {
  const admin = await generateRealTestUser(perms)
  return {
    adminId: admin.user.id,
    token: await generateAuthToken(admin.user.id),
  }
}

const createFlagSubmission = async (
  details: Record<string, unknown>,
  kind = SubmissionKind.FLAG
) => {
  const team = await generateRealTestUser()
  const challenge = await generateChallenge()
  const id = crypto.randomUUID()
  await getDb().insert(submissions).values({
    id,
    kind,
    challengeId: challenge.challenge.id,
    userId: team.user.id,
    ip: '203.0.113.7',
    result: SubmissionResult.CORRECT,
    details,
  })
  return id
}

const patchSubmission = (
  token: string,
  id: string,
  body: Record<string, unknown>
) =>
  request(app, `/api/v2/admin/submissions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

const storedDetails = async (id: string) => {
  const [row] = await getDb()
    .select({ details: submissions.details })
    .from(submissions)
    .where(eq(submissions.id, id))
  return row!.details
}

describe('admin submission update', () => {
  test('private proof requires admin permission', async () => {
    const { token } = await adminToken()
    const ordinary = await adminToken(0)
    const sha256 = 'a'.repeat(64)
    await getDb()
      .insert(submissionProofs)
      .values({
        sha256,
        data: Buffer.from('private proof'),
        size: 13,
        contentType: 'text/plain',
      })
      .onConflictDoNothing()
    const id = await createFlagSubmission({
      solverFile: { sha256, name: 'proof.txt', size: 13 },
    })
    const url = `/api/v2/admin/submissions/${id}/proof`
    const denied = await request(app, url, {
      headers: { Authorization: `Bearer ${ordinary.token}` },
    })
    await expectResponse(denied, BadPerms)
    const response = await request(app, url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { data: string } }
    expect(Buffer.from(body.data.data, 'base64').toString()).toBe(
      'private proof'
    )
  })

  test('edits the extra fields and records who edited them', async () => {
    const { adminId, token } = await adminToken()
    const id = await createFlagSubmission({
      submittedFlag: 'flag{x}',
      aiChatLinks: ['https://chatgpt.com/share/old'],
    })

    const res = await patchSubmission(token, id, {
      aiChatLinks: ['https://claude.ai/share/new'],
      adminNote: '  checked the chat  ',
    })
    await expectResponse(res, GoodAdminSubmissionUpdated)

    const details = await storedDetails(id)
    expect(details).toMatchObject({
      submittedFlag: 'flag{x}',
      aiChatLinks: ['https://claude.ai/share/new'],
      adminNote: 'checked the chat',
      adminEditedBy: adminId,
    })
    expect(typeof details.adminEditedAt).toBe('string')

    await expectResponse(
      await patchSubmission(token, id, { aiChatLinks: [], adminNote: null }),
      GoodAdminSubmissionUpdated
    )
    const cleared = await storedDetails(id)
    expect(cleared).not.toHaveProperty('aiChatLinks')
    expect(cleared).not.toHaveProperty('adminNote')
  })

  test('deletes the stored solver file', async () => {
    const { token } = await adminToken()
    const key = `submissions/${crypto.randomUUID()}/solve.py`
    const url = await uploadProvider.uploadFile(Buffer.from('pwn'), key)
    const id = await createFlagSubmission({
      solverFile: { name: 'solve.py', url, size: 3 },
    })

    await expectResponse(
      await patchSubmission(token, id, { removeSolverFile: true }),
      GoodAdminSubmissionUpdated
    )

    expect(await storedDetails(id)).not.toHaveProperty('solverFile')
    expect((await uploadProvider.getFileInfo(key)).url).toBeNull()
  })

  test('deletes a private proof without deleting another proof with the same content', async () => {
    const { token } = await adminToken()
    const first = 'b'.repeat(64)
    const second = 'c'.repeat(64)
    await getDb()
      .insert(submissionProofs)
      .values([
        {
          sha256: first,
          data: Buffer.from('pwn'),
          size: 3,
          contentType: 'text/plain',
        },
        {
          sha256: second,
          data: Buffer.from('pwn'),
          size: 3,
          contentType: 'text/plain',
        },
      ])
      .onConflictDoNothing()
    const id = await createFlagSubmission({
      solverFile: { sha256: first, name: 'solve.py', size: 3 },
    })
    await expectResponse(
      await patchSubmission(token, id, { removeSolverFile: true }),
      GoodAdminSubmissionUpdated
    )
    expect(await storedDetails(id)).not.toHaveProperty('solverFile')
    expect(
      await getDb()
        .select()
        .from(submissionProofs)
        .where(eq(submissionProofs.sha256, first))
    ).toHaveLength(0)
    expect(
      await getDb()
        .select()
        .from(submissionProofs)
        .where(eq(submissionProofs.sha256, second))
    ).toHaveLength(1)
  })

  test('rejects links together with the no-AI declaration', async () => {
    const { token } = await adminToken()
    const id = await createFlagSubmission({ didNotUseAi: true })

    await expectResponse(
      await patchSubmission(token, id, {
        aiChatLinks: ['https://chatgpt.com/share/a'],
      }),
      BadBody
    )
    expect(await storedDetails(id)).toEqual({ didNotUseAi: true })
  })

  test('rejects links that are not HTTP(S) URLs', async () => {
    const { token } = await adminToken()
    const id = await createFlagSubmission({})

    await expectResponse(
      await patchSubmission(token, id, {
        aiChatLinks: ['javascript:alert(1)'],
      }),
      BadBody
    )
  })

  test('only edits flag submissions', async () => {
    const { token } = await adminToken()
    const id = await createFlagSubmission({}, SubmissionKind.ADMIN_BOT)

    await expectResponse(
      await patchSubmission(token, id, { adminNote: 'x' }),
      BadUnknownSubmission
    )
    await expectResponse(
      await patchSubmission(token, crypto.randomUUID(), { adminNote: 'x' }),
      BadUnknownSubmission
    )
  })

  test('requires admin permissions', async () => {
    const { token } = await adminToken(Permissions.challsRead)
    const id = await createFlagSubmission({})

    await expectResponse(
      await patchSubmission(token, id, { adminNote: 'x' }),
      BadPerms
    )
  })
})
