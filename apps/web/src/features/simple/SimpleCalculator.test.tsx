import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimpleCalculator } from './SimpleCalculator';
import { useCalculatorStore } from '../../store';

// History writes need IndexedDB, which jsdom does not provide.
vi.mock('../../storage/db', () => ({
  addHistoryEntry: vi.fn().mockResolvedValue(1),
}));

describe('SimpleCalculator', () => {
  it('renders calculator component', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('History')).toBeInTheDocument();
  });

  it('renders digit buttons', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('7')).toBeInTheDocument();
    expect(screen.getByLabelText('8')).toBeInTheDocument();
    expect(screen.getByLabelText('9')).toBeInTheDocument();
  });

  it('renders operation buttons', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Add')).toBeInTheDocument();
    expect(screen.getByLabelText('Subtract')).toBeInTheDocument();
    expect(screen.getByLabelText('Multiply')).toBeInTheDocument();
    expect(screen.getByLabelText('Divide')).toBeInTheDocument();
  });

  it('clear button (C) is present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Clear All')).toBeInTheDocument();
  });

  it('backspace button is present on display', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Backspace')).toBeInTheDocument();
  });

  it('equals button is present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Equals')).toBeInTheDocument();
  });

  it('parentheses buttons are present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Left parenthesis')).toBeInTheDocument();
    expect(screen.getByLabelText('Right parenthesis')).toBeInTheDocument();
  });

  it('percent button is present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Percent')).toBeInTheDocument();
  });

  it('toggle sign button is present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Toggle sign')).toBeInTheDocument();
  });

  it('function toolbar buttons are present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('History')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit Converter')).toBeInTheDocument();
    expect(screen.getByLabelText('Toggle Scientific')).toBeInTheDocument();
  });

  it('shows inverse trig results in degrees by default', async () => {
    useCalculatorStore.setState({ angleMode: 'deg', showScientific: true, lastAnswer: null });
    render(<SimpleCalculator />);

    // Second operator set holds the inverse trig keys.
    fireEvent.click(screen.getByLabelText('Swap operator set'));
    fireEvent.click(screen.getByLabelText('sin⁻¹'));
    fireEvent.click(screen.getByLabelText('1'));
    fireEvent.click(screen.getByLabelText('Right parenthesis'));
    fireEvent.click(screen.getByLabelText('Equals'));

    expect(await screen.findByText('90')).toBeInTheDocument();
  });

  it('adds a percentage of the left operand', async () => {
    useCalculatorStore.setState({ showScientific: false, lastAnswer: null });
    render(<SimpleCalculator />);

    for (const label of ['2', '0', '0', 'Add', '1', '0']) {
      fireEvent.click(screen.getByLabelText(label));
    }
    fireEvent.click(screen.getByLabelText('Percent'));
    fireEvent.click(screen.getByLabelText('Equals'));

    expect(await screen.findByText('220')).toBeInTheDocument();
  });
});
