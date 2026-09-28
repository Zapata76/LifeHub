import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDescriptionComponent } from './task-description.component';

describe('TaskDescriptionComponent', () => {
  let height: number;
  let observers: { notify: () => void; disconnect: ReturnType<typeof vi.fn> }[];

  beforeEach(() => {
    height = 240;
    observers = [];
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ lineHeight: '20px' } as CSSStyleDeclaration);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        observers.push({ notify: () => callback([], this as unknown as ResizeObserver), disconnect: this.disconnect });
      }
    });
    TestBed.configureTestingModule({ imports: [TaskDescriptionComponent] });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function create(id = 1) {
    const fixture = TestBed.createComponent(TaskDescriptionComponent);
    fixture.componentRef.setInput('taskId', id);
    fixture.componentRef.setInput('text', 'Una descrizione completa, conservata senza tagliare il contenuto.');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('starts collapsed and allows expansion and collapse without propagating clicks or Enter to the card', async () => {
    const fixture = await create();
    const parentClick = vi.fn();
    const parentKey = vi.fn();
    fixture.nativeElement.addEventListener('click', parentClick);
    fixture.nativeElement.addEventListener('keydown', parentKey);
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const paragraph = fixture.nativeElement.querySelector('p') as HTMLParagraphElement;
    expect(paragraph.classList.contains('is-collapsed')).toBe(true);
    expect(paragraph.textContent).toContain('senza tagliare il contenuto');
    expect(button.textContent).toContain('Mostra tutto');
    expect(button.getAttribute('aria-controls')).toBe(paragraph.id);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
    fixture.detectChanges();
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentKey).not.toHaveBeenCalled();
    expect(paragraph.classList.contains('is-collapsed')).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toContain('Mostra meno');
    button.click();
    fixture.detectChanges();
    expect(paragraph.classList.contains('is-collapsed')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('hides the control for up to eight lines and rechecks it when the layout changes', async () => {
    height = 160;
    const fixture = await create();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    height = 180;
    observers[0].notify();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
    height = 80;
    observers[0].notify();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('remeasures edited descriptions even when the element dimensions stay unchanged', async () => {
    height = 160;
    const fixture = await create();
    height = 220;
    fixture.componentRef.setInput('text', 'Testo modificato con più righe.');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('keeps expansion local to each task and resets it when entering the section again', async () => {
    const first = await create(1);
    const second = await create(2);
    first.nativeElement.querySelector('button').click();
    first.detectChanges();
    expect(first.componentInstance.expanded()).toBe(true);
    expect(second.componentInstance.expanded()).toBe(false);
    expect(first.nativeElement.querySelector('p').id).not.toBe(second.nativeElement.querySelector('p').id);
    first.destroy();
    expect(observers[0].disconnect).toHaveBeenCalled();
    const reopened = await create(1);
    expect(reopened.componentInstance.expanded()).toBe(false);
  });
});
