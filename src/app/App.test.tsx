import { render, screen } from '@testing-library/react'
import { App } from './App'

test('mounts the application', () => {
  render(<App />)
  expect(screen.getByText('GREEN-API MAX chat')).toBeVisible()
})
