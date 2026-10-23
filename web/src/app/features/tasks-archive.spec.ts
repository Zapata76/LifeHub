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
    http.expectOne('api/v1/tasks?archived=1').flush({ items: [taskItem] });
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
    expect(board.nativeElement.querySelector('.task-card-actions .task-archive') !== null).toBe(allowed);
    board.componentInstance.openEdit(taskItem);
    board.detectChanges();
    expect(board.nativeElement.querySelector('.task-modal .task-archive') !== null).toBe(allowed);
    if (!allowed) {
      await board.componentInstance.archive(taskItem);
      confirmation.detectChanges();
      expect(confirmation.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
      http.expectNone('api/v1/tasks/12/archive');
    }
    http.verify();
  });

  for (const source of ['board', 'editor'] as const) {
    it(`archives exactly once after confirming Archivia from the ${source}`, async () => {
      const { board, confirmation, http } = await setup();
      if (source === 'editor') {
        board.componentInstance.openEdit(item);
        board.detectChanges();
      }
      const selector = source === 'editor' ? '.task-modal .task-archive' : '.task-card-actions .task-archive';
      expect(board.nativeElement.querySelector(selector).classList.contains('task-delete')).toBe(false);
      (board.nativeElement.querySelector(selector) as HTMLButtonElement).click();
      confirmation.detectChanges();
      http.expectNone('api/v1/tasks/12/archive');
      expect(board.componentInstance.editorOpen()).toBe(source === 'editor');
      const dialog = confirmation.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
      expect(dialog.textContent).toContain(item.title);
      expect(dialog.textContent).toContain('Potrai ripristinarla');
      expect(dialog.classList.contains('is-danger')).toBe(false);
      expect(dialog.querySelector('button.danger')).toBeNull();
      (dialog.querySelector('footer button:last-child') as HTMLButtonElement).click();
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
    (board.nativeElement.querySelector('.task-modal .task-archive') as HTMLButtonElement).click();
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
    (board.nativeElement.querySelector('.task-card-actions .task-archive') as HTMLButtonElement).click();
    confirmation.detectChanges();
    (confirmation.nativeElement.querySelector('footer button:last-child') as HTMLButtonElement).click();
    await Promise.resolve();
    http.expectOne('api/v1/tasks/12/archive').flush({}, { status: 409, statusText: 'Conflict' });
    board.detectChanges();
    expect(board.nativeElement.querySelector('.kanban-task')).not.toBeNull();
    expect(board.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(board.componentInstance.busy()).toBe(false);
    http.verify();
  });

  for (const archived of [false, true]) {
    it.each(permissions)('guards permanent deletion for archived=' + archived + ' role=%s assignee=%s', async (role, assignee, allowed) => {
      const { board, confirmation, http, taskItem } = await setup(archived, role, assignee);
      expect(board.nativeElement.querySelector('.task-delete-permanent') !== null).toBe(allowed);
      if (!allowed) {
        await board.componentInstance.deletePermanently(taskItem);
        confirmation.detectChanges();
        expect(confirmation.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
        http.expectNone('api/v1/tasks/12');
      }
      http.verify();
    });
  }

  for (const source of ['board', 'editor', 'archive'] as const) {
    it(`permanently deletes only after confirmation from ${source}`, async () => {
      const archived = source === 'archive';
      const { board, confirmation, http } = await setup(archived);
      if (source === 'editor') board.componentInstance.openEdit(item);
      board.detectChanges();
      const selector = source === 'editor' ? '.task-modal .task-delete-permanent' : '.task-card-actions .task-delete-permanent';
      (board.nativeElement.querySelector(selector) as HTMLButtonElement).click();
      confirmation.detectChanges();
      http.expectNone('api/v1/tasks/12');
      expect(board.componentInstance.editorOpen()).toBe(source === 'editor');
      expect(confirmation.nativeElement.textContent).toContain('Non sarà possibile ripristinarla');
      expect(confirmation.nativeElement.querySelector('.confirmation-dialog.is-danger')).not.toBeNull();
      expect(confirmation.nativeElement.textContent).toContain(item.title);
      (confirmation.nativeElement.querySelector('button.danger') as HTMLButtonElement).click();
      await Promise.resolve();
      const request = http.expectOne('api/v1/tasks/12');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({ version: 3 });
      await board.componentInstance.deletePermanently(item); // Ignore a repeated click while busy.
      confirmation.detectChanges();
      expect(confirmation.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
      request.flush({ deleted: true });
      http.expectOne(`api/v1/tasks?archived=${archived ? 1 : 0}`).flush({ items: [] });
      board.detectChanges();
      expect(board.componentInstance.editorOpen()).toBe(false);
      expect(board.nativeElement.querySelector('.kanban-task')).toBeNull();
      http.verify();
    });
  }

  it('cancels permanent deletion without losing editor changes', async () => {
    const { board, confirmation, http } = await setup();
    board.componentInstance.openEdit(item);
    board.componentInstance.form.controls.description.setValue('Unsaved');
    const result = board.componentInstance.deletePermanently(item);
    confirmation.detectChanges();
    (confirmation.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await result;
    expect(board.componentInstance.editorOpen()).toBe(true);
    expect(board.componentInstance.form.controls.description.value).toBe('Unsaved');
    http.expectNone('api/v1/tasks/12');
    http.verify();
  });

  it.each([403, 409, 500])('preserves task and editor after failed permanent deletion (%s)', async (status) => {
    const { board, confirmation, http } = await setup();
    board.componentInstance.openEdit(item);
    board.componentInstance.form.controls.description.setValue('Unsaved');
    const result = board.componentInstance.deletePermanently(item);
    confirmation.detectChanges();
    (confirmation.nativeElement.querySelector('button.danger') as HTMLButtonElement).click();
    await result;
    http.expectOne('api/v1/tasks/12').flush({}, { status, statusText: 'Failure' });
    board.detectChanges();
    expect(board.nativeElement.querySelector('.task-modal [role="alert"]')).not.toBeNull();
    expect(board.componentInstance.editorOpen()).toBe(true);
    expect(board.componentInstance.form.controls.description.value).toBe('Unsaved');
    expect(board.componentInstance.tasks()).toHaveLength(1);
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
