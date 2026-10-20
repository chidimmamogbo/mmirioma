// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DataTable } from './Admin'
import { Button } from './Button'
import { OptionTile } from './Choice'
import { CodeBoxes, Keypad } from './CodeEntry'
import { Pills, Toggle } from './Controls'
import { TextField } from './Field'
import { IconLink } from './IconButton'

function KeypadHarness({ initial = '' }: { initial?: string }) {
  const [code, setCode] = useState(initial)
  return (
    <>
      <CodeBoxes value={code} />
      <output data-testid="code">{code}</output>
      <Keypad value={code} onChange={setCode} />
    </>
  )
}

describe('Keypad and CodeBoxes', () => {
  it('enters digits, deletes and clears', async () => {
    const user = userEvent.setup()
    render(<KeypadHarness />)
    await user.click(screen.getByRole('button', { name: '4' }))
    await user.click(screen.getByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    expect(screen.getByTestId('code')).toHaveTextContent('482')
    expect(screen.getByRole('group', { name: 'Code entered: 3 of 6 digits' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete digit' }))
    expect(screen.getByTestId('code')).toHaveTextContent(/^48$/)
    await user.click(screen.getByRole('button', { name: 'Clear code' }))
    expect(screen.getByTestId('code')).toBeEmptyDOMElement()
  })

  it('stops at six digits', async () => {
    const user = userEvent.setup()
    render(<KeypadHarness initial="482791" />)
    await user.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByTestId('code')).toHaveTextContent(/^482791$/)
  })

  it('accepts the physical keyboard', async () => {
    const user = userEvent.setup()
    render(<KeypadHarness />)
    await user.keyboard('19{Backspace}3')
    expect(screen.getByTestId('code')).toHaveTextContent(/^13$/)
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('code')).toBeEmptyDOMElement()
  })
})

describe('Toggle', () => {
  it('is a switch that reports its state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Toggle label="SMS updates" checked={false} onChange={onChange} />)
    const sw = screen.getByRole('switch', { name: 'SMS updates' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await user.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('OptionTile', () => {
  it('shows selection with aria-pressed and a tick, not colour alone', () => {
    const { container } = render(
      <>
        <OptionTile selected onSelect={() => {}}>25 litres</OptionTile>
        <OptionTile selected={false} onSelect={() => {}}>50 litres</OptionTile>
      </>,
    )
    expect(screen.getByRole('button', { name: '25 litres' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '50 litres' })).toHaveAttribute('aria-pressed', 'false')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})

describe('Pills', () => {
  it('marks the chosen filter and reports changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Pills
        label="Filter orders"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
        ]}
      />,
    )
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Active' }))
    expect(onChange).toHaveBeenCalledWith('active')
  })
})

describe('Button', () => {
  it('keeps its label while loading and ignores clicks', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Placing order
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Placing order' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('TextField', () => {
  it('links the label, marks errors and announces them', () => {
    render(
      <MemoryRouter>
        <TextField label="Password" type="password" error="Enter at least 8 characters." />
      </MemoryRouter>,
    )
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Enter at least 8 characters.')
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least 8 characters.')
  })

  it('shows optional fields in the label', () => {
    render(<TextField label="Landmark" optional />)
    expect(screen.getByLabelText('Landmark (optional)')).toBeInTheDocument()
  })
})

describe('IconLink', () => {
  it('lets the caller position it absolutely (regression: drawer close button)', () => {
    render(
      <MemoryRouter>
        <IconLink to="/" label="Close menu" className="absolute top-2 right-1.5">
          x
        </IconLink>
        <IconLink to="/" label="Notifications" dot>
          x
        </IconLink>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Close menu' }).className.split(' ')).not.toContain('relative')
    expect(screen.getByRole('link', { name: 'Notifications' }).className.split(' ')).toContain('relative')
  })
})

describe('DataTable', () => {
  const rows = [
    { id: 'a', name: 'Chinedu Okafor', area: 'GRA' },
    { id: 'b', name: 'Ifeanyi James', area: 'Independence Layout' },
  ]
  it('renders a table for tablets and up, and a card per row for phones, marking the selected row in both', () => {
    render(
      <DataTable
        caption="Riders"
        rows={rows}
        rowKey={(r) => r.id}
        selectedKey="b"
        columns={[
          { header: 'Rider', cell: (r) => r.name },
          { header: 'Area', cell: (r) => r.area },
        ]}
      />,
    )
    expect(screen.getByRole('table')).toHaveClass('hidden', 'md:table')
    const list = screen.getByRole('list', { name: 'Riders' })
    expect(list).toHaveClass('md:hidden')
    const cards = list.querySelectorAll('li')
    expect(cards).toHaveLength(2)
    expect(cards[1]).toHaveAttribute('aria-current', 'true')
    expect(cards[1]).toHaveTextContent('AreaIndependence Layout')
    expect(screen.getAllByRole('row')[2]).toHaveAttribute('aria-selected', 'true')
  })
})
