import { Component, HostListener, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ProductCatalogItem, Recipe, RecipeIngredient, RecipesService } from './recipes.service';

@Component({
  selector: 'app-recipes-page',
  templateUrl: './recipes-page.component.html',
  styleUrls: ['./recipes-page.component.css']
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
