import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpDemoComponent } from './http-client/http-demo.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HttpDemoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'http-client';
}
