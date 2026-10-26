import { Link } from 'react-router-dom';
import { Clock, ExternalLink, LayoutDashboard, MapPin, Star, Tag } from 'lucide-react';
import type { ProjectCard as Card } from '../lib/types';
import { locationText, timeAgo } from '../lib/format';
import { ClientLogo, CoverImage } from './Media';
import { DemoBadge, StatusBadge } from './ui';

interface Props {
  project: Card;
  onToggleFavorite?: (p: Card) => void;
  /** Preview mode (admin form): no navigation or actions. */
  preview?: boolean;
}

export function ProjectCard({ project: p, onToggleFavorite, preview }: Props) {
  const loc = locationText(p.location);
  const clientName = p.client?.name ?? 'Client to be added';
  return (
    <article className="pcard" aria-label={`${p.name}, ${clientName}`}>
      <div className="pcard-media">
        <div className="pcard-media-img"><CoverImage src={p.coverUrl} categorySlug={p.category?.slug} /></div>
        <div className="pcard-badges">
          <StatusBadge status={p.status} />
          {p.isDemo && <DemoBadge compact />}
          {p.featured && <span className="badge badge-accent">Featured</span>}
        </div>
        {!preview && onToggleFavorite && (
          <button
            className="fav-btn"
            aria-pressed={p.isFavorite}
            aria-label={p.isFavorite ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
            onClick={() => onToggleFavorite(p)}
          >
            <Star size={18} />
          </button>
        )}
        <div className="pcard-client"><ClientLogo name={p.client?.name} src={p.client?.logoUrl} /></div>
      </div>
      <div className="pcard-body">
        <span className="pcard-client-name">{clientName}{p.client?.isPlaceholder && ' (placeholder)'}</span>
        <h3 className="pcard-title">
          {preview ? p.name || 'Untitled project' : <Link to={`/projects/${p.slug}`}>{p.name}</Link>}
        </h3>
        <p className="pcard-desc">{p.shortDescription || 'No summary has been added yet.'}</p>
        <div className="pcard-meta">
          {p.category && <span><Tag size={13} aria-hidden="true" />{p.category.name}</span>}
          {loc && <span><MapPin size={13} aria-hidden="true" />{loc}</span>}
          <span><LayoutDashboard size={13} aria-hidden="true" />{p.dashboardCount} dashboard{p.dashboardCount === 1 ? '' : 's'}</span>
          <span><Clock size={13} aria-hidden="true" />Updated {timeAgo(p.updatedAt)}</span>
        </div>
      </div>
      <div className="pcard-actions">
        {preview ? (
          <span className="btn btn-sm" aria-disabled="true">View Details</span>
        ) : (
          <Link className="btn btn-sm" to={`/projects/${p.slug}`}>View Details</Link>
        )}
        {p.primaryDashboard && !preview ? (
          <a
            className="btn btn-sm btn-primary"
            href={p.primaryDashboard.launchUrl}
            target={p.primaryDashboard.openIn === 'new_tab' ? '_blank' : undefined}
            rel="noopener noreferrer"
            aria-label={`Open dashboard for ${p.name} (external site${p.primaryDashboard.openIn === 'new_tab' ? ', opens in a new tab' : ''})`}
          >
            Open Dashboard <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : p.primaryDashboard && preview ? (
          <span className="btn btn-sm btn-primary" aria-disabled="true">Open Dashboard</span>
        ) : (
          <span className="no-dash" title="No dashboard link has been configured for this project yet">No dashboard link yet</span>
        )}
      </div>
    </article>
  );
}
