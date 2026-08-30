import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FeatureStylesheetLoader } from './feature-stylesheet.loader';

describe('FeatureStylesheetLoader', () => {
  let document: Document;
  let loader: FeatureStylesheetLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    document = TestBed.inject(DOCUMENT);
    loader = TestBed.inject(FeatureStylesheetLoader);

    const core = document.createElement('link');
    core.id = 'lifehub-style-core';
    core.dataset['lifehubStyleRank'] = '30';
    const tail = document.createElement('link');
    tail.id = 'lifehub-style-tail';
    tail.dataset['lifehubStyleRank'] = '140';
    document.head.append(core, tail);
  });

  afterEach(() => {
    document.head.querySelectorAll('[id^="lifehub-style-"]').forEach((element) => element.remove());
    TestBed.resetTestingModule();
  });

  it('loads a module as an external same-origin stylesheet before the responsive tail', async () => {
    const loaded = loader.load('tasks');
    const link = document.getElementById('lifehub-style-tasks') as HTMLLinkElement;

    expect(link.tagName).toBe('LINK');
    expect(link.rel).toBe('stylesheet');
    expect(link.href).toBe(new URL('styles/modules/tasks.css?v=20260830-6', document.baseURI).href);
    expect(rankedStyles()).toEqual(['lifehub-style-core', 'lifehub-style-tasks', 'lifehub-style-tail']);

    link.dispatchEvent(new Event('load'));
    await expect(loaded).resolves.toBeUndefined();
  });

  it('keeps early module rules before the core stylesheet', async () => {
    const loaded = loader.load('documents');
    const link = document.getElementById('lifehub-style-documents') as HTMLLinkElement;

    expect(rankedStyles()).toEqual(['lifehub-style-documents', 'lifehub-style-core', 'lifehub-style-tail']);
    link.dispatchEvent(new Event('load'));
    await loaded;
  });

  it('deduplicates concurrent requests for the same module', async () => {
    const first = loader.load('notes');
    const second = loader.load('notes');
    const link = document.getElementById('lifehub-style-notes') as HTMLLinkElement;

    expect(second).toBe(first);
    expect(document.querySelectorAll('#lifehub-style-notes')).toHaveLength(1);
    link.dispatchEvent(new Event('load'));
    await first;
  });

  it('removes a failed link so a later navigation can retry', async () => {
    const failed = loader.load('recipes');
    const link = document.getElementById('lifehub-style-recipes') as HTMLLinkElement;

    link.dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('Unable to load the recipes stylesheet.');
    expect(document.getElementById('lifehub-style-recipes')).toBeNull();

    const retry = loader.load('recipes');
    const retryLink = document.getElementById('lifehub-style-recipes') as HTMLLinkElement;
    retryLink.dispatchEvent(new Event('load'));
    await expect(retry).resolves.toBeUndefined();
  });

  function rankedStyles(): string[] {
    return Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[data-lifehub-style-rank]'))
      .map((link) => link.id);
  }
});
