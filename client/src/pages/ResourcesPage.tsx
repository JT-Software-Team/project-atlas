import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { formatBytes } from '../lib/format';
import { ErrorState, PageHeader, StateMessage } from '../components/ui';

interface Resource { projectId: number; projectSlug: string; projectName: string; clientName: string | null; kind: 'document' | 'link'; title: string; url: string; size?: number }

export function ResourcesPage() {
  const { data, error, loading, reload } = useApi<{ resources: Resource[] }>('/resources');
  return (
    <>
      <PageHeader eyebrow="Library" title="Resources" description="Project documents and reference links from the projects you can access." />
      {error ? <ErrorState error={error} onRetry={reload} />
        : loading ? <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
        : !data!.resources.length ? <StateMessage icon={<FileText size={28} />} title="No resources yet" message="Documents uploaded to projects, and technical documentation links you are authorised to see, will be listed here." />
        : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Resource</th><th>Project</th><th>Client</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {data!.resources.map((r, i) => (
                  <tr key={i}>
                    <td><span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>{r.kind === 'document' ? <FileText size={17} color="var(--accent-strong)" /> : <Link2 size={17} color="var(--cyan)" />}<span>{r.title}{r.size ? <span className="subtle"> ({formatBytes(r.size)})</span> : null}</span></span></td>
                    <td><Link to={`/projects/${r.projectSlug}`}>{r.projectName}</Link></td>
                    <td className="muted">{r.clientName ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}><a className="btn btn-sm" href={r.url} target="_blank" rel="noopener noreferrer">Open <ExternalLink size={13} /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}
