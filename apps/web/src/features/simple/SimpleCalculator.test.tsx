import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimpleCalculator } from './SimpleCalculator';

describe('SimpleCalculator', () => {
  it('renders calculator component', () => {
    render(<SimpleCalculator />);
    // Component renders without crashing
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
});
