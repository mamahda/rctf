import { config } from '@rctf/config'
import { createDatabase, submissions } from '@rctf/db'
import { BadBody, BadFlag, GoodFlag } from '@rctf/types'
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
import { uploadProvider } from '../../../../apps/api/src/providers/instances/uploads'
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
      solverFile: { name: string; url: string; size: number }
    }
    expect(details.solverFile).toMatchObject({ name: 'solve.py', size: 15 })
    expect(details.solverFile.url).toMatch(
      /^\/uploads\/submissions\/[0-9a-f-]{36}\/solve\.py$/
    )

    const key = decodeURIComponent(
      details.solverFile.url.replace('/uploads/', '')
    )
    expect((await uploadProvider.getFileInfo(key)).size).toBe(15)
    await uploadProvider.deleteFile(key)
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
