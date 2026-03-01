import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface HubDocument {
  id?: number;
  title: string;
  category: string;
  file_path: string;
  tags?: string;
  notes?: string;
  created_by?: number;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentsService {
  private apiUrl = 'api/documents.php';

  constructor(private http: HttpClient) { }

  getDocuments(search: string = ''): Observable<HubDocument[]> {
    return this.http.get<HubDocument[]>(`${this.apiUrl}?action=get_documents&search=${encodeURIComponent(search)}`, { withCredentials: true });
  }

  saveDocument(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_document`, formData, { withCredentials: true });
  }

  deleteDocument(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_document&id=${id}`, { withCredentials: true });
  }
}
