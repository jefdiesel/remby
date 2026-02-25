// Re-export types from KV storage for backwards compatibility
export type {
  StoredSale as Sale,
  StoredProperty as Property,
  StoredHPDViolation as HPDViolation,
  StoredDOBViolation as DOBViolation,
  StoredDOBPermit as DOBPermit,
  SyncMetadata as SyncLog,
  NeighborhoodStats,
} from '@/lib/kv-storage';
