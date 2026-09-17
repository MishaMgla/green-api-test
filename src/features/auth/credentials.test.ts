import { validateCredentials } from './credentials'

const VALID = {
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
}

describe('validateCredentials', () => {
  it('accepts a numeric instance ID and a token', () => {
    expect(validateCredentials(VALID)).toEqual({})
  })

  it('accepts instance IDs longer than ten digits', () => {
    expect(validateCredentials({ ...VALID, idInstance: '110100000123' })).toEqual({})
  })

  it.each(['', '11010a0001', '1101 000001', '+1101000001'])(
    'rejects the non-numeric instance ID %j',
    (idInstance) => {
      expect(validateCredentials({ ...VALID, idInstance })).toHaveProperty('idInstance')
    },
  )

  it('rejects an empty token', () => {
    expect(validateCredentials({ ...VALID, apiTokenInstance: '' })).toHaveProperty(
      'apiTokenInstance',
    )
  })

})
