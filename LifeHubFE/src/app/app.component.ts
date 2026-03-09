import { Component, OnInit } from '@angular/core';
import { RuntimeConfigService } from './core/runtime-config.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    standalone: false
})
export class AppComponent implements OnInit {
  constructor(private runtimeConfig: RuntimeConfigService) {}

  ngOnInit(): void {
    document.title = this.runtimeConfig.appTitle;
  }
}
