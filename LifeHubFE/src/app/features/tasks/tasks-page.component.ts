import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  taskForm: FormGroup;

  constructor(
    private tasksService: TasksService,
    private fb: FormBuilder
  ) {
    this.taskForm = this.fb.group({
      title: ['', Validators.required],
      description: [''],
      assigned_to: [null],
      priority: ['medium'],
      due_date: [''],
      status: ['todo']
    });
  }

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
    this.taskForm.reset({
      title: '',
      description: '',
      assigned_to: null,
      priority: 'medium',
      due_date: '',
      status: 'todo'
    });
  }

  editTask(task: Task) {
    this.editingTask = { ...task };
    this.taskForm.patchValue({
      title: task.title,
      description: task.description,
      assigned_to: task.assigned_to,
      priority: task.priority,
      due_date: task.due_date,
      status: task.status
    });
  }

  saveTask() {
    if (this.taskForm.invalid || !this.editingTask) return;
    const taskData = { ...this.editingTask, ...this.taskForm.value };
    this.tasksService.saveTask(taskData).subscribe(() => {
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

