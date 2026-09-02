/** Models the joined, household-scoped shopping workspace returned by the API. */

export interface ShoppingList { id: number; name: string; is_primary: number; version: number; }
export interface Category { id: number; name: string; version: number; }
export interface Supermarket { id: number; name: string; version: number; }

export interface Product {
  id: number;
  category_id: number | null;
  name: string;
  category_name: string | null;
  image_attachment_id: number | null;
  version: number;
}

export interface ProductRecipeUsage {
  product_id: number;
  recipe_id: number;
  recipe_title: string;
}

export interface ShoppingItem {
  id: number;
  list_id: number;
  product_id: number | null;
  supermarket_id: number | null;
  label: string;
  quantity_raw: string | null;
  checked: number;
  product_name: string | null;
  category_name: string | null;
  supermarket_name: string | null;
  image_attachment_id: number | null;
  version: number;
}

export interface PriceRecord {
  id: number;
  product_id: number;
  supermarket_id: number;
  amount: string;
  currency: string;
  package_text: string | null;
  observed_on: string | null;
  created_at: string;
  product_name: string;
  category_name: string | null;
  supermarket_name: string;
  username: string | null;
  image_attachment_id: number | null;
  version: number;
}

export interface ShoppingListOverview {
  lists: ShoppingList[];
  items: ShoppingItem[];
  supermarkets: Supermarket[];
  products: Product[];
}

export interface ResourceCount { id: number; count: number; }

export interface ShoppingCatalogOverview {
  lists: ShoppingList[];
  categories: Category[];
  supermarkets: Supermarket[];
  products: Product[];
  product_recipe_usages: ProductRecipeUsage[];
  active_product_ids: Array<{ id: number }>;
  supermarket_item_counts: ResourceCount[];
  supermarket_price_counts: ResourceCount[];
}

export interface ShoppingPricesOverview {
  supermarkets: Supermarket[];
  products: Product[];
  prices: PriceRecord[];
}

/** Complete fixture shape used by cross-view tests and development tooling. */
export type ShoppingOverview = ShoppingListOverview & ShoppingCatalogOverview & ShoppingPricesOverview;
