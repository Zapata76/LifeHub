import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, input, signal, viewChild } from '@angular/core';

@Component({
  selector: 'lh-task-description',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'task-description' },
  template: `
    <p #paragraph class="task-description-text" [class.is-collapsed]="!expanded()"
      [id]="'task-description-' + taskId()">{{ text() }}</p>
    @if (overflows() || expanded()) {
      <button type="button" class="task-description-toggle" [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="'task-description-' + taskId()"
        (click)="$event.stopPropagation(); expanded.update(toggle)"
        (keydown.enter)="$event.stopPropagation()">
        {{ expanded() ? 'Mostra meno' : 'Mostra tutto' }}
      </button>
    }
  `
})
export class TaskDescriptionComponent {
  readonly taskId = input.required<number>();
  readonly text = input.required<string>();
  readonly expanded = signal(false);
  readonly overflows = signal(false);
  readonly toggle = (value: boolean): boolean => !value;
  private readonly paragraph = viewChild.required<ElementRef<HTMLParagraphElement>>('paragraph');

  constructor() {
    afterRenderEffect({ read: (onCleanup) => {
      this.text(); // Re-measure after edits even when the clamped element's size hasn't changed.
      const element = this.paragraph().nativeElement;
      const measure = () => {
        const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
        if (Number.isFinite(lineHeight)) {
          this.overflows.set(element.scrollHeight > lineHeight * 8 + 1);
        }
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        onCleanup(() => observer.disconnect());
      }
    } });
  }
}
