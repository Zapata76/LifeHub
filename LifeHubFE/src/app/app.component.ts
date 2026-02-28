import { Component, OnInit } from '@angular/core';
import { RuntimeConfigService } from './runtime-config.service';

@Component({
  selector: 'app-root',
  template: `<router-outlet></router-outlet>`
})
export class AppComponent implements OnInit {
  constructor(private runtimeConfig: RuntimeConfigService) {}

  ngOnInit(): void {
    document.title = this.runtimeConfig.appTitle;
  }
}
