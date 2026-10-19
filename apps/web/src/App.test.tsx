import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders calculator suite title', () => {
    render(<App />);
    expect(screen.getByText('Calculator Suite')).toBeInTheDocument();
  });

  it('renders tab navigation', () => {
    render(<App />);
    expect(screen.getByText('Simple')).toBeInTheDocument();
    expect(screen.getByText('Scientific')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    expect(screen.getByText('Scan')).toBeInTheDocument();
  });
});
