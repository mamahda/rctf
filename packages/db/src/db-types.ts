import { customType } from 'drizzle-orm/pg-core'

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

// postgres-js returns Buffers for bytea; pglite returns Uint8Arrays.
export const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType() {
    return 'bytea'
  },
  fromDriver(value) {
    return Buffer.from(value)
  },
})
