import { Link } from 'react-router-dom';
import { Shapes } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import type { Category } from '../lib/types';
import { CardSkeletons, ErrorState, PageHeader } from '../components/ui';

export function CategoriesPage() {
  const { isSuperAdmin } = useAuth();
  const { data, error, loading, reload } = useApi<{ categories: Category[] }>('/categories');
  return (
    <>
      <PageHeader eyebrow="Directory" title="Categories" description="Browse projects by industrial domain."
        actions={isSuperAdmin && <Link to="/admin/settings?tab=categories" className="btn">Manage categories</Link>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <CardSkeletons count={4} /> : (
        <div className="client-grid">
          {data!.categories.map((c) => (
            <Link key={c.id} to={`/projects?category=${c.slug}`} className="cat-card">
              <span className="cat-icon"><Shapes size={20} aria-hidden="true" /></span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{c.name}</strong>
                <span className="subtle">{c.projectCount} project{c.projectCount === 1 ? '' : 's'}{c.description ? ` — ${c.description}` : ''}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
