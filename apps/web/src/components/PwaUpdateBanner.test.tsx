import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const swState = vi.hoisted(() => ({
  needRefresh: [false, vi.fn()] as [boolean, (v: boolean) => void],
  updateServiceWorker: vi.fn(),
  onRegisteredSW: undefined as undefined | ((url: string, registration: unknown) => void),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: { onRegisteredSW?: (url: string, registration: unknown) => void }) => {
    swState.onRegisteredSW = options?.onRegisteredSW;
    return { needRefresh: swState.needRefresh, offlineReady: [false, vi.fn()], updateServiceWorker: swState.updateServiceWorker };
  },
}));

import { PwaUpdateBanner } from './PwaUpdateBanner';

describe('PwaUpdateBanner', () => {
  beforeEach(() => {
    swState.updateServiceWorker.mockReset();
  });

  it('renders nothing until a new version is waiting', () => {
    swState.needRefresh[0] = false;
    const { container } = render(<PwaUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('offers to reload once a new version is waiting', () => {
    swState.needRefresh[0] = true;
    render(<PwaUpdateBanner />);

    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(swState.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('can be dismissed', () => {
    swState.needRefresh[0] = true;
    render(<PwaUpdateBanner />);

    fireEvent.click(screen.getByRole('button', { name: /later/i }));
    expect(swState.updateServiceWorker).not.toHaveBeenCalled();
  });
});
