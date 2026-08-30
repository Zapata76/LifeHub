export interface InventoryImage {
  id: number;
  name: string;
  mime: string;
  size: number;
}

export interface InventoryItem {
  id: number;
  owner_id: number | null;
  document_id: number | null;
  category_id: number;
  name: string;
  category_name: string;
  quantity: number | null;
  unit_code: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  created_by: number;
  owner_name: string | null;
  document_title: string | null;
  version: number;
  image_attachment_id: number | null;
  image_count: number;
  archived_at: string | null;
  images: InventoryImage[];
  can_edit: boolean;
}

export interface InventoryMember { id: number; username: string; }
export interface InventoryDocument { id: number; title: string; }

export interface InventoryCategory {
  id: number;
  name: string;
  is_fallback: number;
  active_count: number;
  archived_count: number;
  version: number;
}
export interface InventoryOverview {
  items: InventoryItem[];
  categories: InventoryCategory[];
  active_count: number;
  archived_count: number;
  members: InventoryMember[];
  documents: InventoryDocument[];
  can_manage: boolean;
}

export interface InventoryPayload {
  name: string;
  categoryId: number;
  location: string;
  ownerId: number | null;
  documentId: number | null;
  quantity: number | null;
  unit: string;
  purchaseDate: string;
  warrantyExpiry: string;
  notes: string;
  version?: number;
}
