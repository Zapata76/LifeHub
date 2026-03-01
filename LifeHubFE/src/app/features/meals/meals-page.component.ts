import { Component, OnInit } from '@angular/core';
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

  constructor(private mealsService: MealsService) {}

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
    
    this.mealsService.getMealPlan(start, end).subscribe((data: any) => this.mealPlan = data);
    this.mealsService.getRecipes().subscribe((data: any) => this.recipes = data);
  }

  getMeal(date: Date, type: string) {
    const dateStr = this.formatDate(date);
    return this.mealPlan.find(m => m.meal_date === dateStr && m.meal_type === type);
  }

  editMeal(date: Date, type: 'lunch' | 'dinner') {
    const existing = this.getMeal(date, type);
    this.editingMeal = existing ? { ...existing } : { meal_date: this.formatDate(date), meal_type: type };
  }

  saveMeal() {
    if (!this.editingMeal) return;
    this.mealsService.saveMeal(this.editingMeal).subscribe(() => {
      this.editingMeal = null;
      this.loadData();
    });
  }

  generateShoppingList() {
    const mealIds = this.mealPlan.filter(m => m.recipe_id).map(m => m.id!);
    if (mealIds.length === 0) {
        alert("Pianifica qualche pasto con ricetta per generare la spesa!");
        return;
    }
    if (confirm("Generare la lista della spesa per i prossimi 7 giorni?")) {
        this.mealsService.generateShoppingList(mealIds).subscribe(res => {
            alert(res.message);
        });
    }
  }

  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

