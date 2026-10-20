import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimpleCalculator } from './SimpleCalculator';

describe('SimpleCalculator', () => {
  it('renders calculator component', () => {
    render(<SimpleCalculator />);
    expect(screen.getByText('MC')).toBeInTheDocument();
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

  it('renders memory buttons', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('MC')).toBeInTheDocument();
    expect(screen.getByLabelText('MR')).toBeInTheDocument();
    expect(screen.getByLabelText('M+')).toBeInTheDocument();
    expect(screen.getByLabelText('M-')).toBeInTheDocument();
  });

  it('display shows initial zero state', () => {
    render(<SimpleCalculator />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('clear button (C) is present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Clear All')).toBeInTheDocument();
  });

  it('clear entry button (CE) is present', () => {
    render(<SimpleCalculator />);
    expect(screen.getByLabelText('Clear Entry')).toBeInTheDocument();
  });

  it('backspace button is present', () => {
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
});
