import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ConfirmationDialogComponent } from '../shared/confirmation-dialog.component';
import { TasksComponent } from './tasks.component';
import { HouseholdTask } from './tasks/task.models';
import { SessionStore, SessionUser } from '../core/session.store';

const item: HouseholdTask = {
  id: 12, title: 'Attività da eliminare', description: null, assigned_to: null,
  assigned_username: null, status: 'open', priority: 'normal', due_date: null,
  completed_at: null, version: 3
};

async function setup(archived = false, role: SessionUser['role'] | null = 'admin', assignedTo: number | null = null) {
  await TestBed.configureTestingModule({
    imports: [TasksComponent, ConfirmationDialogComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()]
  }).compileComponents();
  TestBed.inject(SessionStore).set(role === null ? null : {
    id: 7, householdId: 1, role, username: 'Utente'
  }, 'test-token');
  const taskItem = { ...item, assigned_to: assignedTo };
  const board = TestBed.createComponent(TasksComponent);
  const confirmation = TestBed.createComponent(ConfirmationDialogComponent);
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('api/v1/tasks?archived=0').flush({ items: archived ? [] : [taskItem] });
  http.expectOne('api/v1/tasks/members').flush({ items: [
    { id: 7, username: 'Utente' }, { id: 99, username: 'Altro utente' }
  ] });
  if (archived) {
    board.componentInstance.toggleArchive();
    http.expectOne('api/v1/tasks?archived=1').flush({ items: [item] });
  }
  board.detectChanges();
  confirmation.detectChanges();
  return { board, confirmation, http, taskItem };
}

describe('Task removal confirmation', () => {
  const permissions: [SessionUser['role'] | null, number | null, boolean][] = [
    ['admin', null, true], ['admin', 99, true], ['adult', 7, true], ['child', 7, true],
    ['adult', 99, false], ['child', 99, false], ['adult', null, false], ['child', null, false],
    [null, 7, false]
  ];
  it.each(permissions)('enforces archive permissions for role=%s assignee=%s in both views', async (role, assignee, allowed) => {
    const { board, confirmation, http, taskItem } = await setup(false, role, assignee);
    expect(board.nativeElement.querySelector('.task-card-actions .task-delete') !== null).toBe(allowed);
    board.componentInstance.openEdit(taskItem);
    board.detectChanges();
    expect(board.nativeElement.querySelector('.task-modal .task-delete') !== null).toBe(allowed);
    if (!allowed) {
      await board.componentInstance.archive(taskItem);
      confirmation.detectChanges();
      expect(confirmation.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
      http.expectNone('api/v1/tasks/12/archive');
    }
    http.verify();
  });

  for (const source of ['board', 'editor'] as const) {
    it(`archives exactly once after confirming Elimina from the ${source}`, async () => {
      const { board, confirmation, http } = await setup();
      if (source === 'editor') {
        board.componentInstance.openEdit(item);
        board.detectChanges();
      }
      const selector = source === 'editor' ? '.task-modal .task-delete' : '.task-card-actions .task-delete';
      (board.nativeElement.querySelector(selector) as HTMLButtonElement).click();
      confirmation.detectChanges();
      http.expectNone('api/v1/tasks/12/archive');
      expect(board.componentInstance.editorOpen()).toBe(source === 'editor');
      const dialog = confirmation.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
      expect(dialog.textContent).toContain(item.title);
      expect(dialog.textContent).toContain('Potrai ripristinarla');
      (dialog.querySelector('button.danger') as HTMLButtonElement).click();
      await Promise.resolve();
      const request = http.expectOne('api/v1/tasks/12/archive');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ version: 3 });
      request.flush({ changed: true });
      http.expectOne('api/v1/tasks?archived=0').flush({ items: [] });
      board.detectChanges();
      confirmation.detectChanges();
      expect(board.nativeElement.querySelector('.kanban-task')).toBeNull();
      expect(board.componentInstance.editorOpen()).toBe(false);
      expect(confirmation.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
      http.verify();
    });
  }

  it('cancels without a request and preserves unsaved editor fields', async () => {
    const { board, confirmation, http } = await setup();
    board.componentInstance.openEdit(item);
    board.componentInstance.form.controls.description.setValue('Modifica non salvata');
    board.detectChanges();
    (board.nativeElement.querySelector('.task-modal .task-delete') as HTMLButtonElement).click();
    confirmation.detectChanges();
    (confirmation.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(board.componentInstance.editorOpen()).toBe(true);
    expect(board.componentInstance.form.controls.description.value).toBe('Modifica non salvata');
    http.expectNone('api/v1/tasks/12/archive');
    http.verify();
  });

  it('keeps the task and reports an API failure instead of silently removing it', async () => {
    const { board, confirmation, http } = await setup();
    (board.nativeElement.querySelector('.task-card-actions .task-delete') as HTMLButtonElement).click();
    confirmation.detectChanges();
    (confirmation.nativeElement.querySelector('button.danger') as HTMLButtonElement).click();
    await Promise.resolve();
    http.expectOne('api/v1/tasks/12/archive').flush({}, { status: 409, statusText: 'Conflict' });
    board.detectChanges();
    expect(board.nativeElement.querySelector('.kanban-task')).not.toBeNull();
    expect(board.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(board.componentInstance.busy()).toBe(false);
    http.verify();
  });

  it('still restores an archived task without asking to archive it again', async () => {
    const { board, confirmation, http } = await setup(true);
    (board.nativeElement.querySelector('.task-card-actions button') as HTMLButtonElement).click();
    const request = http.expectOne('api/v1/tasks/12/restore');
    expect(request.request.body).toEqual({ version: 3 });
    request.flush({ changed: true });
    http.expectOne('api/v1/tasks?archived=1').flush({ items: [] });
    confirmation.detectChanges();
    expect(confirmation.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
    http.verify();
  });
});
