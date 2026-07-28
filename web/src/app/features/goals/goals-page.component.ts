import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { SessionStore } from '../../core/session.store';
import { GoalsApiService } from './goals-api.service';
import {
  GoalItem, GoalPayload, GoalStatus, GoalTracker, GoalTrackerPayload,
  GoalsOverview, TrackerFrequency, TrackerType
} from './goals.models';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './goals-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GoalsPageComponent {
  private readonly api = inject(GoalsApiService);
  readonly session = inject(SessionStore);
  readonly overview = signal<GoalsOverview>({ goals: [], members: [] });
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly hiddenOwners = signal<Set<number>>(new Set());
  readonly editorOpen = signal(false);
  readonly editing = signal<GoalItem | null>(null);
  readonly trackerDrafts = signal<GoalTrackerPayload[]>([]);
  readonly deleteTarget = signal<GoalItem | null>(null);
  readonly logTarget = signal<{ goal: GoalItem; tracker: GoalTracker } | null>(null);

  readonly isChild = computed(() => this.session.user()?.role === 'child');
  readonly canManage = computed(() => ['admin', 'adult'].includes(this.session.user()?.role ?? ''));
  readonly filteredGoals = computed(() => this.overview().goals.filter(
    (goal) => !this.hiddenOwners().has(Number(goal.owner_id))
  ));

  readonly goalForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(20000)] }),
    startDate: new FormControl('', { nonNullable: true }),
    endDate: new FormControl('', { nonNullable: true }),
    ownerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl<GoalStatus>('active', { nonNullable: true })
  });
  readonly trackerForm = new FormGroup({
    type: new FormControl<TrackerType>('boolean', { nonNullable: true }),
    frequency: new FormControl<TrackerFrequency>('daily', { nonNullable: true })
  });
  readonly logForm = new FormGroup({
    date: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    value: new FormControl<number | null>(null),
    done: new FormControl(true, { nonNullable: true }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] })
  });

  constructor() {
    this.load();
  }

  load(message = ''): void {
    this.loading.set(true);
    this.error.set('');
    this.api.overview().subscribe({
      next: (overview) => {
        this.overview.set({
          goals: overview.goals.map((goal) => ({
            ...goal,
            id: Number(goal.id), owner_id: Number(goal.owner_id), version: Number(goal.version),
            trackers: goal.trackers.map((tracker) => ({
              ...tracker, id: Number(tracker.id), goal_id: Number(tracker.goal_id), version: Number(tracker.version),
              logs: tracker.logs.map((log) => ({ ...log, id: Number(log.id), version: Number(log.version) }))
            }))
          })),
          members: overview.members.map((member) => ({ ...member, id: Number(member.id) }))
        });
        this.success.set(message);
        this.loading.set(false);
      },
      error: () => this.fail('Impossibile caricare obiettivi e progressi.')
    });
  }

  toggleOwner(id: number): void {
    const next = new Set(this.hiddenOwners());
    next.has(id) ? next.delete(id) : next.add(id);
    this.hiddenOwners.set(next);
  }

  openCreate(): void {
    if (!this.canManage()) return;
    const userId = this.session.user()?.id ?? this.overview().members[0]?.id ?? 0;
    this.editing.set(null);
    this.trackerDrafts.set([]);
    this.goalForm.reset({
      title: '', description: '', startDate: '', endDate: '', ownerId: String(userId), status: 'active'
    });
    this.editorOpen.set(true);
  }

  openEdit(goal: GoalItem): void {
    if (!goal.can_edit) return;
    this.editing.set(goal);
    this.trackerDrafts.set(goal.trackers.map((tracker) => ({
      id: tracker.id, type: tracker.tracker_type, frequency: tracker.frequency_code
    })));
    this.goalForm.setValue({
      title: goal.title,
      description: goal.description ?? '',
      startDate: goal.start_date ?? '',
      endDate: goal.end_date ?? '',
      ownerId: String(goal.owner_id),
      status: goal.status
    });
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    if (!this.busy()) this.editorOpen.set(false);
  }

  editorBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeEditor();
  }

  addTracker(): void {
    if (this.trackerDrafts().length >= 12) return;
    const value = this.trackerForm.getRawValue();
    this.trackerDrafts.update((items) => [...items, { id: null, type: value.type, frequency: value.frequency }]);
  }

  removeTracker(index: number): void {
    this.trackerDrafts.update((items) => items.filter((_, position) => position !== index));
  }

  save(): void {
    if (this.goalForm.invalid || this.busy()) return;
    const value = this.goalForm.getRawValue();
    const payload: GoalPayload = {
      title: value.title.trim(),
      description: value.description.trim(),
      startDate: value.startDate || null,
      endDate: value.endDate || null,
      ownerId: Number(value.ownerId),
      status: value.status,
      trackers: this.trackerDrafts()
    };
    const editing = this.editing();
    this.busy.set(true);
    this.error.set('');
    const request: Observable<unknown> = editing
      ? this.api.update(editing.id, { ...payload, version: editing.version })
      : this.api.create(payload);
    request.subscribe({
      next: () => {
        this.editorOpen.set(false);
        this.busy.set(false);
        this.load(editing ? 'Obiettivo aggiornato.' : 'Obiettivo creato.');
      },
      error: () => this.fail('L’obiettivo non è stato salvato: controlla i dati e riprova.')
    });
  }

  confirmDelete(goal: GoalItem): void {
    if (goal.can_edit) this.deleteTarget.set(goal);
  }

  deleteGoal(): void {
    const goal = this.deleteTarget();
    if (!goal || this.busy()) return;
    this.busy.set(true);
    this.api.delete(goal.id, goal.version).subscribe({
      next: () => {
        this.deleteTarget.set(null);
        this.busy.set(false);
        this.load('Obiettivo eliminato definitivamente.');
      },
      error: () => this.fail('Eliminazione non riuscita: l’obiettivo potrebbe essere cambiato.')
    });
  }

  openLog(goal: GoalItem, tracker: GoalTracker): void {
    if (!goal.can_log) return;
    const latest = tracker.logs[0];
    this.logForm.reset({
      date: this.today(),
      value: tracker.tracker_type === 'percentage' && latest?.value_number !== null
        ? Number(latest?.value_number) : null,
      done: latest?.value_boolean === null ? true : Boolean(Number(latest.value_boolean)),
      note: ''
    });
    this.logTarget.set({ goal, tracker });
  }

  saveLog(): void {
    const target = this.logTarget();
    if (!target || this.logForm.invalid || this.busy()) return;
    const value = this.logForm.getRawValue();
    if (target.tracker.tracker_type !== 'boolean' && value.value === null) return;
    this.busy.set(true);
    this.api.saveLog(
      target.tracker.id,
      value.date,
      target.tracker.tracker_type === 'boolean' ? value.done : Number(value.value),
      value.note.trim()
    ).subscribe({
      next: () => {
        this.logTarget.set(null);
        this.busy.set(false);
        this.load('Progresso registrato.');
      },
      error: () => this.fail('Il progresso non è stato registrato: controlla il valore e riprova.')
    });
  }

  completion(goal: GoalItem): number {
    if (goal.trackers.length === 0) return 0;
    const total = goal.trackers.reduce((sum, tracker) => {
      const latest = tracker.logs[0];
      if (!latest) return sum;
      if (tracker.tracker_type === 'boolean') {
        return sum + (Boolean(Number(latest.value_boolean ?? latest.value_number)) ? 100 : 0);
      }
      if (tracker.tracker_type === 'percentage') {
        return sum + Math.max(0, Math.min(100, Number(latest.value_number ?? 0)));
      }
      return sum + 50;
    }, 0);
    return Math.round(total / goal.trackers.length);
  }

  badges(goal: GoalItem): string[] {
    const badges: string[] = [];
    const progress = this.completion(goal);
    if (progress >= 100) badges.push('🏆 Super!');
    if (progress >= 50) badges.push('⭐ Grande!');
    if (goal.trackers.some((tracker) => tracker.logs.length > 5)) badges.push('🔥 Costanza');
    return badges;
  }

  trackerType(type: TrackerType): string {
    return { boolean: 'Sì/No', quantity: 'Numerico', percentage: 'Percentuale' }[type];
  }

  frequency(value: TrackerFrequency): string {
    return value === 'daily' ? 'Giornaliero' : 'Settimanale';
  }

  status(value: GoalStatus): string {
    return { active: 'Attivo', completed: 'Completato', suspended: 'Sospeso' }[value];
  }

  formatDate(value: string | null): string {
    if (!value) return 'N/D';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  logValue(tracker: GoalTracker): string {
    const latest = tracker.logs[0];
    if (!latest) return 'Nessun progresso';
    if (tracker.tracker_type === 'boolean') return Boolean(Number(latest.value_boolean ?? latest.value_number)) ? 'Fatto' : 'Non fatto';
    const suffix = tracker.tracker_type === 'percentage' ? '%' : '';
    return `${Number(latest.value_number)}${suffix}`;
  }

  historyValue(tracker: GoalTracker, value: number | string | null): string {
    return `${Number(value ?? 0)}${tracker.tracker_type === 'percentage' ? '%' : ''}`;
  }

  private today(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.busy.set(false);
    this.loading.set(false);
  }
}
