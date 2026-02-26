import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Recipe {
  id: number;
  name: string;
  description?: string;
  instructions?: string;
  image_url?: string;
  ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
  id?: number;
  recipe_id: number;
  product_id: number;
  product_name?: string;
  quantity?: string;
}

export interface MealPlan {
  id?: number;
  meal_date: string;
  meal_type: 'lunch' | 'dinner';
  recipe_id?: number;
  recipe_name?: string;
  notes?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MealsService {
  private apiUrl = '../api/meals.php';

  constructor(private http: HttpClient) { }

  getRecipes(): Observable<Recipe[]> {
    return this.http.get<Recipe[]>(`${this.apiUrl}?action=get_recipes`, { withCredentials: true });
  }

  getMealPlan(start: string, end: string): Observable<MealPlan[]> {
    return this.http.get<MealPlan[]>(`${this.apiUrl}?action=get_meal_plan&start=${start}&end=${end}`, { withCredentials: true });
  }

  saveMeal(meal: MealPlan): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=save_meal`, meal, { withCredentials: true });
  }

  generateShoppingList(mealIds: number[]): Observable<any> {
    return this.http.post(`${this.apiUrl}?action=generate_shopping_list`, { meal_ids: mealIds }, { withCredentials: true });
  }
}
