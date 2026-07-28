export interface DocumentItem {
  id: number;
  title: string;
  description: string | null;
  category_text: string | null;
  visibility: string;
  owner_id: number;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  attachment_id: number | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  can_edit: boolean;
}

export interface DocumentOverview {
  documents: DocumentItem[];
  categories: string[];
  can_manage: boolean;
}

export interface DocumentPayload {
  title: string;
  category: string;
  notes: string;
  version?: number;
}
