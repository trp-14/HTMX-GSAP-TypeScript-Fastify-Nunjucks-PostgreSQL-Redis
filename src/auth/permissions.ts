/**
 * Role-based access control. Roles are stored in PostgreSQL (user_roles); this module is the
 * single place that maps roles to capabilities. Every protected route and service method checks
 * a Permission — never a role name and never anything supplied by the browser.
 */
export const ROLES = ['EMPLOYEE', 'MANAGER', 'OPERATIONS', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'request:create',
  'request:read:all',
  'request:comment',
  'request:attach',
  'request:review', // start review, approve, reject, request changes
  'request:assign',
  'request:process', // start processing, complete, update operational info
  'request:delete:any',
  'product:read',
  'product:manage', // create, edit, delete products
  'inventory:adjust',
  'monitor:view',
  'user:manage',
  'role:manage',
  'audit:read',
  'settings:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BASE: Permission[] = [
  'request:create',
  'request:comment',
  'request:attach',
  'product:read',
  'monitor:view',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  EMPLOYEE: BASE,
  MANAGER: [...BASE, 'request:read:all', 'request:review', 'request:assign'],
  OPERATIONS: [...BASE, 'request:read:all', 'request:process', 'inventory:adjust'],
  ADMIN: [...PERMISSIONS],
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  EMPLOYEE: 'Creates, submits and follows up on their own requests.',
  MANAGER: 'Reviews, approves, rejects and assigns requests.',
  OPERATIONS: 'Processes approved requests and manages inventory.',
  ADMIN: 'Manages users, roles, products, settings and audit history.',
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return set;
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
