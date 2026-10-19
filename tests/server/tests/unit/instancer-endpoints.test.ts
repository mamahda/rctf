import type { Challenge } from '@rctf/db'
import { ExposeKind, InstanceStatus } from '@rctf/types'
import { describe, expect, test } from 'bun:test'
import { filterInstanceEndpoints } from '../../../../apps/api/src/services/instancer'

const challengeWithExpose = (
  expose: { shouldDisplay?: boolean; title?: string }[]
): Challenge =>
  ({
    id: 'chall',
    data: {
      instancerConfig: {
        challengeIntegrationId: 'chall',
        config: {},
        timeoutMilliseconds: 600_000,
        expose: expose.map((e, i) => ({
          kind: ExposeKind.TCP,
          hostPrefix: `p${i}`,
          containerName: 'app',
          containerPort: 1337,
          ...e,
        })),
      },
    },
  }) as unknown as Challenge

const details = (count: number) => ({
  kind: 'instancerInstanceDetails' as const,
  status: InstanceStatus.RUNNING,
  timeLeftMilliseconds: 1000,
  endpoints: Array.from({ length: count }, (_, i) => ({
    kind: ExposeKind.TCP,
    host: '203.0.113.10',
    port: 30000 + i,
  })),
})

describe('filterInstanceEndpoints', () => {
  test('shows endpoints whose expose entry leaves shouldDisplay unset', () => {
    const result = filterInstanceEndpoints(
      details(3),
      challengeWithExpose([{}, { shouldDisplay: false }, { title: 'nc' }])
    )

    expect(
      result.kind === 'instancerInstanceDetails' &&
        result.endpoints?.map(e => [e.port, e.title])
    ).toEqual([
      [30000, undefined],
      [30002, 'nc'],
    ])
  })

  test('hides endpoints without a matching expose entry', () => {
    const result = filterInstanceEndpoints(
      details(2),
      challengeWithExpose([{}])
    )

    expect(
      result.kind === 'instancerInstanceDetails' &&
        result.endpoints?.map(e => e.port)
    ).toEqual([30000])
  })
})
