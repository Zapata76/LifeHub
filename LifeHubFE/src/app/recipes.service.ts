import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface RecipeIngredient {
  id?: number;
  recipe_id?: number;
  product_id?: number | null;
  product_name?: string;
  ingredient_name: string;
  quantity: string;
}

export interface Recipe {
  id?: number;
  name: string;
  category: string;
  description?: string;
  instructions: string;
  prep_time_minutes?: number | null;
  difficulty: 'bassa' | 'media' | 'alta';
  author_name: string;
  image_url?: string | null;
  ingredients: RecipeIngredient[];
}

export interface ProductCatalogItem {
  id: number;
  name: string;
  category_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RecipesService {
  private apiUrl = '/umbertini/api/recipes.php';

  constructor(private http: HttpClient) { }

  getRecipes(search: string = '', category: string = ''): Observable<Recipe[]> {
    const params = new URLSearchParams();
    params.set('action', 'get_recipes');
    if (search.trim()) params.set('search', search.trim());
    if (category.trim()) params.set('category', category.trim());
    return this.http.get<Recipe[]>(`${this.apiUrl}?${params.toString()}`, { withCredentials: true });
  }

  getRecipeDetails(id: number): Observable<Recipe> {
    return this.http.get<Recipe>(`${this.apiUrl}?action=get_recipe_details&id=${id}`, { withCredentials: true });
  }

  getRecipeCategories(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}?action=get_recipe_categories`, { withCredentials: true });
  }

  getProductsCatalog(): Observable<ProductCatalogItem[]> {
    return this.http.get<ProductCatalogItem[]>(`${this.apiUrl}?action=get_products_catalog`, { withCredentials: true });
  }

  saveRecipe(recipe: Recipe): Observable<{ message: string; id: number }> {
    return this.http.post<{ message: string; id: number }>(`${this.apiUrl}?action=save_recipe`, recipe, { withCredentials: true });
  }

  deleteRecipe(id: number): Observable<{ message: string }> {
    return this.http.get<{ message: string }>(`${this.apiUrl}?action=delete_recipe&id=${id}`, { withCredentials: true });
  }
}
