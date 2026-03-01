import { Component, HostListener, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ProductCatalogItem, Recipe, RecipeIngredient, RecipesService } from './recipes.service';

@Component({
  selector: 'app-recipes-page',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 5a3 3 0 0 1 3-3h13v18H7a3 3 0 0 0-3 3z"/>
                  <path d="M7 2v18"/>
                </svg>
              </span>
              <span>Archivio Ricette</span>
            </h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
              <a routerLink="/home" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <main class="layout">
        <section class="card list-panel">
          <div class="card-header">
            <h2>Ricette</h2>
            <button class="btn-primary btn-add-circle" (click)="startNewRecipe()" title="Nuova ricetta">+</button>
          </div>
          <div class="filters">
            <input
              type="text"
              [(ngModel)]="searchTerm"
              (input)="loadRecipes()"
              placeholder="Cerca per titolo, autore, testo..."
            />
            <select [(ngModel)]="selectedCategory" (change)="loadRecipes()">
              <option value="">Tutte le categorie</option>
              <option *ngFor="let category of categories" [value]="category">{{ category }}</option>
            </select>
          </div>

          <ul class="recipe-list">
            <li
              *ngFor="let recipe of recipes"
              [class.active]="editingRecipe && editingRecipe.id === recipe.id"
              (click)="selectRecipe(recipe.id!)"
            >
              <div class="recipe-row">
                <img *ngIf="recipe.image_url" [src]="recipe.image_url" class="recipe-thumb" />
                <div class="recipe-info">
                  <div class="recipe-name">{{ recipe.name }}</div>
                  <div class="recipe-meta">
                    <span *ngIf="recipe.category">{{ recipe.category }}</span>
                    <span *ngIf="recipe.prep_time_minutes">{{ recipe.prep_time_minutes }} min</span>
                    <span *ngIf="recipe.difficulty">{{ recipe.difficulty }}</span>
                  </div>
                </div>
              </div>
            </li>
            <li *ngIf="recipes.length === 0" class="muted">Nessuna ricetta trovata</li>
          </ul>
        </section>

        <section class="card editor-panel">
          <!-- VIEW MODE -->
          <div *ngIf="!isEditingMode && editingRecipe.id">
            <div class="recipe-detail-header">
              <h2>{{ editingRecipe.name }}</h2>
              <div class="recipe-detail-meta">
                <span class="badge" *ngIf="editingRecipe.category">{{ editingRecipe.category }}</span>
                <span class="meta-item" *ngIf="editingRecipe.prep_time_minutes">⏱️ {{ editingRecipe.prep_time_minutes }} min</span>
                <span class="meta-item difficulty-tag" [ngClass]="editingRecipe.difficulty">📊 {{ editingRecipe.difficulty }}</span>
                <span class="meta-item" *ngIf="editingRecipe.author_name">✍️ {{ editingRecipe.author_name }}</span>
              </div>
            </div>

            <div class="recipe-detail-content">
              <div class="detail-photo-container" *ngIf="editingRecipe.image_url">
                <img [src]="editingRecipe.image_url" class="recipe-detail-photo" />
              </div>

              <div class="detail-section">
                <h3>Ingredienti</h3>
                <ul class="detail-ingredients">
                  <li *ngFor="let ing of editingRecipe.ingredients">
                    <span class="ing-qty">{{ ing.quantity }}</span>
                    <span class="ing-name">{{ ing.ingredient_name }}</span>
                  </li>
                </ul>
              </div>

              <div class="detail-section">
                <h3>Procedimento</h3>
                <div class="instructions-display">{{ editingRecipe.instructions }}</div>
              </div>
            </div>

            <div class="footer-actions">
              <button class="btn-primary" (click)="isEditingMode = true">Modifica</button>
              <button class="btn-danger" (click)="deleteRecipe()">Elimina</button>
            </div>
          </div>

          <!-- EDIT MODE -->
          <div *ngIf="isEditingMode || !editingRecipe.id">
            <h2>{{ editingRecipe?.id ? 'Modifica Ricetta' : 'Nuova Ricetta' }}</h2>
            <div class="form-grid">
              <div class="form-group col-2">
                <label>Titolo</label>
                <input type="text" [(ngModel)]="editingRecipe.name" placeholder="Es. Lasagna della domenica" />
              </div>
              <div class="form-group">
                <label>Categoria</label>
                <input type="text" [(ngModel)]="editingRecipe.category" placeholder="primo, secondo, dolce..." />
              </div>
              <div class="form-group">
                <label>Tempo (min)</label>
                <input type="number" [(ngModel)]="editingRecipe.prep_time_minutes" min="1" />
              </div>
              <div class="form-group">
                <label>Difficolta</label>
                <select [(ngModel)]="editingRecipe.difficulty">
                  <option value="bassa">bassa</option>
                  <option value="media">media</option>
                  <option value="alta">alta</option>
                </select>
              </div>
              <div class="form-group">
                <label>Autore</label>
                <input type="text" [(ngModel)]="editingRecipe.author_name" placeholder="Nome autore" />
              </div>
            </div>

            <div class="form-group">
              <label>Ingredienti (lista strutturata)</label>
              <div class="ingredients-table">
                <div class="ingredient-row head">
                  <span>Prodotto</span>
                  <span>Ingrediente libero</span>
                  <span>Quantita</span>
                  <span></span>
                </div>
                <div class="ingredient-row" *ngFor="let ingredient of editingRecipe.ingredients; let i = index">
                  <div class="product-search" (click)="$event.stopPropagation()">
                    <input
                      type="text"
                      [ngModel]="getIngredientProductSearchValue(i, ingredient)"
                      (ngModelChange)="onIngredientProductSearchChange(i, $event)"
                      (focus)="openIngredientProductDropdown(i)"
                      placeholder="Cerca prodotto..."
                    />
                    <div class="ingredient-dropdown" *ngIf="activeIngredientDropdown === i">
                      <div class="dropdown-item" (click)="clearIngredientProduct(i, ingredient)">Nessun prodotto</div>
                      <div class="dropdown-item" *ngFor="let product of filteredProductsCatalog(i)" (click)="selectIngredientProduct(i, ingredient, product)">
                        <span class="cat-prefix">{{ product.category_name }}</span> - {{ product.name }}
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    [(ngModel)]="ingredient.ingredient_name"
                    [readonly]="!!ingredient.product_id"
                    [placeholder]="ingredient.product_id ? 'Automatico' : 'Ingrediente'"
                  />
                  <input type="text" [(ngModel)]="ingredient.quantity" placeholder="Qt&agrave;" />
                  <button class="btn-danger" (click)="removeIngredient(i)">x</button>
                </div>
              </div>
              <button class="btn-secondary btn-sm" (click)="addIngredient()">+ aggiungi ingrediente</button>
            </div>

            <div class="form-group">
              <label>Procedimento</label>
              <textarea [(ngModel)]="editingRecipe.instructions" placeholder="Descrivi i passaggi della ricetta"></textarea>
            </div>

            <div class="form-group">
              <label>Foto Ricetta</label>
              <div class="photo-upload-container">
                <div class="photo-preview-wrapper" *ngIf="previewUrl || editingRecipe.image_url">
                  <img [src]="previewUrl || editingRecipe.image_url" class="recipe-photo-preview" />
                  <button class="remove-photo-btn" (click)="removePhoto()" title="Rimuovi foto">&times;</button>
                </div>
                <div class="upload-controls" *ngIf="!previewUrl && !editingRecipe.image_url">
                  <label class="upload-btn">
                    <span class="icon">📁</span> Galleria
                    <input type="file" (change)="onFileSelected($event)" accept="image/*" hidden />
                  </label>
                  
                  <!-- Mobile Camera -->
                  <label class="upload-btn" *ngIf="hasCamera && isMobileDevice">
                    <span class="icon">📷</span> Fotocamera
                    <input type="file" (change)="onFileSelected($event)" accept="image/*" capture="environment" hidden />
                  </label>

                  <!-- PC Webcam -->
                  <button type="button" class="upload-btn" *ngIf="hasCamera && !isMobileDevice" (click)="startWebcam()">
                    <span class="icon">📷</span> Webcam
                  </button>
                </div>
              </div>
            </div>

            <!-- Webcam Overlay -->
            <div class="webcam-overlay" *ngIf="isWebcamActive">
              <div class="webcam-container">
                <video #webcamVideo autoplay playsinline></video>
                <div class="webcam-actions">
                  <button type="button" class="btn-primary" (click)="captureWebcam()">Scatta Foto</button>
                  <button type="button" class="btn-secondary" (click)="stopWebcam()">Chiudi</button>
                </div>
              </div>
            </div>

            <div class="footer-actions">
              <button class="btn-primary" (click)="saveRecipe()" [disabled]="!editingRecipe.name.trim() || isSaving">
                <span *ngIf="!isSaving">Salva ricetta</span>
                <span *ngIf="isSaving" class="spinner-inline">Attendere...</span>
              </button>
              <button class="btn-secondary" (click)="cancelEdit()" [disabled]="isSaving">Annulla</button>
              <button class="btn-danger" *ngIf="editingRecipe.id" (click)="deleteRecipe()">Elimina</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [`
    .dark-theme { background: #121212; color: #e4e4e4; min-height: 100vh; font-family: system-ui, sans-serif; }
    header { background: #1e1e1e; border-bottom: 1px solid #2a2a2a; padding: 15px 20px; }
    .header-content { display: flex; flex-direction: column; gap: 10px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .header-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .page-title { color: #4f8cff; margin: 0; font-size: 1.4rem; display: flex; align-items: center; gap: 10px; }
    .title-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; }
    .title-icon svg { width: 100%; height: 100%; fill: none; stroke: #4f8cff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h2 { margin-top: 0; color: #4f8cff; font-size: 1.1rem; }
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }

    .layout { max-width: 1250px; margin: 0 auto; padding: 18px; display: grid; grid-template-columns: 340px 1fr; gap: 18px; }
    .card { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 12px; padding: 16px; box-sizing: border-box; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .card-header h2 { margin: 0; }
    .btn-add-circle { width: 32px; height: 32px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; line-height: 1; }

    .filters { display: grid; gap: 8px; margin-bottom: 12px; }
    .recipe-list { list-style: none; margin: 0; padding: 0; max-height: 68vh; overflow: auto; }
    .recipe-list li { padding: 10px; border: 1px solid #2a2a2a; border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: #222; }
    .recipe-list li.active { border-color: #4f8cff; background: #1f2d43; }
    .recipe-row { display: flex; gap: 12px; align-items: center; }
    .recipe-thumb { width: 45px; height: 45px; object-fit: cover; border-radius: 6px; border: 1px solid #333; flex-shrink: 0; }
    .recipe-info { flex-grow: 1; min-width: 0; }
    .recipe-name { font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .recipe-meta { font-size: 0.75rem; color: #9aa0a6; display: flex; gap: 10px; flex-wrap: wrap; }

    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .col-2 { grid-column: span 2; }
    .form-group { margin-bottom: 14px; }
    label { display: block; margin-bottom: 6px; color: #9aa0a6; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.4px; }
    input, select, textarea { width: 100%; border: 1px solid #333; border-radius: 8px; background: #121212; color: #fff; padding: 10px; box-sizing: border-box; }
    textarea { min-height: 140px; resize: vertical; }
    .muted { color: #8e949b; font-size: 0.84rem; }

    .ingredients-table { border: 1px solid #333; border-radius: 8px; overflow: visible; margin-bottom: 8px; }
    .ingredient-row { display: grid; grid-template-columns: 1.3fr 1fr 0.8fr 46px; gap: 6px; padding: 8px; align-items: center; border-bottom: 1px solid #2a2a2a; }
    .ingredient-row:last-child { border-bottom: none; }
    .ingredient-row.head { background: #252525; color: #9aa0a6; font-size: 0.75rem; text-transform: uppercase; }
    .ingredient-row.head span { padding: 0 4px; }
    .product-search { position: relative; }
    .ingredient-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #1e1e1e; border: 2px solid #4f8cff; border-radius: 8px; z-index: 20; max-height: 240px; overflow-y: auto; box-shadow: 0 8px 18px rgba(0,0,0,0.45); }
    .dropdown-item { padding: 10px; cursor: pointer; border-bottom: 1px solid #2a2a2a; }
    .dropdown-item:last-child { border-bottom: none; }
    .dropdown-item:hover { background: #253451; }
    .cat-prefix { color: #4f8cff; font-weight: 700; font-size: 0.74rem; text-transform: uppercase; margin-right: 5px; }

    .photo-upload-container { margin-top: 5px; }
    .photo-preview-wrapper { position: relative; width: 100%; max-width: 300px; border-radius: 12px; overflow: hidden; border: 1px solid #333; }
    .recipe-photo-preview { width: 100%; display: block; object-fit: cover; max-height: 250px; }
    .remove-photo-btn { position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: white; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; }
    .upload-controls { display: flex; gap: 10px; }
    .upload-btn { flex: 1; display: inline-flex; align-items: center; gap: 8px; background: #2a2a2a; border: 2px dashed #444; padding: 15px 10px; border-radius: 12px; cursor: pointer; color: #4f8cff; box-sizing: border-box; justify-content: center; font-weight: 600; font-size: 0.9rem; }
    .upload-btn:hover { background: #333; border-color: #4f8cff; }
    .upload-btn .icon { font-size: 1.2rem; }

    .footer-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    button { border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }
    .btn-primary { background: #4f8cff; color: #fff; padding: 10px 14px; }
    .btn-secondary { background: #333; color: #e4e4e4; padding: 10px 14px; }
    .btn-danger { background: #8c2d2d; color: #fff; padding: 10px 12px; }
    .btn-sm { padding: 6px 10px; font-size: 0.82rem; }

    /* Recipe View Mode Styles */
    .recipe-detail-header { border-bottom: 1px solid #2a2a2a; padding-bottom: 15px; margin-bottom: 20px; }
    .recipe-detail-meta { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
    .badge { background: #4f8cff; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .meta-item { color: #9aa0a6; font-size: 0.85rem; display: flex; align-items: center; gap: 5px; }
    .difficulty-tag { text-transform: capitalize; padding: 3px 8px; border-radius: 6px; background: #2a2a2a; border: 1px solid #333; }
    .difficulty-tag.bassa { color: #4caf50; border-color: rgba(76, 175, 80, 0.3); }
    .difficulty-tag.media { color: #ff9800; border-color: rgba(255, 152, 0, 0.3); }
    .difficulty-tag.alta { color: #f44336; border-color: rgba(244, 67, 54, 0.3); }

    .detail-photo-container { margin-bottom: 20px; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a2a; }
    .recipe-detail-photo { width: 100%; max-height: 400px; object-fit: cover; display: block; }

    .detail-section { margin-bottom: 24px; }
    .detail-section h3 { font-size: 0.9rem; color: #4f8cff; text-transform: uppercase; margin-bottom: 10px; border-left: 3px solid #4f8cff; padding-left: 10px; }
    .detail-ingredients { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
    .detail-ingredients li { background: #222; padding: 8px 12px; border-radius: 8px; border: 1px solid #2a2a2a; display: flex; gap: 10px; }
    .ing-qty { font-weight: 700; color: #4f8cff; min-width: 40px; }
    .instructions-display { white-space: pre-wrap; line-height: 1.6; color: #e4e4e4; }

    .spinner-inline::after { content: ""; width: 12px; height: 12px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 0.8s linear infinite; margin-left: 5px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Webcam Overlay Styles */
    .webcam-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .webcam-container { background: #1e1e1e; padding: 15px; border-radius: 12px; max-width: 500px; width: 100%; border: 1px solid #333; }
    .webcam-container video { width: 100%; border-radius: 8px; background: #000; margin-bottom: 15px; }
    .webcam-actions { display: flex; gap: 10px; }
    .webcam-actions button { flex: 1; }

    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .recipe-list { max-height: 34vh; }
    }
    @media (max-width: 700px) {
      .form-grid { grid-template-columns: 1fr; }
      .col-2 { grid-column: span 1; }
      .ingredient-row { grid-template-columns: 1fr; }
      .ingredient-row.head { display: none; }
    }
  `]
})
export class RecipesPageComponent implements OnInit {
  recipes: Recipe[] = [];
  categories: string[] = [];
  productsCatalog: ProductCatalogItem[] = [];

