/**
 * Presents the task Kanban and modal editor.
 * Persistence, permissions, and concurrency remain authoritative in the task API.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmationService } from '../shared/confirmation.service';
import { HouseholdTask, TaskCommand, TaskPriority, TaskStatus } from './tasks/task.models';
import { TasksApiService } from './tasks/tasks-api.service';
import { apiErrorMessage } from '../shared/api-error';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tasks/tasks.component.html',
})
export class TasksComponent {
  private readonly api = inject(TasksApiService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly completionDateFormatter = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  readonly tasks = signal<HouseholdTask[]>([]);
  readonly members = signal<{ id: number; username: string }[]>([]);
  readonly memberFilters = signal<Set<number>>(new Set());
  readonly search = signal('');
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly showArchived = signal(false);
  readonly editorOpen = signal(false);
  readonly editing = signal<HouseholdTask | null>(null);
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    assignedTo: new FormControl('', { nonNullable: true }),
    priority: new FormControl<TaskPriority>('normal', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
    status: new FormControl<TaskStatus>('open', { nonNullable: true })
  });
  readonly todo = computed(() => this.filtered('open'));
  readonly doing = computed(() => this.filtered('in_progress'));
  readonly done = computed(() => this.filtered('completed').sort((a, b) =>
    (b.completed_at ?? '').localeCompare(a.completed_at ?? '') || b.id - a.id));

  constructor() { this.load(true); }

  load(includeMembers = false): void {
    this.loading.set(true);
    const tasksRequest = this.api.list(this.showArchived());
    if (includeMembers) {
      forkJoin({ tasks: tasksRequest, members: this.api.members() }).subscribe({
        next: ({ tasks, members }) => {
          this.tasks.set(tasks); this.members.set(members);
          this.memberFilters.set(new Set(members.map((member) => member.id)));
          this.finishLoad();
        },
        error: () => this.failLoad()
      });
      return;
    }
    tasksRequest.subscribe({ next: (tasks) => { this.tasks.set(tasks); this.finishLoad(); }, error: () => this.failLoad() });
  }

  openNew(): void {
    this.editing.set(null);
    this.form.reset({ title: '', description: '', assignedTo: '', priority: 'normal', dueDate: '', status: 'open' });
    this.editorOpen.set(true);
  }

  openEdit(task: HouseholdTask): void {
    if (this.showArchived()) return;
    this.editing.set(task);
    this.form.setValue({
      title: task.title, description: task.description ?? '', assignedTo: task.assigned_to ? String(task.assigned_to) : '',
      priority: task.priority, dueDate: task.due_date ?? '', status: task.status
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void { if (!this.busy()) this.editorOpen.set(false); }

  editorBackdropMouseDown(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeEditor();
  }

  save(): void {
    if (this.form.invalid) return;
    const task = this.editing();
    const request = task ? this.api.update(task, this.command()) : this.api.create(this.command());
    this.busy.set(true); this.error.set('');
    request.subscribe({
      next: () => { this.editorOpen.set(false); this.busy.set(false); this.load(); },
      error: (failure: unknown) => {
        this.error.set(apiErrorMessage(failure, 'L’attività non è stata salvata: ricarica e riprova.'));
        this.busy.set(false);
      }
    });
  }

  complete(task: HouseholdTask): void {
    this.mutate(() => this.api.complete(task));
  }

  async archive(task: HouseholdTask): Promise<void> {
    if (!this.showArchived() && !await this.confirmation.confirm({
      title: 'Archivia attività',
      message: `Archiviare “${task.title}”? Potrai ripristinarla dall’archivio.`,
      confirmLabel: 'Archivia',
      danger: true
    })) return;
    this.editorOpen.set(false);
    this.mutate(() => this.api.setArchived(task, this.showArchived()));
  }

  toggleMember(id: number): void {
    const filters = new Set(this.memberFilters());
    filters.has(id) ? filters.delete(id) : filters.add(id);
    this.memberFilters.set(filters);
  }

  toggleArchive(): void { this.showArchived.update((value) => !value); this.load(); }
  isMemberVisible(id: number): boolean { return this.memberFilters().has(id); }
  dueLabel(date: string): string { const [year, month, day] = date.split('-'); return `${day}/${month}/${year}`; }
  completionLabel(date: string): string {
    // API timestamps are UTC MySQL datetimes; display them in the device's local timezone.
    return this.completionDateFormatter.format(new Date(date.replace(' ', 'T') + 'Z'));
  }

  private filtered(status: TaskStatus): HouseholdTask[] {
    const query = this.search().trim().toLocaleLowerCase('it');
    return this.tasks().filter((task) => task.status === status
      && (task.assigned_to === null || this.memberFilters().has(Number(task.assigned_to)))
      && (!query || task.title.toLocaleLowerCase('it').includes(query)
        || (task.description ?? '').toLocaleLowerCase('it').includes(query)));
  }

  private command(): TaskCommand {
    const value = this.form.getRawValue();
    return {
      title: value.title.trim(), description: value.description.trim(),
      assignedTo: value.assignedTo ? Number(value.assignedTo) : null,
      priority: value.priority, dueDate: value.dueDate || null, status: value.status
    };
  }

  private mutate(request: () => ReturnType<TasksApiService['complete']>): void {
    this.busy.set(true); this.error.set('');
    request().subscribe({ next: () => { this.busy.set(false); this.load(); },
      error: (failure: unknown) => {
        this.error.set(apiErrorMessage(failure, 'Operazione non riuscita: ricarica e riprova.'));
        this.busy.set(false);
      } });
  }

  private finishLoad(): void { this.loading.set(false); this.busy.set(false); }
  private failLoad(): void { this.error.set('Impossibile caricare le attività.'); this.loading.set(false); this.busy.set(false); }
}
