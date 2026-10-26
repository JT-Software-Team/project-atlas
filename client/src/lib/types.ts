import type { Media } from './api';

export type Role = 'super_admin' | 'project_admin' | 'viewer';
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'on_hold' | 'under_maintenance' | 'archived';
export type Visibility = 'private' | 'restricted' | 'public_overview';
export type AccessLevel = 'view' | 'technical' | 'manage';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  clientId: number | null;
  clientName: string | null;
  lastLoginAt: string | null;
  /** Set on provisioned accounts until the initial password is replaced. */
  mustChangePassword?: boolean;
}

export interface Location { siteName: string | null; city: string | null; state: string | null; country: string | null }

export interface ProjectCard {
  id: number;
  slug: string;
  name: string;
  shortDescription: string | null;
  category: { id: number; name: string; slug: string } | null;
  projectType: string | null;
  status: ProjectStatus;
  featured: boolean;
  isDemo: boolean;
  tags: string[];
  client: { id: number; name: string; slug: string; isPlaceholder: boolean; logoUrl: string | null } | null;
  location: Location | null;
  coverUrl: string | null;
  dashboardCount: number;
  primaryDashboard: { id: number; openIn: 'new_tab' | 'same_tab'; launchUrl: string } | null;
  isFavorite: boolean;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  visibility?: Visibility;
  access: { technical: boolean; manage: boolean };
}

export interface Dashboard {
  id: number;
  name: string;
  type: string;
  description: string | null;
  isPrimary: boolean;
  openIn: 'new_tab' | 'same_tab';
  provider: string | null;
  host: string | null;
  url?: string;
  launchUrl: string;
  requiresSeparateLogin: boolean;
  thumbnailUrl: string | null;
  thumbnailMediaId?: number | null;
  lastVerifiedAt: string | null;
  lastVerifiedBy: string | null;
  checkResult: 'responded' | 'no_response' | 'skipped' | null;
  checkDetail: string | null;
}

export interface MediaInfo extends Omit<Media, 'kind'> { kind: string; caption?: string | null }

export interface ProjectDetail extends Omit<ProjectCard, 'client'> {
  description: string | null;
  startDate: string | null;
  completionDate: string | null;
  updatedByName: string | null;
  client: (NonNullable<ProjectCard['client']> & { industry: string | null; website: string | null }) | null;
  dashboards: Dashboard[];
  media: { cover: MediaInfo | null; plant: MediaInfo | null; equipment: MediaInfo | null; document: MediaInfo | null; gallery: MediaInfo[] };
  technical: Record<string, string> | null;
  maintenance: { notes: string | null; lastDate: string | null; nextDate: string | null; reviewDate: string | null; decommissionDate: string | null } | null;
  contact: { owner: { id: number; name: string } | null; responsibleTeam: string | null; supportContact: string | null } | null;
  admin: {
    siteName: string | null; city: string | null; state: string | null; country: string | null; locationApproved: boolean;
    ownerUserId: number | null; authorizedRoles: Role[]; clientAccess: boolean; visibility: Visibility;
    publicApprovedAt: string | null; internalNotes: string | null; approvalStatus: 'draft' | 'pending_review' | 'approved';
    contactApproved: boolean; coverMediaId: number | null; plantMediaId: number | null; equipmentMediaId: number | null; documentMediaId: number | null;
  } | null;
}

export interface Client {
  id: number;
  name: string;
  slug: string;
  isPlaceholder: boolean;
  industry: string | null;
  website: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  siteName: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  projectCount: number;
  updatedAt: string;
  internalRef?: string | null;
  logoMediaId?: number | null;
  coverMediaId?: number | null;
}

export interface Category { id: number; name: string; slug: string; description: string | null; projectCount: number }

export interface Activity {
  id: number; at: string; userName: string | null; action: string; summary: string;
  entityType: string | null; entityId: number | null; projectId: number | null; ip?: string | null;
}

export interface ManagedUser {
  id: number; email: string; name: string; role: Role; clientId: number | null; clientName: string | null;
  active: boolean; locked: boolean; lastLoginAt: string | null; createdAt: string; invitePending: boolean;
  projectGrants: number; activeSessions: number;
}

export interface Facets {
  clients: { id: number; name: string }[];
  categories: { slug: string; name: string }[];
  statuses: ProjectStatus[];
  locations: string[];
}
