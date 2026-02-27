import { Component, OnInit } from '@angular/core';
import { ShoppingService, ShoppingItem, Product, Supermarket, Category, User } from './shopping.service';

@Component({
  selector: 'app-root',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1>🛒 Lista della spesa</h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
                <span class="user-badge" *ngIf="user">{{ user.username }}</span>
                <a href="../home.php" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
        <nav class="main-nav">
          <button (click)="view = 'list'" [class.active]="view === 'list'">Lista</button>
          <button (click)="view = 'prices'" [class.active]="view === 'prices'">Prezzi</button>
          <button (click)="view = 'products'" [class.active]="view === 'products'">Anagrafica</button>
        </nav>
      </header>

      <main [ngSwitch]="view">
        <!-- VISTA: LISTA SPESA -->
        <div *ngSwitchCase="'list'" class="grid">
          <section class="card">
            <div class="card-header">
              <h2>Lista Spesa</h2>
              <button class="btn-danger btn-sm" (click)="clearChecked()" *ngIf="hasCheckedItems()">Pulisci</button>
            </div>
            
            <div class="add-item-container">
              <div class="search-select">
                <input type="text" 
                       [(ngModel)]="productSearchTerm" 
                       (focus)="showProductDropdown = true"
                       placeholder="Cerca prodotto..."
                       class="search-input">
                
                <div class="dropdown-list" *ngIf="showProductDropdown">
                  <div class="dropdown-item" 
                       *ngFor="let p of sortedAndFilteredProducts"
                       (click)="selectProduct(p)">
                    <span class="cat-prefix">{{ p.category_name }}</span> - {{ p.name }}
                  </div>
                </div>
              </div>

              <div class="add-controls">
                <select [(ngModel)]="selectedSupermarketId" class="market-select">
                  <option [ngValue]="0">Qualsiasi supermercato</option>
                  <option *ngFor="let s of supermarkets" [ngValue]="s.id">{{ s.name }}</option>
                </select>
                <input type="text" [(ngModel)]="itemQuantity" placeholder="Qtà" class="qty-input">
                <button (click)="addToList()" [disabled]="!selectedProductId" class="add-btn">+</button>
              </div>
              
              <div class="selected-info" *ngIf="selectedProductName">
                Aggiungendo: <strong>{{ selectedProductName }}</strong> 
                <span (click)="deselectProduct()" class="clear-selection">×</span>
              </div>
            </div>

            <div class="list-filter-row">
              <label for="listFilterMarket">Filtro supermercato</label>
              <select id="listFilterMarket" [(ngModel)]="listFilterSupermarketId">
                <option [ngValue]="0">Mostra tutti i prodotti</option>
                <option *ngFor="let s of supermarkets" [ngValue]="s.id">{{ s.name }}</option>
              </select>
              <small>I prodotti senza supermercato specifico sono sempre visibili.</small>
            </div>

            <ul class="shopping-list">
              <li *ngFor="let item of filteredShoppingList" [class.checked]="!!item.is_checked">
                <input type="checkbox" [checked]="!!item.is_checked" (change)="toggleItem(item)">
                
                <div class="item-img-container" *ngIf="item.image_url">
                    <img [src]="'../' + item.image_url" class="thumb">
                </div>

                <div class="item-content" (click)="editItem(item)">
                  <span class="item-name">{{ item.product_name }}</span>
                  <span class="item-cat">{{ item.category_name }}</span>
                  <span class="item-market" *ngIf="item.supermarket_name">Solo: {{ item.supermarket_name }}</span>
                </div>

                <div class="item-actions">
                  <span class="qty-badge">{{ item.quantity }}</span>
                  <button class="delete-btn" (click)="deleteItem(item); $event.stopPropagation()">×</button>
                </div>
              </li>
              <li *ngIf="filteredShoppingList.length === 0" class="muted">Nessun prodotto con il filtro selezionato</li>
            </ul>
          </section>
        </div>

        <!-- VISTA: REGISTRA PREZZI -->
        <div *ngSwitchCase="'prices'" class="grid">
          <section class="card">
            <h2>Registra Prezzo</h2>
            <form (submit)="savePrice()">
              <div class="form-group">
                <label>Prodotto</label>
                <div class="search-select">
                  <input type="text" 
                         [(ngModel)]="priceProductSearch" 
                         (focus)="showPriceDropdown = true"
                         placeholder="Cerca prodotto..."
                         name="priceProdSearch"
                         class="search-input">
                  <div class="dropdown-list" *ngIf="showPriceDropdown">
                    <div class="dropdown-item" *ngFor="let p of sortedProducts(priceProductSearch)" (click)="selectPriceProduct(p)">
                      <span class="cat-prefix">{{ p.category_name }}</span> - {{ p.name }}
                    </div>
                  </div>
                </div>
                <div class="selected-label" *ngIf="newPrice.product_id">
                  Selezionato: <strong>{{ getProductName(newPrice.product_id) }}</strong>
                </div>
              </div>

              <div class="form-group">
                <label>Supermercato</label>
                <select [(ngModel)]="newPrice.supermarket_id" name="market" required>
                  <option [value]="0" disabled>Seleziona supermercato...</option>
                  <option *ngFor="let s of supermarkets" [value]="s.id">{{ s.name }} ({{ s.location }})</option>
                </select>
              </div>
              <div class="form-group">
                <label>Prezzo (€)</label>
                <input type="number" step="0.01" [(ngModel)]="newPrice.price" name="price" required>
              </div>
              <div class="form-group">
                <label>Formato</label>
                <input type="text" [(ngModel)]="newPrice.format" name="format" placeholder="Es. 500g">
              </div>
              <button type="submit" class="btn-primary" [disabled]="!newPrice.product_id || !newPrice.supermarket_id">Salva Prezzo</button>
            </form>
          </section>
        </div>

        <!-- VISTA: ANAGRAFICA PRODOTTI E CATEGORIE -->
        <div *ngSwitchCase="'products'" class="grid">
          
          <!-- Sezione Anagrafica Prodotti -->
          <section class="card full-width">
            <div class="card-header">
              <h2>Anagrafica Prodotti</h2>
              <button class="btn-primary btn-sm" (click)="showProductForm = true" *ngIf="!showProductForm">+ Nuovo</button>
            </div>

            <!-- Form Prodotto (Integrato) -->
            <div class="inline-form" *ngIf="showProductForm">
                <h3 class="form-title">{{ editingProduct ? 'Modifica' : 'Nuovo' }} Prodotto</h3>
                <form (submit)="saveProduct()" class="stacked-form">
                    <div class="form-row">
                        <div class="form-group flex-2">
                            <label>Nome Prodotto</label>
                            <input type="text" [(ngModel)]="newProduct.name" name="prodName" required placeholder="Nome prodotto" [disabled]="isUploading">
                        </div>
                        <div class="form-group flex-1">
                            <label>Categoria</label>
                            <select [(ngModel)]="newProduct.category_id" name="prodCat" required [disabled]="isUploading">
                                <option [value]="undefined" disabled>Scegli...</option>
                                <option *ngFor="let c of categories" [value]="c.id">{{ c.name }}</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Foto Prodotto (Scatta o Scegli)</label>
                        <div class="photo-upload-row">
                            <img *ngIf="previewUrl || newProduct.image_url" [src]="previewUrl || '../' + newProduct.image_url" class="thumb-large">
                            <input type="file" 
                                   (change)="onFileSelected($event)" 
                                   accept="image/*" 
                                   capture="environment" 
                                   class="file-input"
                                   [disabled]="isUploading">
                        </div>
                    </div>
                    <div class="btn-group-row">
                        <button type="submit" class="btn-primary" [disabled]="!newProduct.name || !newProduct.category_id || isUploading">
                            <span *ngIf="!isUploading">{{ editingProduct ? 'Aggiorna' : 'Salva' }}</span>
                            <span *ngIf="isUploading" class="spinner-inline">Attendere...</span>
                        </button>
                        <button type="button" class="btn-secondary" (click)="cancelEditProduct()" [disabled]="isUploading">Annulla</button>
                    </div>
                </form>
            </div>

            <div class="search-box">
              <input type="text" placeholder="Filtra prodotti..." [(ngModel)]="searchTerm">
            </div>
            
            <ul class="item-list">
              <li *ngFor="let p of filteredProducts">
                <div class="item-info clickable" (click)="startEditProduct(p)">
                  <img *ngIf="p.image_url" [src]="'../' + p.image_url" class="thumb">
                  <div class="text-info">
                      <span class="name">{{ p.name }}</span>
                      <span class="category">{{ p.category_name || 'Nessuna' }}</span>
                  </div>
                </div>
                <button class="delete-btn-sm" (click)="deleteProduct(p); $event.stopPropagation()">×</button>
              </li>
            </ul>
          </section>

          <!-- Sezione Categorie -->
          <section class="card full-width">
            <h2>Categorie</h2>
            <div class="add-item-box">
              <input type="text" [(ngModel)]="newCategoryName" placeholder="Nuova categoria...">
              <button (click)="saveCategory()" [disabled]="!newCategoryName.trim()">+</button>
            </div>
            <ul class="item-list horizontal-list">
              <li *ngFor="let c of categories" class="tag-item">
                <span (click)="editCategory(c)" class="clickable">{{ c.name }}</span>
                <button class="delete-btn-sm" (click)="deleteCategory(c)">×</button>
              </li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .dark-theme { background-color: #121212; color: #e4e4e4; min-height: 100vh; font-family: system-ui, sans-serif; }
    
    header { background-color: #1e1e1e; border-bottom: 1px solid #2a2a2a; padding: 15px 20px; }
    .header-content { display: flex; flex-direction: column; gap: 10px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; }
    .header-controls { display: flex; align-items: center; gap: 10px; }
    
    h1 { color: #4f8cff; font-size: 1.4rem; margin: 0; }
    .user-badge { font-size: 0.8rem; color: #4f8cff; border: 1px solid #4f8cff44; padding: 4px 10px; border-radius: 6px; }
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }
    
    .main-nav { display: flex; gap: 8px; margin-top: 15px; }
    .main-nav button { background: #2a2a2a; border: 1px solid #333; color: #e4e4e4; padding: 10px 16px; border-radius: 20px; cursor: pointer; font-size: 0.9rem; flex: 1; transition: 0.2s; }
    .main-nav button.active { background: #4f8cff; border-color: #4f8cff; color: white; }
    
    main { padding: 15px; max-width: 800px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
    .card { background-color: #1e1e1e; border-radius: 12px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); border: 1px solid #2a2a2a; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    
    /* Inline Form Styling */
    .inline-form { background: #252525; padding: 20px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #4f8cff44; }
    .form-title { font-size: 1rem; color: #4f8cff; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; }
    .form-row { display: flex; gap: 15px; margin-bottom: 15px; }
    .flex-2 { flex: 2; }
    .flex-1 { flex: 1; }
    .photo-upload-row { display: flex; align-items: center; gap: 15px; }
    .thumb-large { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; border: 1px solid #444; }
    .btn-group-row { display: flex; gap: 10px; margin-top: 10px; }
    .btn-group-row button { flex: 1; }

    /* Search Select & Dropdown */
    .add-item-container { position: relative; margin-bottom: 24px; background: #252525; padding: 12px; border-radius: 8px; border: 1px dashed #444; }
    .search-select { position: relative; width: 100%; margin-bottom: 8px; }
    .search-input { width: 100%; padding: 12px; background: #121212; border: 1px solid #444; color: white; border-radius: 8px; font-size: 1rem; }
    .dropdown-list { position: absolute; top: 100%; left: 0; right: 0; background: #1e1e1e; border: 2px solid #4f8cff; border-radius: 8px; z-index: 1000; max-height: 250px; overflow-y: auto; }
    .dropdown-item { padding: 14px; cursor: pointer; border-bottom: 1px solid #2a2a2a; }
    .cat-prefix { color: #4f8cff; font-weight: bold; font-size: 0.75rem; text-transform: uppercase; margin-right: 5px; }
    .add-controls { display: flex; gap: 8px; }
    .market-select { min-width: 140px; }
    .qty-input { width: 70px; padding: 12px; background: #121212; border: 1px solid #444; color: white; border-radius: 8px; text-align: center; }
    .add-btn { flex-grow: 1; background: #4f8cff; color: white; border: none; border-radius: 8px; font-size: 1.5rem; cursor: pointer; }
    .list-filter-row { margin: 0 0 12px; display: flex; flex-direction: column; gap: 6px; }
    .list-filter-row small { color: #9aa0a6; font-size: 0.75rem; }
    
    .shopping-list { list-style: none; padding: 0; margin: 0; }
    .shopping-list li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #2a2a2a; }
    .shopping-list input[type="checkbox"] { width: 22px; height: 22px; accent-color: #4f8cff; }
    .item-content { flex-grow: 1; cursor: pointer; display: flex; flex-direction: column; overflow: hidden; }
    .item-name { font-size: 1rem; font-weight: 500; }
    .item-cat { font-size: 0.7rem; color: #9aa0a6; text-transform: uppercase; }
    .item-market { font-size: 0.72rem; color: #9cc0ff; }
    .qty-badge { background: #2a2a2a; color: #e4e4e4; padding: 3px 8px; border-radius: 6px; font-size: 0.85rem; border: 1px solid #333; }
    .checked .item-content { text-decoration: line-through; opacity: 0.4; }
    .delete-btn { background: transparent; border: none; color: #ff5c5c; font-size: 1.4rem; cursor: pointer; }
    
    .thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid #333; flex-shrink: 0; }
    .item-info { display: flex; align-items: center; gap: 12px; flex-grow: 1; }
    .text-info { display: flex; flex-direction: column; }

    .item-list li { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #2a2a2a; }
    .horizontal-list { display: flex; flex-wrap: wrap; gap: 10px; border: none; }
    .tag-item { background: #2a2a2a; border-radius: 20px; padding: 5px 15px !important; border: 1px solid #333 !important; }
    
    label { display: block; color: #9aa0a6; margin-bottom: 6px; font-size: 0.85rem; }
    input, select { padding: 10px; background: #121212; border: 1px solid #333; color: #e4e4e4; border-radius: 8px; font-size: 1rem; width: 100%; box-sizing: border-box; }
    .btn-primary { background: #4f8cff; color: white; border: none; padding: 12px; border-radius: 8px; width: 100%; cursor: pointer; font-weight: bold; font-size: 1rem; }
    .btn-secondary { background: #333; color: #e4e4e4; border: none; padding: 12px; border-radius: 8px; width: 100%; cursor: pointer; }
    .btn-sm { padding: 5px 15px; font-size: 0.85rem; width: auto; }
    .spinner-inline::after { content: ""; width: 12px; height: 12px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; margin-left: 5px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class AppComponent implements OnInit {
  view: 'list' | 'prices' | 'products' = 'list';
  user: User | null = null;
  shoppingList: ShoppingItem[] = [];
  products: Product[] = [];
  supermarkets: Supermarket[] = [];
  categories: Category[] = [];
  searchTerm: string = '';
  
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
  newProduct: Product = { name: '', category_id: undefined };
  editingProduct: Product | null = null;
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  newCategoryName: string = '';

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
    this.selectedProductName = `${p.category_name} - ${p.name}`;
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

  getProductName(id: number) {
    const p = this.products.find(x => x.id === id);
    return p ? `${p.category_name} - ${p.name}` : '';
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
    const newQty = prompt("Cambia quantità per " + item.product_name, item.quantity);
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

  savePrice() {
    if (this.newPrice.product_id === 0 || this.newPrice.supermarket_id === 0) return;
    const formData = new FormData();
    formData.append('product_id', this.newPrice.product_id.toString());
    formData.append('supermarket_id', this.newPrice.supermarket_id.toString());
    formData.append('price', this.newPrice.price.toString());
    formData.append('format', this.newPrice.format);

    this.shoppingService.addPrice(formData).subscribe(() => {
      alert('Prezzo salvato!');
      this.newPrice = { product_id: 0, supermarket_id: 0, price: 0, format: '' };
      this.priceProductSearch = '';
    });
  }
}
