export interface CalendarItem {
  id: number;
  name: string;
  external_id: string;
  version: number;
}

export interface CalendarCreateRequest {
  name: string;
  external_id: string;
}
