import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { NotesPageComponent } from './notes-page.component';

const routes: Routes = [
  { path: '', component: NotesPageComponent }
];

@NgModule({
  declarations: [
    NotesPageComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes)
  ]
})
export class NotesModule { }
