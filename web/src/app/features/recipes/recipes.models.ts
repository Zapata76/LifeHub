export interface RecipeSummary {
  id: number;
  title: string;
  description: string | null;
  instructions: string | null;
  category_text: string | null;
  prep_time_minutes: number | null;
  difficulty: 'bassa' | 'media' | 'alta' | null;
  servings: number | null;
  created_by: number;
  author_name: string | null;
  ingredient_count: number;
  version: number;
  image_attachment_id: number | null;
  can_edit: boolean;
}

export interface RecipeIngredient {
  id: number;
  product_id: number | null;
  ingredient_name: string;
  quantity_raw: string | null;
  position_no: number;
  product_name: string | null;
  category_name: string | null;
}

export interface RecipeDetail extends RecipeSummary {
  ingredients: RecipeIngredient[];
}

export interface RecipeProduct {
  id: number;
  category_id: number | null;
  name: string;
  category_name: string | null;
}

export interface RecipeMember { id: number; username: string; }
export interface RecipeProductCategory { id: number; name: string; }

export interface RecipesOverview {
  recipes: RecipeSummary[];
  categories: string[];
  products: RecipeProduct[];
  productCategories: RecipeProductCategory[];
  members: RecipeMember[];
}

export interface RecipeIngredientPayload {
  productId: number | null;
  name: string;
  quantity: string;
}

export interface RecipePayload {
  title: string;
  category: string;
  description: string;
  instructions: string;
  prepTimeMinutes: number | null;
  servings: number | null;
  difficulty: 'bassa' | 'media' | 'alta';
  ingredients: RecipeIngredientPayload[];
  version?: number;
}
