import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TasksComponent } from './tasks.component';
import { TasksApiService } from './tasks/tasks-api.service';
import { HouseholdTask } from './tasks/task.models';

function task(values: Partial<HouseholdTask> = {}): HouseholdTask {
  return {
    id: 1, title: 'Attività', description: null, assigned_to: null, assigned_username: null,
    status: 'open', priority: 'normal', due_date: null, completed_at: null, version: 1, ...values
  };
}

async function setupTasks(items: HouseholdTask[], archivedItems: HouseholdTask[] = []) {
  const list = vi.fn((archived: boolean) => of(archived ? archivedItems : items));
  await TestBed.configureTestingModule({
    imports: [TasksComponent],
    providers: [{ provide: TasksApiService, useValue: {
      list, members: () => of([{ id: 1, username: 'Emiliano' }, { id: 2, username: 'Giulia' }])
    } }]
  }).compileComponents();
  const fixture = TestBed.createComponent(TasksComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, list };
}

describe('TasksComponent', () => {
  it('searches titles and descriptions across all statuses locally, ignoring case and surrounding spaces', async () => {
    const { fixture, component, list } = await setupTasks([
      task({ id: 1, title: 'Comprare latte' }),
      task({ id: 2, title: 'Cucina', description: 'Sistemare il LATTE', status: 'in_progress' }),
      task({ id: 3, title: 'Latte consegnato', status: 'completed' }),
      task({ id: 4, title: 'Pane' })
    ]);
    const input = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = '  LaTtE ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(component.todo().map(task => task.id)).toEqual([1]);
    expect(component.doing().map(task => task.id)).toEqual([2]);
    expect(component.done().map(task => task.id)).toEqual([3]);
    expect(list).toHaveBeenCalledTimes(1);
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(component.todo().map(task => task.id)).toEqual([1, 4]);
  });

  it('combines search with member filters and retains it when switching to the archive', async () => {
    const { fixture, component, list } = await setupTasks([
      task({ id: 1, title: 'Spesa', assigned_to: 1 }),
      task({ id: 2, title: 'Spesa', assigned_to: 2 }),
      task({ id: 3, title: 'Spesa' })
    ], [task({ id: 4, description: 'Spesa', status: 'completed', assigned_to: 2 })]);
    component.search.set('spesa');
    component.toggleMember(1);
    expect(component.todo().map(task => task.id)).toEqual([2, 3]);
    component.toggleArchive();
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith(true);
    expect(component.search()).toBe('spesa');
    expect(component.done().map(task => task.id)).toEqual([4]);
    component.search.set('nessuna corrispondenza');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p[role="status"]')?.textContent).toContain('Nessuna attività');
    component.toggleArchive();
    expect(component.search()).toBe('nessuna corrispondenza');
  });

  it('sorts completions newest first, including time, with missing dates last without changing other columns', async () => {
    const items = [
      task({ id: 1, status: 'completed', completed_at: '2026-09-16 09:00:00', due_date: '2099-12-31' }),
      task({ id: 2, status: 'completed', completed_at: '2026-09-16 10:00:00', due_date: '2020-01-01' }),
      task({ id: 3, status: 'completed' }),
      task({ id: 4, status: 'completed', completed_at: '2026-09-16 10:00:00' }),
      task({ id: 5 }), task({ id: 6 }),
      task({ id: 7, status: 'in_progress' }), task({ id: 8, status: 'in_progress' })
    ];
    const { component } = await setupTasks(items);
    expect(component.done().map(task => task.id)).toEqual([4, 2, 1, 3]);
    expect(component.todo().map(task => task.id)).toEqual([5, 6]);
    expect(component.doing().map(task => task.id)).toEqual([7, 8]);
    expect(items.map(task => task.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('shows local completion dates instead of deadlines only for completed tasks', async () => {
    const { fixture } = await setupTasks([
      task({ id: 1, status: 'completed', completed_at: '2026-09-16 23:30:00', due_date: '2099-12-31' }),
      task({ id: 2, status: 'completed', due_date: '2099-12-31' }),
      task({ id: 3, due_date: '2026-09-20' }),
      task({ id: 4, status: 'in_progress', due_date: '2026-09-21' })
    ]);
    const done = fixture.nativeElement.querySelector('[data-status="completed"]') as HTMLElement;
    const expected = new Intl.DateTimeFormat('it-IT', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date('2026-09-16T23:30:00Z'));
    expect(done.textContent).toContain('Completata il ' + expected);
    expect(done.textContent).toContain('Data di completamento non disponibile');
    expect(done.textContent).not.toContain('31/12/2099');
    expect(done.querySelector('.due-date')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-status="open"] .due-date')?.textContent).toBe('20/09/2026');
    expect(fixture.nativeElement.querySelector('[data-status="in_progress"] .due-date')?.textContent).toBe('21/09/2026');
  });

  it('identifies the status columns for responsive ordering and preserves the desktop sequence', async () => {
    await TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [{ provide: TasksApiService, useValue: { list: () => of([]), members: () => of([]) } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(TasksComponent);
    fixture.detectChanges();

    const columns = Array.from(
      fixture.nativeElement.querySelectorAll('.kanban-column')
    ) as HTMLElement[];
    expect(columns.map(column => column.dataset['status'])).toEqual(['open', 'in_progress', 'completed']);
    expect(columns.map(column => column.querySelector('h2')?.textContent)).toEqual([
      'Da fare (0)', 'In corso (0)', 'Fatto (0)'
    ]);
    for (const column of columns) {
      expect(column.getAttribute('aria-labelledby')).toBe(column.querySelector('h2')?.id);
    }
  });

  it('keeps the editor open when a drag starts in the form and ends on the backdrop', async () => {
    await TestBed.configureTestingModule({
      imports: [TasksComponent],
      providers: [{ provide: TasksApiService, useValue: { list: () => of([]), members: () => of([]) } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(TasksComponent);
    fixture.componentInstance.openNew();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[formControlName="title"]') as HTMLInputElement;
    const backdrop = fixture.nativeElement.querySelector('.task-modal-backdrop') as HTMLDivElement;
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.editorOpen()).toBe(true);

    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixture.componentInstance.editorOpen()).toBe(false);
  });
});
