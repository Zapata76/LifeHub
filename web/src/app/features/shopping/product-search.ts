import { Product } from './shopping.models';

const productNameCollator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

export function matchingProducts(products: readonly Product[], query: string, limit = 80): Product[] {
  const term = query.trim().toLocaleLowerCase('it');
  return products
    .filter((product) => !term
      || product.name.toLocaleLowerCase('it').includes(term)
      || (product.category_name ?? '').toLocaleLowerCase('it').includes(term))
    .sort((left, right) => productNameCollator.compare(left.name, right.name))
    .slice(0, limit);
}
