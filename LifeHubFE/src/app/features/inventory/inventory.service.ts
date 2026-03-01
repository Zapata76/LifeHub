import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface InventoryItem {
  id?: number;
  name: string;
  category: string;
  location: string;
  owner_id?: number;
  owner_name?: string;
  notes?: string;
  photo_url?: string;
  document_id?: number;
  document_title?: string;
  purchase_date?: string;
  warranty_expiry?: string;
  created_at?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private apiUrl = 'api/inventory.php';

  constructor(private http: HttpClient) { }

  getItems(search: string = ''): Observable<InventoryItem[]> {
    return this.http.get<InventoryItem[]>(`${this.apiUrl}?action=get_items&search=${encodeURIComponent(search)}`, { withCredentials: true });
  }

  saveItem(item: InventoryItem): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_item`, item, { withCredentials: true });
  }

  deleteItem(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_item&id=${id}`, { withCredentials: true });
  }
}
