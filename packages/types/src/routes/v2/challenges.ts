import { z } from 'zod/mini'
import { Permissions } from '../../enums'
import { defineRoute } from '../../internal'
import {
  BadAlreadySolvedChallenge,
  BadBody,
  BadChallenge,
  BadEnded,
  BadFlag,
  BadNotStarted,
  BadPerms,
  BadRateLimit,
  BadReplayedRequest,
  BadSignature,
  BadToken,
  BadUnknownUser,
  GoodChallengeScoresV2,
  GoodChallengeSolvesV2,
  GoodChallengesV2,
  GoodDynamicScores,
  GoodFlag,
} from '../../responses'
import { FileFieldSchema } from '../../util'
import { example } from '../../util/example'
import { DynamicScoresPayloadSchema } from '../../util/schemas'

export const GetChallengesRouteV2 = defineRoute({
  publicAccess: ['challenges'],
  path: '/v2/challs',
  method: 'GET',
  goodResponses: [GoodChallengesV2],
  badResponses: [BadNotStarted, BadToken],
  authRequired: false,
  optionalAuth: true,
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

// intentionally has neither onlyWhenStarted nor onlyWhenNotFinished: a
// dynamic scoring backend must be able to seed scores before the event
// starts, and the leaderboard worker will drain any post-end deliveries into
// the final tally too
export const SubmitDynamicScoresRouteV2 = defineRoute({
  path: '/v2/challs/:id/scores',
  method: 'POST',
  goodResponses: [GoodDynamicScores],
  badResponses: [BadSignature, BadBody, BadReplayedRequest],
  authRequired: false,
  serviceAuth: 'dynamicChallenge',
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  body: DynamicScoresPayloadSchema,
})

// Which extra fields are accepted or required comes from `submissionFields` in the client config
export const SubmitFlagRouteV2 = defineRoute({
  path: '/v2/challs/:id/submit',
  method: 'POST',
  bodyFormat: 'form-data',
  body: z.object({
    flag: z
      .string()
      .check(z.maxLength(1024))
      .check(z.describe('Maximum length `1024`.')),
    aiChatLinks: z.optional(
      example(z.string(), 'https://chatgpt.com/share/...')
        .check(z.maxLength(24_576))
        .check(z.describe('AI chat share links, one HTTP(S) URL per line.'))
    ),
    didNotUseAi: z.optional(
      z
        .enum(['true', 'false'])
        .check(z.describe('`true` to declare that no AI was used.'))
    ),
    solverFile: z.optional(
      example(FileFieldSchema, '<binary solver file>').check(
        z.describe('Solver script or writeup used to get the flag.')
      )
    ),
  }),
  goodResponses: [GoodFlag],
  badResponses: [
    BadBody,
    BadFlag,
    BadPerms,
    BadNotStarted,
    BadEnded,
    BadChallenge,
    BadRateLimit,
    BadAlreadySolvedChallenge,
    BadUnknownUser,
    BadToken,
  ],
  authRequired: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsWrite,
  onlyWhenNotFinished: true,
})

export const GetChallengeSolvesRouteV2 = defineRoute({
  publicAccess: ['scoreboard', 'challenges'],
  path: '/v2/challs/:id/solves',
  method: 'GET',
  goodResponses: [GoodChallengeSolvesV2],
  badResponses: [BadNotStarted, BadChallenge, BadBody, BadToken],
  optionalAuth: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  query: z.object({
    // NOTE: Has max limits that are loaded from config
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(z.describe('Integer `>= 1`. Maximum enforced by config.')),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Integer `>= 0`.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})

export const GetChallengeScoresRouteV2 = defineRoute({
  publicAccess: ['scoreboard', 'challenges'],
  path: '/v2/challs/:id/scores',
  method: 'GET',
  goodResponses: [GoodChallengeScoresV2],
  badResponses: [BadNotStarted, BadChallenge, BadBody, BadToken],
  optionalAuth: true,
  params: z.object({
    id: z.string().check(z.describe('Challenge ID.')),
  }),
  query: z.object({
    // NOTE: Has max limits that are loaded from config
    limit: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(1))
      .check(z.describe('Integer `>= 1`. Maximum enforced by config.')),
    offset: z
      .pipe(z.coerce.number(), z.int())
      .check(z.gte(0))
      .check(z.describe('Integer `>= 0`.')),
  }),
  onlyWhenStarted: true,
  onlyWhenStartedPermissionsBypass: Permissions.challsRead,
})
