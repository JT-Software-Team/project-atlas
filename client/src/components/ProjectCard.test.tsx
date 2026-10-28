import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ProjectCard as Card } from '../lib/types';
import { ProjectCard } from './ProjectCard';

const base: Card = {
  id: 1, slug: 'gunny-ball-project', name: 'Gunny Ball Project', shortDescription: 'Sample summary', category: { id: 1, name: 'Industrial Automation', slug: 'industrial-automation' },
  projectType: null, status: 'active', featured: false, isDemo: true, tags: [], client: { id: 1, name: 'JSW', slug: 'jsw', isPlaceholder: false, logoUrl: null },
  location: null, coverUrl: null, dashboardCount: 0, primaryDashboard: null, isFavorite: false, lastAccessedAt: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false, access: { technical: false, manage: false },
};

const renderCard = (p: Card) => render(<MemoryRouter><ProjectCard project={p} onToggleFavorite={() => {}} /></MemoryRouter>);

describe('ProjectCard', () => {
  it('labels demo data and shows a clear message when no dashboard is configured', () => {
    renderCard(base);
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('No dashboard link yet')).toBeInTheDocument();
    expect(screen.queryByText(/Open Dashboard/)).not.toBeInTheDocument();
  });

  it('launches dashboards through the access-checked server route in a new tab', () => {
    renderCard({ ...base, dashboardCount: 1, primaryDashboard: { id: 7, openIn: 'new_tab', launchUrl: '/api/dashboards/7/open' } });
    const link = screen.getByRole('link', { name: /Open dashboard for Gunny Ball Project/ });
    expect(link).toHaveAttribute('href', '/api/dashboards/7/open');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('uses a category illustration when there is no cover image', () => {
    const { container } = renderCard(base);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/placeholders/automation.svg');
  });

  it('exposes favorite state to assistive technology', () => {
    renderCard({ ...base, isFavorite: true });
    expect(screen.getByRole('button', { name: /Remove Gunny Ball Project from favorites/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders disabled restricted button when viewer role has no dashboard access', () => {
    renderCard({
      ...base,
      dashboardCount: 1,
      primaryDashboard: { id: 7, openIn: 'new_tab', launchUrl: undefined },
      access: { technical: false, manage: false, dashboard: false },
    });
    const btn = screen.getByRole('button', { name: /Dashboard Restricted/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
    expect(screen.queryByRole('link', { name: /Open dashboard/i })).not.toBeInTheDocument();
  });
});
