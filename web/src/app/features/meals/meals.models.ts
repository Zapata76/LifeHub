export type MealType = 'breakfast' | 'lunch' | 'dinner';

export interface MealRecipe {
  id: number;
  title: string;
  category_text: string | null;
  prep_time_minutes: number | null;
  difficulty: string | null;
  servings: number | null;
  image_attachment_id: number | null;
}

export interface PlannedMeal {
  id: number;
  meal_date: string;
  meal_type: MealType;
  description: string | null;
  notes: string | null;
  servings: number | null;
  creator_name: string | null;
  version: number;
  recipes: MealRecipe[];
}

export interface MealsOverview {
  meals: PlannedMeal[];
  recipes: MealRecipe[];
  primaryListId: number | null;
}

export interface MealPayload {
  date: string;
  type: MealType;
  description: string;
  notes: string;
  servings: number | null;
  recipeIds: number[];
  version?: number;
}

export interface ShoppingPreviewItem {
  productId: number;
  name: string;
  quantity: string;
  sources: string[];
  ingredientIds: number[];
  mealIds: number[];
}

export interface ShoppingPreview {
  mealIds: number[];
  items: ShoppingPreviewItem[];
  unresolved: Array<{ ingredient: string; quantity: string | null; recipe: string; mealDate: string }>;
  exportableIngredientCount: number;
}
