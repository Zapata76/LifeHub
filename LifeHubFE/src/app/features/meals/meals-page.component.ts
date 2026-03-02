import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MealsService, MealPlan, Recipe } from './meals.service';

@Component({
  selector: 'app-meals-page',
  templateUrl: './meals-page.component.html',
  styleUrls: ['./meals-page.component.css']
})
export class MealsPageComponent implements OnInit {
  weekDays: Date[] = [];
  mealPlan: MealPlan[] = [];
  recipes: Recipe[] = [];
  editingMeal: MealPlan | null = null;
  mealForm: FormGroup;
  isLoading = false;

  constructor(
    private mealsService: MealsService,
    private fb: FormBuilder
  ) {
    this.mealForm = this.fb.group({
      description: [''],
      recipe_ids: [[]],
      notes: ['']
    });
  }

  ngOnInit() {
    this.generateWeek();
    this.loadData();
  }

  generateWeek() {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date();
        date.setDate(today.getDate() + i);
        this.weekDays.push(date);
    }
  }

  loadData() {
    const start = this.formatDate(this.weekDays[0]);
    const end = this.formatDate(this.weekDays[6]);
    
    this.isLoading = true;
    this.mealsService.getMealPlan(start, end).subscribe((data: any) => {
      this.mealPlan = data;
      this.isLoading = false;
    }, () => this.isLoading = false);
    
    this.mealsService.getRecipes().subscribe((data: any) => this.recipes = data);
  }

  getMeal(date: Date, type: string) {
    const dateStr = this.formatDate(date);
    return this.mealPlan.find(m => m.meal_date === dateStr && m.meal_type === type);
  }

  editMeal(date: Date, type: 'lunch' | 'dinner') {
    const existing = this.getMeal(date, type);
    this.editingMeal = existing ? { ...existing } : { meal_date: this.formatDate(date), meal_type: type };
    
    const recipeIds = existing?.recipes?.map(r => Number(r.id)) || [];
    
    this.mealForm.reset({
      description: this.editingMeal.description || '',
      recipe_ids: recipeIds,
      notes: this.editingMeal.notes || ''
    });
  }

  isRecipeSelected(id: any): boolean {
    const selected: any[] = this.mealForm.get('recipe_ids')?.value || [];
    return selected.map(v => Number(v)).includes(Number(id));
  }

  toggleRecipe(id: any) {
    const selected: any[] = [...(this.mealForm.get('recipe_ids')?.value || [])];
    const numId = Number(id);
    const index = selected.findIndex(v => Number(v) === numId);
    if (index > -1) {
      selected.splice(index, 1); // Rimuove se già presente
    } else {
      selected.push(numId); // Aggiunge se non presente
    }
    this.mealForm.get('recipe_ids')?.setValue(selected);
  }

  saveMeal() {
    if (!this.editingMeal || this.isLoading) return;
    this.isLoading = true;
    const mealData = { ...this.editingMeal, ...this.mealForm.value };
    this.mealsService.saveMeal(mealData).subscribe(() => {
      this.editingMeal = null;
      this.loadData();
    }, () => this.isLoading = false);
  }

  generateShoppingList() {
    const mealsWithRecipes = this.mealPlan.filter(m => m.recipes && m.recipes.length > 0);
    const mealIds = mealsWithRecipes.map(m => m.id!);
    
    if (mealIds.length === 0) {
        alert("Pianifica qualche pasto con ricetta per generare la spesa!");
        return;
    }
    if (confirm("Generare la lista della spesa per i prossimi 7 giorni?")) {
        this.isLoading = true;
        this.mealsService.generateShoppingList(mealIds).subscribe(res => {
            this.isLoading = false;
            alert(res.message);
        }, () => this.isLoading = false);
    }
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

