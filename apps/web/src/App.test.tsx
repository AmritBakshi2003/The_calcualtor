import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders calculator suite title', () => {
    render(<App />);
    expect(screen.getByText('Calculator Suite')).toBeInTheDocument();
  });

  it('renders coming soon message', () => {
    render(<App />);
    expect(
      screen.getByText('Coming soon: Basic, Scientific, Finance, and Scan modes')
    ).toBeInTheDocument();
  });
});
