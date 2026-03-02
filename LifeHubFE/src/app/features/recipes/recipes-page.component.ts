import { Component, HostListener, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { ProductCatalogItem, Recipe, RecipeIngredient, RecipesService } from './recipes.service';
import { TasksService, FamilyMember } from '../tasks/tasks.service';

@Component({
  selector: 'app-recipes-page',
  templateUrl: './recipes-page.component.html',
  styleUrls: ['./recipes-page.component.css']
})
export class RecipesPageComponent implements OnInit {
  recipes: Recipe[] = [];
  categories: string[] = [];
  productsCatalog: ProductCatalogItem[] = [];
  members: FamilyMember[] = [];
  userFilters: { [key: string]: boolean } = {};

  activeIngredientDropdown: number | null = null;

  recipeForm: FormGroup;
  searchForm: FormGroup;

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

  constructor(
    private recipesService: RecipesService,
    private tasksService: TasksService,
    private fb: FormBuilder
  ) {
    this.searchForm = this.fb.group({
      searchTerm: [''],
      selectedCategory: ['']
    });

    this.recipeForm = this.fb.group({
      name: ['', Validators.required],
      category: [''],
      prep_time_minutes: [null],
      difficulty: ['media'],
      instructions: [''],
      ingredients: this.fb.array([])
    });
  }

  get ingredients(): FormArray {
    return this.recipeForm.get('ingredients') as FormArray;
  }

  async ngOnInit() {
    this.loadStaticData();
    this.loadRecipes();
    this.checkCameraSupport();
    this.loadMembers();
  }

  loadMembers() {
    this.tasksService.getFamilyMembers().subscribe(m => {
      this.members = m || [];
      this.members.forEach(member => {
        if (this.userFilters[member.username] === undefined) {
          this.userFilters[member.username] = true;
        }
      });
    });
  }

  toggleUserFilter(username: string) {
    this.userFilters[username] = !this.userFilters[username];
  }

  getFilteredRecipes() {
    return this.recipes.filter(r => {
      if (!r.author_name) return true;
      // Handle potential case mismatches or whitespace
      const author = r.author_name.trim();
      return this.userFilters[author] !== false;
    });
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
    const { searchTerm, selectedCategory } = this.searchForm.value;
    this.recipesService.getRecipes(searchTerm, selectedCategory).subscribe(recipes => {
      this.recipes = recipes || [];
    });
  }

  selectRecipe(id: number) {
    this.selectedFile = null;
    this.previewUrl = null;
    this.isEditingMode = false;
    this.recipesService.getRecipeDetails(id).subscribe(recipe => {
      this.editingRecipe = recipe;
      
      this.recipeForm.patchValue({
        name: recipe.name,
        category: recipe.category || '',
        prep_time_minutes: recipe.prep_time_minutes,
        difficulty: recipe.difficulty || 'media',
        instructions: recipe.instructions || ''
      });

      this.ingredients.clear();
      const ings = (recipe.ingredients && recipe.ingredients.length > 0)
        ? recipe.ingredients
        : [this.emptyIngredient()];

      ings.forEach(i => {
        this.ingredients.push(this.fb.group({
          product_id: [i.product_id ? Number(i.product_id) : null],
          ingredient_name: [i.ingredient_name || i.product_name || ''],
          quantity: [i.quantity || ''],
          productSearchValue: ['']
        }));
      });
      
      this.activeIngredientDropdown = null;
    });
  }

  startNewRecipe() {
    this.editingRecipe = this.emptyRecipe();
    this.recipeForm.reset({
      name: '',
      category: '',
      prep_time_minutes: null,
      difficulty: 'media',
      instructions: ''
    });
    this.ingredients.clear();
    this.addIngredient();
    
    this.isEditingMode = true;
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
    this.ingredients.push(this.fb.group({
      product_id: [null],
      ingredient_name: [''],
      quantity: [''],
      productSearchValue: ['']
    }));
  }

  removeIngredient(index: number) {
    this.ingredients.removeAt(index);
    if (this.ingredients.length === 0) {
      this.addIngredient();
    }
    this.activeIngredientDropdown = null;
  }

  syncIngredientName(index: number) {
    const group = this.ingredients.at(index);
    const selectedId = group.get('product_id')?.value ? Number(group.get('product_id')?.value) : 0;
    if (!selectedId) return;
    const product = this.productsCatalog.find(p => Number(p.id) === selectedId);
    if (product) {
      group.patchValue({ ingredient_name: product.name });
    }
  }

  getIngredientProductSearchValue(index: number): string {
    const group = this.ingredients.at(index);
    const searchVal = group.get('productSearchValue')?.value;
    if (searchVal !== '') return searchVal;
    
    const productId = group.get('product_id')?.value;
    return productId ? this.getProductDisplayLabel(productId) : '';
  }

  onIngredientProductSearchChange(index: number, value: string) {
    this.ingredients.at(index).patchValue({ productSearchValue: value || '' });
    this.activeIngredientDropdown = index;
  }

  openIngredientProductDropdown(index: number) {
    this.activeIngredientDropdown = index;
    const group = this.ingredients.at(index);
    if (group.get('productSearchValue')?.value === undefined) {
      group.patchValue({ productSearchValue: '' });
    }
  }

  filteredProductsCatalog(index: number): ProductCatalogItem[] {
    const term = (this.ingredients.at(index).get('productSearchValue')?.value || '').toLowerCase().trim();
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

  selectIngredientProduct(index: number, product: ProductCatalogItem) {
    const group = this.ingredients.at(index);
    group.patchValue({
      product_id: Number(product.id),
      productSearchValue: ''
    });
    this.syncIngredientName(index);
    this.activeIngredientDropdown = null;
  }

  clearIngredientProduct(index: number) {
    const group = this.ingredients.at(index);
    group.patchValue({
      product_id: null,
      productSearchValue: ''
    });
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
    this.ingredients.controls.forEach((_, index) => this.syncIngredientName(index));
  }

  getProductNameById(productId?: number | null): string {
    const id = productId ? Number(productId) : 0;
    if (!id) return '';
    const product = this.productsCatalog.find(p => Number(p.id) === id);
    return product ? (product.name || '') : '';
  }

  saveRecipe() {
    if (this.recipeForm.invalid) return;
    this.isSaving = true;

    const formValues = this.recipeForm.value;
    const ingredients = (formValues.ingredients as any[])
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
    formData.append('name', formValues.name);
    formData.append('category', formValues.category || '');
    formData.append('instructions', formValues.instructions || '');
    formData.append('prep_time_minutes', formValues.prep_time_minutes ? formValues.prep_time_minutes.toString() : '');
    formData.append('difficulty', formValues.difficulty || 'media');
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
