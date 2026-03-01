import { Component, OnInit } from '@angular/core';
import { TasksService, Task, FamilyMember } from './tasks.service';

@Component({
  selector: 'app-tasks-page',
  templateUrl: './tasks-page.component.html',
  styleUrls: ['./tasks-page.component.css']
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

