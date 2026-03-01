import { Component, OnInit } from '@angular/core';
import { ShoppingService, ShoppingItem, Product, Supermarket, Category, User } from './shopping.service';

@Component({
  selector: 'app-shopping-page',
  templateUrl: './shopping-page.component.html',
  styleUrls: ['./shopping-page.component.css']
})
export class ShoppingPageComponent implements OnInit {
  view: 'list' | 'prices' | 'products' = 'list';
  user: User | null = null;
  shoppingList: ShoppingItem[] = [];
  products: Product[] = [];
  supermarkets: Supermarket[] = [];
  categories: Category[] = [];
  prices: any[] = [];
  
  searchTerm: string = '';
  priceListSearch: string = '';
  expandedGroups: Set<string> = new Set();
  
  isUploading: boolean = false;
  showProductForm: boolean = false;
  productSearchTerm: string = '';
  showProductDropdown: boolean = false;
  selectedProductId: number = 0;
  selectedProductName: string = '';
  selectedSupermarketId: number = 0;
  listFilterSupermarketId: number = 0;
  itemQuantity: string = '1';

  priceProductSearch: string = '';
  showPriceDropdown: boolean = false;

  newPrice = { product_id: 0, supermarket_id: 0, price: 0, format: '' };
  pricePreviewUrl: string | null = null;
  selectedPriceFile: File | null = null;

  newProduct: Product = { name: '', category_id: undefined };
  editingProduct: Product | null = null;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  
  newCategoryName: string = '';
  
  newSupermarket: Supermarket = { name: '', location: '' };
  editingSupermarket: Supermarket | null = null;

  constructor(private shoppingService: ShoppingService) {}

  ngOnInit() {
    this.loadData();
    this.shoppingService.getUser().subscribe(u => this.user = u);
  }

  isAdmin() { return this.user && this.user.role === 'admin'; }

