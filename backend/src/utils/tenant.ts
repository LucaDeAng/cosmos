import { validate as validateUUID } from 'uuid';
import { SYSTEM_COMPANY_ID } from '../agents/utils/embeddingService';

export function isValidTenantId(tenantId?: string | null): boolean {
  return !!tenantId && validateUUID(tenantId);
}

export function normalizeTenantId(tenantId?: string | null): string {
  if (!tenantId) return SYSTEM_COMPANY_ID;
  return validateUUID(tenantId) ? tenantId as string : SYSTEM_COMPANY_ID;
}
