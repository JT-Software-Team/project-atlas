import type { AccessLevel, ProjectStatus, Role, Visibility } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  project_admin: 'Project Admin',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Full access, user management, project management and settings.',
  project_admin: 'Manages only the projects assigned to them.',
  viewer: 'Views permitted projects and opens authorised dashboards.',
};

export const STATUS_META: Record<ProjectStatus, { label: string; tone: 'success' | 'warning' | 'error' | 'info' | 'accent' | '' }> = {
  planning: { label: 'Planning', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  completed: { label: 'Completed', tone: '' },
  on_hold: { label: 'On Hold', tone: 'warning' },
  under_maintenance: { label: 'Under Maintenance', tone: 'warning' },
  archived: { label: 'Archived', tone: '' },
};
export const EDITABLE_STATUSES: ProjectStatus[] = ['planning', 'active', 'completed', 'on_hold', 'under_maintenance'];

export const VISIBILITY_META: Record<Visibility, { label: string; description: string }> = {
  private: { label: 'Private', description: 'Administrators and explicitly authorised users only.' },
  restricted: { label: 'Restricted', description: 'Users with assigned project permissions (individual, role or client access).' },
  public_overview: { label: 'Public Overview', description: 'Approved, non-confidential summary may appear on the public website. Dashboards stay protected.' },
};

export const ACCESS_LABELS: Record<AccessLevel, { label: string; description: string }> = {
  view: { label: 'Viewer', description: 'Project info, images, documents and dashboards' },
  technical: { label: 'Technical', description: 'Also technical and maintenance details' },
  manage: { label: 'Manager', description: 'Edit project (Project Admins only)' },
};

export const DASHBOARD_TYPES: Record<string, string> = {
  live_monitoring: 'Live Monitoring',
  production_analytics: 'Production Analytics',
  machine_status: 'Machine Status',
  process_monitoring: 'Process Monitoring',
  quality_monitoring: 'Quality Monitoring',
  performance_reports: 'Performance Reports',
  custom: 'Custom Dashboard',
};

export const TECHNICAL_FIELDS: { key: string; label: string; multiline?: boolean; hint?: string }[] = [
  { key: 'equipmentName', label: 'Equipment or machine name' },
  { key: 'equipmentType', label: 'Equipment type' },
  { key: 'processName', label: 'Process name' },
  { key: 'productionLine', label: 'Plant or production line' },
  { key: 'monitoringParameters', label: 'Monitoring parameters', multiline: true },
  { key: 'dataSourceType', label: 'Data source type' },
  { key: 'automationSystem', label: 'PLC / automation system', hint: 'Model or platform only. Never IP addresses, credentials or network details.' },
  { key: 'refreshFrequency', label: 'Data refresh frequency' },
  { key: 'timeZone', label: 'Dashboard time zone' },
  { key: 'documentationUrl', label: 'Technical documentation link', hint: 'https:// link to the documentation location' },
  { key: 'integrationNotes', label: 'Integration notes', multiline: true },
  { key: 'maintenanceInstructions', label: 'Maintenance instructions', multiline: true },
];
export const TECHNICAL_LABELS: Record<string, string> = Object.fromEntries(TECHNICAL_FIELDS.map((f) => [f.key, f.label]));

/** Fallback illustration for a project without a cover image, chosen by category. */
export function placeholderCover(categorySlug?: string | null): string {
  switch (categorySlug) {
    case 'industrial-automation':
    case 'material-handling':
      return '/placeholders/automation.svg';
    case 'aluminium-processing':
      return '/placeholders/aluminium.svg';
    case 'machine-monitoring':
    case 'process-monitoring':
      return '/placeholders/monitoring.svg';
    default:
      return '/placeholders/plant.svg';
  }
}
