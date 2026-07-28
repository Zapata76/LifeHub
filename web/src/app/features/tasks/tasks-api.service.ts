/**
 * Provides the typed HTTP boundary for the task board.
 * View state, modal state, and visual status mapping remain in the component.
 */

import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { HouseholdTask, TaskCommand, TaskMember } from './task.models';

@Injectable({ providedIn: 'root' })
export class TasksApiService {
  private readonly http = inject(HttpClient);

  list(archived: boolean): Observable<HouseholdTask[]> {
    return this.http.get<{ items: HouseholdTask[] }>(`api/v1/tasks?archived=${archived ? 1 : 0}`)
      .pipe(map(({ items }) => items));
  }

  members(): Observable<TaskMember[]> {
    return this.http.get<{ items: TaskMember[] }>('api/v1/tasks/members').pipe(map(({ items }) => items));
  }

  create(command: TaskCommand): Observable<void> {
    return this.http.post<{ item: HouseholdTask }>('api/v1/tasks', this.values(command, false)).pipe(
      switchMap(({ item }) => command.status === 'open'
        ? of(undefined)
        : this.update(item, command))
    );
  }

  update(task: HouseholdTask, command: TaskCommand): Observable<void> {
    return this.http.put(`api/v1/tasks/${task.id}`, {
      ...this.values(command, true), version: task.version
    }).pipe(map(() => undefined));
  }

  complete(task: HouseholdTask): Observable<void> {
    return this.http.post(`api/v1/tasks/${task.id}/complete`, { version: task.version }).pipe(map(() => undefined));
  }

  setArchived(task: HouseholdTask, restore: boolean): Observable<void> {
    return this.http.post(`api/v1/tasks/${task.id}/${restore ? 'restore' : 'archive'}`, {
      version: task.version
    }).pipe(map(() => undefined));
  }

  private values(command: TaskCommand, includeStatus: boolean): object {
    const values: Record<string, string | number | null> = {
      title: command.title,
      description: command.description,
      assignedTo: command.assignedTo,
      priority: command.priority,
      dueDate: command.dueDate
    };
    if (includeStatus) values['status'] = command.status;
    return values;
  }
}
