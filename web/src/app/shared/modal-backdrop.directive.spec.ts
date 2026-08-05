import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ModalBackdropDirective } from './modal-backdrop.directive';

@Component({
  standalone: true,
  imports: [ModalBackdropDirective],
  template: `
    <div class="backdrop" lhModalBackdrop (backdropDismissed)="dismissals = dismissals + 1">
      <input aria-label="Campo della modale">
    </div>
  `
})
class ModalBackdropHostComponent {
  dismissals = 0;
}

describe('ModalBackdropDirective', () => {
  it('ignores a drag that starts in the modal content and dismisses a press started on the backdrop', async () => {
    await TestBed.configureTestingModule({ imports: [ModalBackdropHostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ModalBackdropHostComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const backdrop = fixture.nativeElement.querySelector('.backdrop') as HTMLDivElement;
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(fixture.componentInstance.dismissals).toBe(0);

    backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(fixture.componentInstance.dismissals).toBe(1);
  });
});
