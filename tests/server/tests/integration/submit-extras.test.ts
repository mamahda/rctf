import { config } from '@rctf/config'
import { createDatabase, submissions, submissionProofs } from '@rctf/db'
import {
  BadAlreadySolvedChallenge,
  BadBody,
  BadFlag,
  GoodFlag,
} from '@rctf/types'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import { desc, eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { createToken, TokenKind } from '../../../../apps/api/src/lib/tokens'
import { getApp, request } from '../../app'
import {
  expectResponse,
  generateChallenge,
  generateRealTestUser,
} from '../../util'

let app: Hono<any>
let challengeData: Awaited<ReturnType<typeof generateChallenge>>
const cleanups: (() => Promise<void>)[] = []
const originalFields = { ...config.submissionFields }
const getDb = () => createDatabase(config.database.sql).db

beforeAll(async () => {
  app = await getApp()
  challengeData = await generateChallenge()
})

afterEach(() => {
  Object.assign(config.submissionFields, originalFields)
})

afterAll(async () => {
  for (const cleanup of cleanups) {
    await cleanup()
  }
  await challengeData.cleanup()
})

const newUser = async () => {
  const userData = await generateRealTestUser()
  cleanups.push(userData.cleanup)
  return userData.user
}

const submitV2 = async (
  userId: string,
  fields: Record<string, string | File>
) => {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value)
  }
  const authToken = await createToken(TokenKind.Auth, userId)
  return await request(
    app,
    `/api/v2/challs/${encodeURIComponent(challengeData.challenge.id)}/submit`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body,
    }
  )
}

const latestDetails = async (userId: string) => {
  const [row] = await getDb()
    .select({ details: submissions.details })
    .from(submissions)
    .where(eq(submissions.userId, userId))
    .orderBy(desc(submissions.createdAt))
    .limit(1)
  return row!.details
}

describe('submit extras', () => {
  test('accepts a plain flag when the fields are off', async () => {
    const user = await newUser()
    const res = await submitV2(user.id, {
      flag: challengeData.challenge.flag,
      aiChatLinks: 'https://chatgpt.com/share/ignored',
    })

    await expectResponse(res, GoodFlag)
    expect(await latestDetails(user.id)).not.toHaveProperty('aiChatLinks')
  })

  test('requires AI chat links or the no-AI declaration', async () => {
    config.submissionFields.aiChatLinks = 'required'
    const user = await newUser()

    await expectResponse(
      await submitV2(user.id, { flag: challengeData.challenge.flag }),
      BadBody
    )

    await expectResponse(
      await submitV2(user.id, {
        flag: challengeData.challenge.flag,
        didNotUseAi: 'true',
      }),
      GoodFlag
    )
    expect(await latestDetails(user.id)).toMatchObject({ didNotUseAi: true })
  })

  test('rejects AI chat links that are not HTTP(S) URLs', async () => {
    config.submissionFields.aiChatLinks = 'optional'
    const user = await newUser()

    await expectResponse(
      await submitV2(user.id, {
        flag: challengeData.challenge.flag,
        aiChatLinks: 'https://chatgpt.com/share/a\njavascript:alert(1)',
      }),
      BadBody
    )
  })

  test('records AI chat links on incorrect submissions', async () => {
    config.submissionFields.aiChatLinks = 'optional'
    const user = await newUser()

    await expectResponse(
      await submitV2(user.id, {
        flag: 'wrong',
        aiChatLinks:
          ' https://chatgpt.com/share/a \n\nhttps://claude.ai/share/b',
      }),
      BadFlag
    )
    expect(await latestDetails(user.id)).toMatchObject({
      aiChatLinks: ['https://chatgpt.com/share/a', 'https://claude.ai/share/b'],
    })
  })

  test('stores the solver file of a solve', async () => {
    config.submissionFields.solverFile = 'required'
    const user = await newUser()

    await expectResponse(
      await submitV2(user.id, { flag: challengeData.challenge.flag }),
      BadBody
    )

    const res = await submitV2(user.id, {
      flag: challengeData.challenge.flag,
      solverFile: new File(['print("pwned")\n'], 'solve.py'),
    })
    await expectResponse(res, GoodFlag)

    const details = (await latestDetails(user.id)) as {
      solverFile: { name: string; sha256: string; size: number }
    }
    expect(details.solverFile).toMatchObject({ name: 'solve.py', size: 15 })
    const [proof] = await getDb()
      .select()
      .from(submissionProofs)
      .where(eq(submissionProofs.sha256, details.solverFile.sha256))
    expect(proof.data.toString()).toBe('print("pwned")\n')
    expect(details.solverFile).not.toHaveProperty('url')
  })

  test('stores a solver file for incorrect submissions', async () => {
    config.submissionFields.solverFile = 'optional'
    const user = await newUser()
    await expectResponse(
      await submitV2(user.id, {
        flag: 'wrong',
        solverFile: new File(['proof'], 'proof.txt'),
      }),
      BadFlag
    )
    const details = (await latestDetails(user.id)) as {
      solverFile: { sha256: string }
    }
    const [proof] = await getDb()
      .select()
      .from(submissionProofs)
      .where(eq(submissionProofs.sha256, details.solverFile.sha256))
    expect(proof.data.toString()).toBe('proof')
  })

  test('stores solver files for already-solved submissions', async () => {
    config.submissionFields.solverFile = 'optional'
    const user = await newUser()
    await expectResponse(
      await submitV2(user.id, { flag: challengeData.challenge.flag }),
      GoodFlag
    )
    await expectResponse(
      await submitV2(user.id, {
        flag: challengeData.challenge.flag,
        solverFile: new File(['retry'], 'retry.py'),
      }),
      BadAlreadySolvedChallenge
    )
    const details = (await latestDetails(user.id)) as {
      solverFile: { sha256: string }
    }
    const [proof] = await getDb()
      .select()
      .from(submissionProofs)
      .where(eq(submissionProofs.sha256, details.solverFile.sha256))
    expect(proof.data.toString()).toBe('retry')
  })

  test('rejects solver files over the size limit', async () => {
    config.submissionFields.solverFile = 'optional'
    config.submissionFields.maxSolverFileSize = 4
    const user = await newUser()

    await expectResponse(
      await submitV2(user.id, {
        flag: challengeData.challenge.flag,
        solverFile: new File(['12345'], 'solve.py'),
      }),
      BadBody
    )
  })

  test('v1 rejects submissions when an extra field is required', async () => {
    config.submissionFields.solverFile = 'required'
    const user = await newUser()
    const authToken = await createToken(TokenKind.Auth, user.id)

    const res = await request(
      app,
      `/api/v1/challs/${encodeURIComponent(challengeData.challenge.id)}/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ flag: challengeData.challenge.flag }),
      }
    )

    await expectResponse(res, BadBody)
  })
})
