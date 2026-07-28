export interface InventoryItem {
  id: number;
  owner_id: number | null;
  document_id: number | null;
  name: string;
  category_text: string | null;
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
  can_edit: boolean;
}

export interface InventoryMember { id: number; username: string; }
export interface InventoryDocument { id: number; title: string; }

export interface InventoryOverview {
  items: InventoryItem[];
  categories: string[];
  members: InventoryMember[];
  documents: InventoryDocument[];
  can_manage: boolean;
}

export interface InventoryPayload {
  name: string;
  category: string;
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
