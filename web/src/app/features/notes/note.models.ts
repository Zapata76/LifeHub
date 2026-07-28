export interface NoteItem {
  id: number;
  title: string;
  body: string;
  color_hex: string;
  is_pinned: number | boolean;
  visibility: string;
  created_by: number;
  created_at: string;
  updated_by: number;
  updated_at: string;
  archived_at: string | null;
  version: number;
  author_name: string;
  image_attachment_id: number | null;
  can_edit: boolean;
}

export interface NoteMember { id: number; username: string; }

export interface NoteOverview {
  items: NoteItem[];
  members: NoteMember[];
  can_create: boolean;
  archived: boolean;
}

export interface NotePayload {
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  version?: number;
}