  searchTerm: string = '';
  selectedCategory: string = '';
  ingredientProductSearch: { [index: number]: string } = {};
  activeIngredientDropdown: number | null = null;

  editingRecipe: Recipe = this.emptyRecipe();
  
  selectedFile: File | null = null;
  previewUrl: string | null = null;
  isSaving: boolean = false;
  isEditingMode: boolean = false;
  hasCamera: boolean = false;
  isMobileDevice: boolean = false;
  isWebcamActive: boolean = false;

  @ViewChild('webcamVideo') webcamVideo!: ElementRef<HTMLVideoElement>;
  private stream: MediaStream | null = null;

  constructor(private recipesService: RecipesService) {}

  async ngOnInit() {
    this.loadStaticData();
    this.loadRecipes();
    this.checkCameraSupport();
  }

  async checkCameraSupport() {
    this.isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.hasCamera = devices.some(device => device.kind === 'videoinput');
      } catch (e) {
        this.hasCamera = false;
      }
    } else {
      this.hasCamera = false;
    }
  }

  async startWebcam() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.isWebcamActive = true;
      setTimeout(() => {
        if (this.webcamVideo) {
          this.webcamVideo.nativeElement.srcObject = this.stream;
        }
      }, 100);
    } catch (err) {
      alert("Impossibile accedere alla webcam: " + err);
      this.isWebcamActive = false;
    }
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isWebcamActive = false;
  }

  captureWebcam() {
    if (!this.webcamVideo) return;
    const video = this.webcamVideo.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      this.previewUrl = canvas.toDataURL('image/jpeg');
      
      // Convert dataUrl to File object for saving
      fetch(this.previewUrl)
        .then(res => res.blob())
        .then(blob => {
          this.selectedFile = new File([blob], "webcam_capture.jpg", { type: "image/jpeg" });
          this.stopWebcam();
        });
    }
  }

  emptyRecipe(): Recipe {
    return {
      name: '',
      category: '',
      instructions: '',
      prep_time_minutes: null,
      difficulty: 'media',
      author_name: '',
      ingredients: [this.emptyIngredient()]
    };
  }

  emptyIngredient(): RecipeIngredient {
    return {
      product_id: null,
      ingredient_name: '',
      quantity: ''
    };
  }

  loadStaticData() {
    this.recipesService.getRecipeCategories().subscribe(categories => this.categories = categories || []);
    this.recipesService.getProductsCatalog().subscribe(products => {
      this.productsCatalog = products || [];
      this.alignIngredientNamesFromProducts();
    });
  }

  loadRecipes() {
    this.recipesService.getRecipes(this.searchTerm, this.selectedCategory).subscribe(recipes => {
      this.recipes = recipes || [];
    });
  }

  selectRecipe(id: number) {
    this.selectedFile = null;
    this.previewUrl = null;
    this.isEditingMode = false;
    this.recipesService.getRecipeDetails(id).subscribe(recipe => {
      this.editingRecipe = {
        ...recipe,
        category: recipe.category || '',
        instructions: recipe.instructions || '',
        difficulty: (recipe.difficulty as 'bassa' | 'media' | 'alta') || 'media',
        author_name: recipe.author_name || '',
        ingredients: (recipe.ingredients && recipe.ingredients.length > 0)
          ? recipe.ingredients.map(i => ({
            id: i.id,
            recipe_id: i.recipe_id,
            product_id: i.product_id ? Number(i.product_id) : null,
            ingredient_name: i.ingredient_name || i.product_name || '',
            quantity: i.quantity || ''
          }))
          : [this.emptyIngredient()]
      };
      this.ingredientProductSearch = {};
      this.activeIngredientDropdown = null;
    });
  }

  startNewRecipe() {
    this.editingRecipe = this.emptyRecipe();
    this.isEditingMode = true;
    this.ingredientProductSearch = {};
    this.activeIngredientDropdown = null;
    this.selectedFile = null;
    this.previewUrl = null;
  }

  cancelEdit() {
    if (this.editingRecipe.id) {
      this.selectRecipe(this.editingRecipe.id);
    } else {
      this.startNewRecipe();
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => this.previewUrl = e.target.result;
      reader.readAsDataURL(file);
    }
  }

  removePhoto() {
    this.selectedFile = null;
    this.previewUrl = null;
    this.editingRecipe.image_url = null;
  }

  addIngredient() {
    this.editingRecipe.ingredients.push(this.emptyIngredient());
  }

  removeIngredient(index: number) {
    this.editingRecipe.ingredients.splice(index, 1);

    const nextState: { [index: number]: string } = {};
    Object.keys(this.ingredientProductSearch).forEach(key => {
      const oldIndex = Number(key);
      if (oldIndex < index) {
        nextState[oldIndex] = this.ingredientProductSearch[oldIndex];
      } else if (oldIndex > index) {
        nextState[oldIndex - 1] = this.ingredientProductSearch[oldIndex];
      }
    });
    this.ingredientProductSearch = nextState;

    if (this.activeIngredientDropdown === index) {
      this.activeIngredientDropdown = null;
    } else if (this.activeIngredientDropdown !== null && this.activeIngredientDropdown > index) {
      this.activeIngredientDropdown--;
    }

    if (this.editingRecipe.ingredients.length === 0) {
      this.editingRecipe.ingredients.push(this.emptyIngredient());
    }
  }

  syncIngredientName(ingredient: RecipeIngredient) {
    const selectedId = ingredient.product_id ? Number(ingredient.product_id) : 0;
    if (!selectedId) return;
    const product = this.productsCatalog.find(p => Number(p.id) === selectedId);
    if (product) {
      ingredient.ingredient_name = product.name;
    }
  }

  getIngredientProductSearchValue(index: number, ingredient: RecipeIngredient): string {
    if (this.ingredientProductSearch[index] !== undefined) {
      return this.ingredientProductSearch[index];
    }
    return ingredient.product_id ? this.getProductDisplayLabel(ingredient.product_id) : '';
  }

  onIngredientProductSearchChange(index: number, value: string) {
    this.ingredientProductSearch[index] = value || '';
    this.activeIngredientDropdown = index;
  }

  openIngredientProductDropdown(index: number) {
    this.activeIngredientDropdown = index;
    if (this.ingredientProductSearch[index] === undefined) {
      this.ingredientProductSearch[index] = '';
    }
  }

  filteredProductsCatalog(index: number): ProductCatalogItem[] {
    const term = (this.ingredientProductSearch[index] || '').toLowerCase().trim();
    return this.productsCatalog
      .filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.category_name || '').toLowerCase().includes(term)
      )
      .sort((a, b) => {
        const catA = a.category_name || '';
        const catB = b.category_name || '';
        if (catA < catB) return -1;
        if (catA > catB) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  selectIngredientProduct(index: number, ingredient: RecipeIngredient, product: ProductCatalogItem) {
    ingredient.product_id = Number(product.id);
    this.syncIngredientName(ingredient);
    this.ingredientProductSearch[index] = '';
    this.activeIngredientDropdown = null;
  }

  clearIngredientProduct(index: number, ingredient: RecipeIngredient) {
    ingredient.product_id = null;
    this.ingredientProductSearch[index] = '';
    this.activeIngredientDropdown = null;
  }

  getProductDisplayLabel(productId?: number | null): string {
    const id = productId ? Number(productId) : 0;
    if (!id) return '';
    const product = this.productsCatalog.find(p => Number(p.id) === id);
    if (!product) return '';
    return (product.category_name ? product.category_name + ' - ' : '') + product.name;
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.activeIngredientDropdown = null;
  }

  alignIngredientNamesFromProducts() {
    if (!this.editingRecipe || !this.editingRecipe.ingredients) return;
    this.editingRecipe.ingredients.forEach(i => this.syncIngredientName(i));
  }

  getProductNameById(productId?: number | null): string {
    const id = productId ? Number(productId) : 0;
    if (!id) return '';
    const product = this.productsCatalog.find(p => Number(p.id) === id);
    return product ? (product.name || '') : '';
  }

  saveRecipe() {
    if (!this.editingRecipe.name.trim()) return;
    this.isSaving = true;

    const ingredients = this.editingRecipe.ingredients
      .map(i => {
        const productId = i.product_id ? Number(i.product_id) : null;
        const fallbackName = this.getProductNameById(productId);
        return {
          ...i,
          ingredient_name: ((i.ingredient_name || '').trim() || fallbackName),
          quantity: (i.quantity || '').trim(),
          product_id: productId
        };
      })
      .filter(i => i.ingredient_name !== '' || !!i.product_id);

    const formData = new FormData();
    if (this.editingRecipe.id) formData.append('id', this.editingRecipe.id.toString());
    formData.append('name', this.editingRecipe.name);
    formData.append('category', this.editingRecipe.category || '');
    formData.append('description', this.editingRecipe.description || '');
    formData.append('instructions', this.editingRecipe.instructions || '');
    formData.append('prep_time_minutes', this.editingRecipe.prep_time_minutes ? this.editingRecipe.prep_time_minutes.toString() : '');
    formData.append('difficulty', this.editingRecipe.difficulty || 'media');
    formData.append('author_name', this.editingRecipe.author_name || '');
    formData.append('ingredients', JSON.stringify(ingredients));
    
    if (this.selectedFile) {
      formData.append('photo', this.selectedFile);
    } else if (this.editingRecipe.image_url) {
      formData.append('existing_image', this.editingRecipe.image_url);
    }

    this.recipesService.saveRecipe(formData).subscribe(response => {
      this.isSaving = false;
      this.loadRecipes();
      this.loadStaticData();
      if (response && response.id) {
        this.selectRecipe(response.id);
      } else {
        this.startNewRecipe();
      }
      alert('Ricetta salvata');
    }, err => {
      this.isSaving = false;
      alert('Errore salvataggio: ' + (err.error?.error || err.message));
    });
  }

  deleteRecipe() {
    if (!this.editingRecipe.id) return;
    if (!confirm(`Eliminare la ricetta "${this.editingRecipe.name}"?`)) return;

    this.recipesService.deleteRecipe(this.editingRecipe.id).subscribe(() => {
      this.startNewRecipe();
      this.loadRecipes();
      this.loadStaticData();
    });
  }
}
