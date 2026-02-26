import { Component, OnInit } from '@angular/core';
import { MealsService, MealPlan, Recipe } from './meals.service';

@Component({
  selector: 'app-root',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1>🍽️ Pianificazione Pasti</h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
                <button class="btn-primary btn-sm" (click)="generateShoppingList()">🛒 Genera Spesa</button>
                <a href="../home.php" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <main>
        <div class="week-grid">
          <div class="day-card card" *ngFor="let day of weekDays">
            <div class="day-header">
                <h3>{{ day | date:'EEEE' }}</h3>
                <small>{{ day | date:'dd/MM' }}</small>
            </div>
            
            <div class="meal-slot" (click)="editMeal(day, 'lunch')">
                <label>Pranzo</label>
                <div class="meal-content" [class.empty]="!getMeal(day, 'lunch')">
                    {{ getMeal(day, 'lunch')?.recipe_name || 'Non pianificato' }}
                </div>
            </div>

            <div class="meal-slot" (click)="editMeal(day, 'dinner')">
                <label>Cena</label>
                <div class="meal-content" [class.empty]="!getMeal(day, 'dinner')">
                    {{ getMeal(day, 'dinner')?.recipe_name || 'Non pianificato' }}
                </div>
            </div>
          </div>
        </div>

        <!-- Editor Pasto (Modal) -->
        <div class="modal" *ngIf="editingMeal" (click)="editingMeal = null">
          <div class="modal-content card" (click)="$event.stopPropagation()">
            <h2>Pianifica Pasto</h2>
            <p>{{ editingMeal.meal_date | date:'dd/MM/yyyy' }} - {{ editingMeal.meal_type === 'lunch' ? 'Pranzo' : 'Cena' }}</p>
            
            <div class="form-group">
                <label>Scegli Ricetta</label>
                <select [(ngModel)]="editingMeal.recipe_id">
                    <option [value]="undefined">Libero / Nessuna ricetta</option>
                    <option *ngFor="let r of recipes" [value]="r.id">{{ r.name }}</option>
                </select>
            </div>

            <div class="form-group">
                <label>Note aggiuntive</label>
                <textarea [(ngModel)]="editingMeal.notes" placeholder="Esempio: ospite a cena..."></textarea>
            </div>

            <div class="modal-footer">
              <button class="btn-secondary" (click)="editingMeal = null">Annulla</button>
              <button class="btn-primary" (click)="saveMeal()">Salva</button>
            </div>
          </div>
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
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }

    main { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .week-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .day-card { display: flex; flex-direction: column; padding: 15px; background: #1e1e1e; border-radius: 12px; }
    .day-header { text-align: center; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 10px; }
    .day-header h3 { margin: 0; font-size: 1rem; color: #4f8cff; text-transform: capitalize; }
    .day-header small { color: #666; }

    .meal-slot { margin-bottom: 15px; cursor: pointer; }
    .meal-slot label { font-size: 0.7rem; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .meal-content { background: #252525; padding: 10px; border-radius: 8px; font-size: 0.85rem; min-height: 40px; display: flex; align-items: center; border: 1px solid transparent; transition: 0.2s; }
    .meal-content:hover { border-color: #4f8cff; }
    .meal-content.empty { color: #444; font-style: italic; }

    /* Modal */
    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 20px; }
    .modal-content { width: 100%; max-width: 500px; padding: 25px; }
    .modal-content h2 { margin-top: 0; color: #4f8cff; }
    
    .form-group { margin-bottom: 15px; }
    label { display: block; color: #9aa0a6; font-size: 0.8rem; margin-bottom: 5px; }
    select, textarea { width: 100%; padding: 12px; background: #121212; border: 1px solid #333; color: white; border-radius: 8px; box-sizing: border-box; }
    textarea { height: 80px; resize: none; }
    
    .modal-footer { display: flex; gap: 10px; margin-top: 20px; }
    .modal-footer button { flex: 1; padding: 12px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; }
    .btn-primary { background: #4f8cff; color: white; }
    .btn-secondary { background: #333; color: #e4e4e4; }
    .btn-sm { padding: 5px 15px; width: auto; font-size: 0.85rem; }
  `]
})
export class AppComponent implements OnInit {
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
