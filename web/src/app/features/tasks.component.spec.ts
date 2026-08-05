import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { TasksComponent } from './tasks.component';
import { TasksApiService } from './tasks/tasks-api.service';

describe('TasksComponent', () => {
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
