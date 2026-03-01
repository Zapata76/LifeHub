import { Component, OnInit } from '@angular/core';
import { TasksService, Task, FamilyMember } from './tasks.service';

@Component({
  selector: 'app-tasks-page',
  template: `
    <div class="container dark-theme">
      <header>
        <div class="header-content">
          <div class="header-row header-top">
            <h1 class="page-title">
              <span class="title-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              </span>
              <span>Attivita</span>
            </h1>
          </div>
          <div class="header-row header-bottom">
            <div class="header-controls">
                <button class="btn-primary btn-sm" (click)="createNewTask()">+ Nuova</button>
                <span class="user-badge" *ngIf="familyMember">{{ familyMember }}</span>
                <a routerLink="/home" class="home-link">Home Hub</a>
            </div>
          </div>
        </div>
      </header>

      <main>
        <!-- Task Editor (Modal) -->
        <div class="modal" *ngIf="editingTask" (click)="cancelEdit()">
          <div class="modal-content card" (click)="$event.stopPropagation()">
            <h2>{{ editingTask.id ? 'Modifica' : 'Nuova' }} Attivita</h2>
            
            <div class="modal-body-scroll">
                <div class="form-group">
                    <label>Titolo</label>
                    <input type="text" [(ngModel)]="editingTask.title" placeholder="Cosa c'e da fare?" class="title-input">
                </div>

                <div class="form-group">
                    <label>Descrizione</label>
                    <textarea [(ngModel)]="editingTask.description" placeholder="Aggiungi dettagli..." class="desc-textarea"></textarea>
                </div>

                <div class="form-row">
                    <div class="form-group flex-1">
                        <label>Assegnata a</label>
                        <select [(ngModel)]="editingTask.assigned_to">
                            <option [ngValue]="null">Chiunque</option>
                            <option *ngFor="let m of members" [ngValue]="m.id">{{ m.username }}</option>
                        </select>
                    </div>
                    <div class="form-group flex-1">
                        <label>Priorita</label>
                        <select [(ngModel)]="editingTask.priority">
                            <option value="low">Bassa</option>
                            <option value="medium">Media</option>
                            <option value="high">Alta</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group flex-1">
                        <label>Scadenza</label>
                        <input type="date" [(ngModel)]="editingTask.due_date">
                    </div>
                    <div class="form-group flex-1">
                        <label>Stato</label>
                        <select [(ngModel)]="editingTask.status">
                            <option value="todo">Da fare</option>
                            <option value="doing">In corso</option>
                            <option value="done">Fatto</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
              <button class="btn-secondary" (click)="cancelEdit()">Annulla</button>
              <button class="btn-primary" (click)="saveTask()" [disabled]="!editingTask.title">Salva</button>
            </div>
          </div>
        </div>

        <!-- Kanban Board -->
        <div class="kanban-board">
            <!-- TODO Column -->
            <div class="kanban-col">
                <h3 class="col-title">DA FARE ({{ getTasksByStatus('todo').length }})</h3>
                <div class="task-list">
                    <div class="task-card card" *ngFor="let t of getTasksByStatus('todo')" (click)="editTask(t)" [class.high-priority]="t.priority === 'high'">
                        <div class="task-header">
                            <span class="priority-dot" [attr.data-prio]="t.priority"></span>
                            <h4>{{ t.title }}</h4>
                        </div>
                        <p class="task-desc">{{ t.description }}</p>
                        <div class="task-footer">
                            <span class="user-tag" *ngIf="t.assigned_user">{{ t.assigned_user }}</span>
                            <span class="due-date" *ngIf="t.due_date">{{ t.due_date | date:'dd/MM' }}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- DOING Column -->
            <div class="kanban-col">
                <h3 class="col-title">IN CORSO ({{ getTasksByStatus('doing').length }})</h3>
                <div class="task-list">
                    <div class="task-card card" *ngFor="let t of getTasksByStatus('doing')" (click)="editTask(t)">
                        <h4>{{ t.title }}</h4>
                        <div class="task-footer">
                            <span class="user-tag" *ngIf="t.assigned_user">{{ t.assigned_user }}</span>
                            <button class="done-btn" (click)="markAsDone(t); $event.stopPropagation()">Fatto</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- DONE Column -->
            <div class="kanban-col">
                <h3 class="col-title">FATTO ({{ getTasksByStatus('done').length }})</h3>
                <div class="task-list">
                    <div class="task-card card done" *ngFor="let t of getTasksByStatus('done')">
                        <h4>{{ t.title }}</h4>
                        <div class="task-footer">
                            <button class="delete-btn" (click)="deleteTask(t); $event.stopPropagation()">Elimina</button>
                        </div>
                    </div>
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
    .header-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    
    .page-title { color: #4f8cff; font-size: 1.4rem; margin: 0; display: flex; align-items: center; gap: 10px; }
    .title-icon { width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; }
    .title-icon svg { width: 100%; height: 100%; fill: none; stroke: #4f8cff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .user-badge { font-size: 0.8rem; color: #4f8cff; border: 1px solid #4f8cff44; padding: 4px 10px; border-radius: 6px; }
    .home-link { color: #9aa0a6; text-decoration: none; font-size: 0.85rem; border: 1px solid #333; padding: 4px 10px; border-radius: 6px; background: #2a2a2a; }
    
    main { padding: 15px; max-width: 1200px; margin: 0 auto; }
    
    .kanban-board { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
    @media (min-width: 900px) { .kanban-board { grid-template-columns: repeat(3, 1fr); } }

    .kanban-col { background: #181818; border-radius: 12px; padding: 15px; min-height: 200px; }
    .col-title { font-size: 0.8rem; color: #9aa0a6; margin-bottom: 15px; font-weight: bold; text-transform: uppercase; }
    
    .task-list { display: flex; flex-direction: column; gap: 10px; }
    .task-card { background-color: #1e1e1e; padding: 15px; cursor: pointer; border: 1px solid #2a2a2a; border-radius: 8px; transition: 0.2s; }
    .task-card.high-priority { border-left: 4px solid #ff5c5c; }
    .task-card.done { opacity: 0.5; }
    
    .task-header { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
    .task-header h4 { margin: 0; font-size: 0.95rem; }
    .priority-dot { width: 6px; height: 6px; border-radius: 50%; }
    .priority-dot[data-prio="high"] { background: #ff5c5c; }
    .priority-dot[data-prio="medium"] { background: #ffcc00; }
    .priority-dot[data-prio="low"] { background: #27ae60; }

    .task-desc { font-size: 0.85rem; color: #9aa0a6; margin-bottom: 10px; }
    .task-footer { display: flex; justify-content: space-between; align-items: center; }
    .user-tag { font-size: 0.7rem; background: #2a2a2a; padding: 2px 6px; border-radius: 4px; }
    .due-date { font-size: 0.7rem; color: #ff5c5c; }

    /* Modal / Form Styling */
    .modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 15px; }
    .modal-content { 
        width: 100%; 
        max-width: 550px; 
        max-height: 90vh; 
        background-color: #1e1e1e; 
        border-radius: 12px; 
        border: 1px solid #2a2a2a; 
        display: flex; 
        flex-direction: column; 
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        border-top: 6px solid #4f8cff;
    }
    .modal-content h2 { padding: 20px 25px 0 25px; margin: 0; color: #4f8cff; font-size: 1.4rem; }
    .modal-body-scroll { padding: 20px 25px; overflow-y: auto; flex-grow: 1; }
    
    .form-group { margin-bottom: 20px; }
    .form-row { display: flex; gap: 15px; }
    .flex-1 { flex: 1; }
    label { display: block; color: #9aa0a6; font-size: 0.85rem; margin-bottom: 8px; font-weight: 500; }
    input, textarea, select { width: 100%; padding: 12px; background: #121212; border: 1px solid #333; color: white; border-radius: 8px; box-sizing: border-box; font-size: 1rem; }
    input:focus, textarea:focus, select:focus { border-color: #4f8cff; outline: none; }
    .desc-textarea { height: 120px; resize: none; line-height: 1.5; }
    
    .modal-footer { padding: 15px 25px 25px 25px; display: flex; gap: 12px; background: #1e1e1e; border-radius: 0 0 12px 12px; }
    .modal-footer button { flex: 1; padding: 14px; border-radius: 8px; border: none; font-weight: bold; cursor: pointer; font-size: 1rem; transition: opacity 0.2s; }
    .btn-primary { background: #4f8cff; color: white; }
    .btn-secondary { background: #333; color: #e4e4e4; }
    .btn-primary:disabled { opacity: 0.3; }
    .btn-sm { padding: 5px 15px; width: auto; font-size: 0.85rem; }
  `]
})
export class TasksPageComponent implements OnInit {
  tasks: Task[] = [];
  members: FamilyMember[] = [];
  editingTask: Task | null = null;
  familyMember: string = '';

  constructor(private tasksService: TasksService) {}

  ngOnInit() {
    this.loadTasks();
    this.tasksService.getFamilyMembers().subscribe((data: any) => this.members = data);
  }

  loadTasks() {
    this.tasksService.getTasks().subscribe((data: any) => this.tasks = data);
  }

  getTasksByStatus(status: string) {
    return this.tasks.filter(t => t.status === status);
  }

  createNewTask() {
    this.editingTask = { title: '', description: '', status: 'todo', priority: 'medium', assigned_to: undefined };
  }

  editTask(task: Task) {
    this.editingTask = { ...task };
  }

  saveTask() {
    if (!this.editingTask) return;
    this.tasksService.saveTask(this.editingTask).subscribe(() => {
      this.editingTask = null;
      this.loadTasks();
    });
  }

  markAsDone(task: Task) {
    task.status = 'done';
    this.tasksService.saveTask(task).subscribe(() => this.loadTasks());
  }

  deleteTask(task: Task) {
    if (confirm("Eliminare questa attivita?")) {
      this.tasksService.deleteTask(task.id!).subscribe(() => this.loadTasks());
    }
  }

  cancelEdit() {
    this.editingTask = null;
  }
}

