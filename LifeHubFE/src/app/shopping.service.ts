import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id?: number;
  name: string;
  category_id?: number;
  category_name?: string;
  image_url?: string;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'adult' | 'child';
}

export interface Supermarket {
  id?: number;
  name: string;
  location?: string;
}

export interface ShoppingItem {
  id?: number;
  product_id: number;
  supermarket_id?: number | null;
  supermarket_name?: string;
  product_name?: string;
  category_name?: string;
  image_url?: string;
  quantity: string;
  is_checked: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ShoppingService {
  private apiUrl = '/umbertini/api/shopping.php';

  constructor(private http: HttpClient) { }

  getUser(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}?action=get_user`, { withCredentials: true });
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}?action=get_categories`, { withCredentials: true });
  }

  addCategory(category: {name: string}): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=add_category`, category, { withCredentials: true });
  }

  updateCategory(category: Category): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=update_category`, category, { withCredentials: true });
  }

  deleteCategory(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_category&id=${id}`, { withCredentials: true });
  }

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(`${this.apiUrl}?action=get_products`, { withCredentials: true });
  }

  addProduct(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=add_product`, formData, { withCredentials: true });
  }

  updateProduct(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=update_product`, formData, { withCredentials: true });
  }

  deleteProduct(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_product&id=${id}`, { withCredentials: true });
  }

  getSupermarkets(): Observable<Supermarket[]> {
    return this.http.get<Supermarket[]>(`${this.apiUrl}?action=get_supermarkets`, { withCredentials: true });
  }

  getShoppingList(): Observable<ShoppingItem[]> {
    return this.http.get<ShoppingItem[]>(`${this.apiUrl}?action=get_shopping_list`, { withCredentials: true });
  }

  addPrice(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=add_price`, formData, { withCredentials: true });
  }

  addToList(item: {product_id: number, quantity: string, supermarket_id?: number | null}): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=add_to_list`, item, { withCredentials: true });
  }

  updateListItem(item: {id: number, is_checked: number, quantity?: string}): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=update_list_item`, item, { withCredentials: true });
  }

  deleteFromList(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=delete_from_list&id=${id}`, { withCredentials: true });
  }

  clearChecked(): Observable<any> {
    return this.http.get(`${this.apiUrl}?action=clear_checked`, { withCredentials: true });
  }
}
