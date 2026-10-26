/** Shared enumerations. The client mirrors these in client/src/lib/catalog.ts. */
export const PROJECT_STATUSES = ['planning', 'active', 'completed', 'on_hold', 'under_maintenance', 'archived'] as const;
export const EDITABLE_STATUSES = ['planning', 'active', 'completed', 'on_hold', 'under_maintenance'] as const;
export const VISIBILITIES = ['private', 'restricted', 'public_overview'] as const;
export const APPROVAL_STATUSES = ['draft', 'pending_review', 'approved'] as const;
export const DASHBOARD_TYPES = [
  'live_monitoring', 'production_analytics', 'machine_status', 'process_monitoring',
  'quality_monitoring', 'performance_reports', 'custom',
] as const;
export const ACCESS_LEVELS = ['view', 'technical', 'manage'] as const;

/** Known technical fields. Additional custom keys are allowed (stored as JSON). */
export const TECHNICAL_FIELDS = [
  'equipmentName', 'equipmentType', 'processName', 'productionLine', 'monitoringParameters',
  'dataSourceType', 'automationSystem', 'refreshFrequency', 'timeZone', 'integrationNotes',
  'documentationUrl', 'maintenanceInstructions',
] as const;

export const DEFAULT_CATEGORIES = [
  'Industrial Automation', 'Machine Monitoring', 'Process Monitoring', 'Manufacturing',
  'Material Handling', 'Aluminium Processing', 'Steel Industry', 'Other',
];
