import { validateCredentials } from './credentials'

const VALID = {
  apiUrl: 'https://api.green-api.com',
  idInstance: '1101000001',
  apiTokenInstance: '<apiTokenInstance>',
}

describe('validateCredentials', () => {
  it('accepts a dashboard origin with a numeric instance ID', () => {
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

  it.each([
    'http://api.green-api.com',
    'https://api.green-api.com/waInstance1101000001',
    'https://user:pass@api.green-api.com',
    'https://api.green-api.com?token=x',
    'not a url',
  ])('rejects the API URL %j', (apiUrl) => {
    expect(validateCredentials({ ...VALID, apiUrl })).toHaveProperty('apiUrl')
  })
})
