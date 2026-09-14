import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { ResolveFn } from '@angular/router';

export const FEATURE_STYLESHEET_DATA_KEY = 'featureStylesheet';
// Bump when a feature stylesheet changes because these bundles have stable filenames.
const featureStylesheetVersion = '20260908-1';

const featureStylesheetRanks = {
  documents: 10,
  meals: 20,
  home: 31,
  login: 32,
  calendars: 40,
  'user-management': 50,
  shopping: 60,
  goals: 70,
  recipes: 80,
  inventory: 90,
  about: 110,
  tasks: 120,
  notes: 130
} as const;

export type FeatureStylesheetName = keyof typeof featureStylesheetRanks;

@Injectable({ providedIn: 'root' })
export class FeatureStylesheetLoader {
  private readonly document = inject(DOCUMENT);
  private readonly loads = new Map<FeatureStylesheetName, Promise<void>>();

  load(name: FeatureStylesheetName): Promise<void> {
    const pending = this.loads.get(name);
    if (pending) {
      return pending;
    }

    const id = `lifehub-style-${name}`;
    const existing = this.document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      return Promise.resolve();
    }

    const link = this.document.createElement('link');
    const rank = featureStylesheetRanks[name];
    link.id = id;
    link.rel = 'stylesheet';
    const href = new URL(`styles/modules/${name}.css`, this.document.baseURI);
    href.searchParams.set('v', featureStylesheetVersion);
    link.href = href.href;
    link.dataset['lifehubStyleRank'] = String(rank);

    const load = new Promise<void>((resolve, reject) => {
      link.addEventListener('load', () => resolve(), { once: true });
      link.addEventListener('error', () => {
        link.remove();
        this.loads.delete(name);
        reject(new Error(`Unable to load the ${name} stylesheet.`));
      }, { once: true });
    });
    this.loads.set(name, load);

    const followingLink = Array.from(
      this.document.head.querySelectorAll<HTMLLinkElement>('link[data-lifehub-style-rank]')
    ).find((candidate) => Number(candidate.dataset['lifehubStyleRank']) > rank);
    this.document.head.insertBefore(link, followingLink ?? null);

    return load;
  }
}

export const featureStylesheetResolver: ResolveFn<boolean> = (route) => {
  const name = route.data[FEATURE_STYLESHEET_DATA_KEY] as FeatureStylesheetName;
  return inject(FeatureStylesheetLoader).load(name).then(() => true);
};
