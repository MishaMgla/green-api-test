import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'
import { Conversation } from './ChatWindow'
import { Sidebar } from './Sidebar'
import type { Message } from '../entities/conversation/conversation'

const message = (id: string): Message => ({ id, text: id, outgoing: false, timestamp: 1000 })

test('chat search uses names and IDs without losing selection, and broken photos show initials', () => {
  const onSelect = vi.fn()
  render(<Sidebar chats={[
    { id: '123', name: 'Анна Иванова', messages: [], avatarUrl: 'https://example.com/photo.jpg' },
    { id: '456', name: 'Борис', messages: [] },
  ]} selectedId="123" onSelect={onSelect} onChangeCredentials={() => {}} />)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск чатов' }), { target: { value: 'ИВАНОВА' } })
  expect(screen.queryByRole('button', { name: /Борис/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Анна Иванова/ }))
  expect(onSelect).toHaveBeenCalledWith('123')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '456' } })
  expect(screen.getByRole('button', { name: /Борис/ })).toBeInTheDocument()

  const { container, rerender } = render(<Avatar id="123" name="Анна Иванова" size="sm" url="https://example.com/broken.jpg" />)
  fireEvent.error(container.querySelector('img')!)
  expect(container.querySelector('img')).toBeNull()
  expect(container).toHaveTextContent('АИ')
  rerender(<Avatar id="123" name="Анна Иванова" size="sm" url="https://example.com/new.jpg" />)
  expect(container.querySelector('img')).toHaveAttribute('src', 'https://example.com/new.jpg')
})

test('prepending history preserves the visible message', () => {
  let scrollHeight = 800
  const { rerender } = render(<Conversation messages={[message('middle'), message('last')]} />)
  const log = screen.getByRole('log')
  Object.defineProperty(log, 'scrollHeight', { get: () => scrollHeight })
  log.scrollTop = 200
  fireEvent.scroll(log)
  // Record measured history height before the provider returns the next page.
  rerender(<Conversation messages={[message('middle'), message('last')]} />)
  scrollHeight = 1200
  rerender(<Conversation messages={[message('first'), message('middle'), message('last')]} />)
  expect(log.scrollTop).toBe(600)
})

test('history has one Russian date separator for each calendar day', () => {
  const firstDay = new Date(2026, 8, 17, 12).getTime()
  const nextDay = new Date(2026, 8, 18, 12).getTime()
  render(<Conversation messages={[
    { ...message('first'), timestamp: firstDay },
    { ...message('second'), timestamp: firstDay + 1000 },
    { ...message('third'), timestamp: nextDay },
  ]} />)
  expect(screen.getAllByText('17 сентября 2026 г.')).toHaveLength(1)
  expect(screen.getAllByText('18 сентября 2026 г.')).toHaveLength(1)
})

test('incoming messages respect the reading position while initial load, bottom updates and sent messages scroll down', () => {
  let scrollHeight = 800
  let scrollTop = 0
  const { rerender } = render(<Conversation messages={[]} />)
  const log = screen.getByRole('log')
  Object.defineProperties(log, {
    clientHeight: { value: 400 },
    scrollHeight: { get: () => scrollHeight },
    scrollTop: {
      get: () => scrollTop,
      set: (value: number) => { scrollTop = Math.min(value, scrollHeight - 400) },
    },
  })
  const messages = [message('first')]
  rerender(<Conversation messages={messages} />)
  expect(log.scrollTop).toBe(400)

  log.scrollTop = 200
  fireEvent.scroll(log)
  scrollHeight = 1000
  messages.push(message('incoming-while-reading'))
  rerender(<Conversation messages={messages} />)
  expect(log.scrollTop).toBe(200)

  log.scrollTop = 600
  fireEvent.scroll(log)
  scrollHeight = 1200
  messages.push(message('incoming-at-bottom'))
  rerender(<Conversation messages={messages} />)
  expect(log.scrollTop).toBe(800)

  log.scrollTop = 200
  fireEvent.scroll(log)
  scrollHeight = 1400
  messages.push({ ...message('sent'), outgoing: true })
  rerender(<Conversation messages={messages} />)
  expect(log.scrollTop).toBe(1000)
})