  get sortedAndFilteredProducts() {
    return this.products
      .filter(p => {
        const term = this.productSearchTerm.toLowerCase();
        return p.name.toLowerCase().includes(term) || (p.category_name || '').toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const catA = a.category_name || '';
        const catB = b.category_name || '';
        if (catA < catB) return -1;
        if (catA > catB) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  sortedProducts(term: string) {
    return this.products
      .filter(p => p.name.toLowerCase().includes(term.toLowerCase()) || (p.category_name || '').toLowerCase().includes(term.toLowerCase()))
      .sort((a, b) => {
        const catA = a.category_name || '';
        const catB = b.category_name || '';
        if (catA < catB) return -1;
        if (catA > catB) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  get filteredProducts() {
    const term = this.searchTerm.toLowerCase();
    return this.products.filter(p => 
      p.name.toLowerCase().includes(term) || 
      (p.category_name && p.category_name.toLowerCase().includes(term))
    );
  }

  loadData() {
    this.shoppingService.getShoppingList().subscribe(list => {
      this.shoppingList = list.map(item => {
        const marketIdNum = Number((item as any).supermarket_id);
        const normalizedMarketId = Number.isFinite(marketIdNum) && marketIdNum > 0 ? marketIdNum : null;
        return {
          ...item,
          is_checked: Number(item.is_checked) === 1,
          supermarket_id: normalizedMarketId
        };
      });
    });
    this.shoppingService.getProducts().subscribe(prods => this.products = prods);
    this.shoppingService.getSupermarkets().subscribe(markets => this.supermarkets = markets);
    this.shoppingService.getCategories().subscribe(cats => this.categories = cats);
    this.shoppingService.getPrices().subscribe(prices => this.prices = prices);
  }

  get groupedPrices() {
    const term = this.priceListSearch.toLowerCase();
    const filtered = this.prices.filter(p => 
      p.product_name.toLowerCase().includes(term) || 
      p.supermarket_name.toLowerCase().includes(term) ||
      (p.supermarket_location && p.supermarket_location.toLowerCase().includes(term)) ||
      (p.category_name && p.category_name.toLowerCase().includes(term))
    );

    const groupsMap: Map<string, any> = new Map();
    filtered.forEach(p => {
      const key = `${p.product_id}-${p.supermarket_id}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          key,
          product_name: p.product_name,
          category_name: p.category_name,
          supermarket_name: p.supermarket_name,
          supermarket_location: p.supermarket_location,
          latest: p,
          history: []
        });
      }
      groupsMap.get(key).history.push(p);
    });

    return Array.from(groupsMap.values()).sort((a, b) => 
      new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime()
    );
  }

  toggleGroup(key: string) {
    if (this.expandedGroups.has(key)) {
      this.expandedGroups.delete(key);
    } else {
      this.expandedGroups.add(key);
    }
  }

  get filteredShoppingList() {
    if (!this.listFilterSupermarketId) {
      return this.shoppingList;
    }

    return this.shoppingList.filter(item =>
      item.supermarket_id == null || Number(item.supermarket_id) === Number(this.listFilterSupermarketId)
    );
  }

  selectProduct(p: Product) {
    this.selectedProductId = p.id!;
    this.selectedProductName = `${p.category_name ? p.category_name + ' - ' : ''}${p.name}`;
    this.productSearchTerm = '';
    this.showProductDropdown = false;
  }

  deselectProduct() {
    this.selectedProductId = 0;
    this.selectedProductName = '';
  }

  selectPriceProduct(p: Product) {
    this.newPrice.product_id = p.id!;
    this.priceProductSearch = '';
    this.showPriceDropdown = false;
  }

  hideProductDropdown() {
    setTimeout(() => this.showProductDropdown = false, 200);
  }

  hidePriceDropdown() {
    setTimeout(() => this.showPriceDropdown = false, 200);
  }

  getProductName(id: number) {
    const p = this.products.find(x => x.id === id);
    return p ? `${p.category_name ? p.category_name + ' - ' : ''}${p.name}` : '';
  }

  saveCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    this.shoppingService.addCategory({ name }).subscribe(() => {
      this.newCategoryName = '';
      this.loadData();
    });
  }

  editCategory(c: Category) {
    const newName = prompt("Modifica nome categoria:", c.name);
    if (newName && newName.trim() !== c.name) {
      this.shoppingService.updateCategory({ id: c.id, name: newName.trim() }).subscribe(() => this.loadData());
    }
  }

  deleteCategory(c: Category) {
    if (confirm("Eliminare la categoria '" + c.name + "'? (Solo se non ha prodotti)")) {
      this.shoppingService.deleteCategory(c.id).subscribe(
        () => this.loadData(),
        err => alert(err.error.error)
      );
    }
  }

  startEditProduct(p: Product) {
    this.editingProduct = p;
    this.newProduct = { ...p };
    this.previewUrl = null;
    this.showProductForm = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEditProduct() {
    this.editingProduct = null;
    this.newProduct = { name: '', category_id: undefined };
    this.previewUrl = null;
    this.selectedFile = null;
    this.showProductForm = false;
    this.isUploading = false;
  }

  saveProduct() {
    if (!this.newProduct.name || !this.newProduct.category_id) return;
    
    this.isUploading = true;
    const formData = new FormData();
    if (this.editingProduct) formData.append('id', this.newProduct.id!.toString());
    formData.append('name', this.newProduct.name);
    formData.append('category_id', this.newProduct.category_id.toString());
    if (this.selectedFile) {
        formData.append('photo', this.selectedFile);
    } else if (this.newProduct.image_url) {
        formData.append('existing_image', this.newProduct.image_url);
    }

    if (this.editingProduct) {
      this.shoppingService.updateProduct(formData).subscribe(() => {
        this.cancelEditProduct();
        this.loadData();
      }, () => this.isUploading = false);
    } else {
      this.shoppingService.addProduct(formData).subscribe(() => {
        this.cancelEditProduct();
        this.loadData();
      }, () => this.isUploading = false);
    }
  }

  deleteProduct(p: Product) {
    if (confirm("Eliminare '" + p.name + "' dall'anagrafica?")) {
      this.shoppingService.deleteProduct(p.id!).subscribe(
        () => this.loadData(),
        err => alert(err.error.error)
      );
    }
  }

  addToList() {
    if (this.selectedProductId === 0) return;
    this.shoppingService.addToList({
      product_id: this.selectedProductId,
      quantity: this.itemQuantity,
      supermarket_id: this.selectedSupermarketId > 0 ? this.selectedSupermarketId : null
    })
      .subscribe(() => {
        this.selectedProductId = 0;
        this.selectedProductName = '';
        this.selectedSupermarketId = 0;
        this.itemQuantity = '1';
        this.loadData();
      });
  }

  toggleItem(item: ShoppingItem) {
    const newStatus = item.is_checked ? 0 : 1;
    this.shoppingService.updateListItem({ id: item.id!, is_checked: newStatus })
      .subscribe(() => {
        item.is_checked = !item.is_checked;
      });
  }

  editItem(item: ShoppingItem) {
    const newQty = prompt("Cambia quantita per " + item.product_name, item.quantity);
    if (newQty !== null) {
      this.shoppingService.updateListItem({ id: item.id!, is_checked: item.is_checked ? 1 : 0, quantity: newQty })
        .subscribe(() => this.loadData());
    }
  }

  deleteItem(item: ShoppingItem) {
    if (confirm("Rimuovere " + item.product_name + "?")) {
      this.shoppingService.deleteFromList(item.id!).subscribe(() => this.loadData());
    }
  }

  hasCheckedItems() { return this.shoppingList.some(i => i.is_checked); }

  clearChecked() {
    if (confirm("Rimuovere tutti gli articoli completati?")) {
      this.shoppingService.clearChecked().subscribe(() => this.loadData());
    }
  }

  onFileSelected(event: any) { 
    this.selectedFile = event.target.files[0]; 
    if (this.selectedFile) {
        const reader = new FileReader();
        reader.onload = (e: any) => this.previewUrl = e.target.result;
        reader.readAsDataURL(this.selectedFile);
    }
  }

  onPriceFileSelected(event: any) {
    this.selectedPriceFile = event.target.files[0];
    if (this.selectedPriceFile) {
      const reader = new FileReader();
      reader.onload = (e: any) => this.pricePreviewUrl = e.target.result;
      reader.readAsDataURL(this.selectedPriceFile);
    }
  }

  isPriceFormValid(): boolean {
    return this.newPrice.product_id > 0 && 
           this.newPrice.supermarket_id > 0 && 
           this.newPrice.price > 0;
  }

  savePrice() {
    if (!this.isPriceFormValid()) return;
    this.isUploading = true;
    const formData = new FormData();
    formData.append('product_id', this.newPrice.product_id.toString());
    formData.append('supermarket_id', this.newPrice.supermarket_id.toString());
    formData.append('price', this.newPrice.price.toString());
    formData.append('format', this.newPrice.format);
    if (this.selectedPriceFile) {
      formData.append('photo', this.selectedPriceFile);
    }

    this.shoppingService.addPrice(formData).subscribe(() => {
      this.isUploading = false;
      this.newPrice = { product_id: 0, supermarket_id: 0, price: 0, format: '' };
      this.priceProductSearch = '';
      this.pricePreviewUrl = null;
      this.selectedPriceFile = null;
      this.loadData();
    }, () => this.isUploading = false);
  }

  deletePrice(p: any) {
    if (confirm("Eliminare questo prezzo registrato?")) {
      this.shoppingService.deletePrice(p.id).subscribe(() => this.loadData());
    }
  }

  saveSupermarket() {
    if (!this.newSupermarket.name) return;
    if (this.editingSupermarket) {
      this.shoppingService.updateSupermarket({ ...this.newSupermarket, id: this.editingSupermarket.id }).subscribe(() => {
        this.cancelEditSupermarket();
        this.loadData();
      });
    } else {
      this.shoppingService.addSupermarket(this.newSupermarket).subscribe(() => {
        this.newSupermarket = { name: '', location: '' };
        this.loadData();
      });
    }
  }

  startEditSupermarket(s: Supermarket) {
    this.editingSupermarket = s;
    this.newSupermarket = { ...s };
  }

  cancelEditSupermarket() {
    this.editingSupermarket = null;
    this.newSupermarket = { name: '', location: '' };
  }

  deleteSupermarket(s: Supermarket) {
    if (confirm("Eliminare il supermercato '" + s.name + "'?")) {
      this.shoppingService.deleteSupermarket(s.id!).subscribe(
        () => this.loadData(),
        err => alert(err.error.error)
      );
    }
  }

  openImage(url: string) {
    window.open(url, '_blank');
  }
}
