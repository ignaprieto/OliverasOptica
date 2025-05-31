import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, NavbarComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  constructor(public router: Router, private supabase: SupabaseService) {}

  ngOnInit(): void {
    this.verificarInactividad();
    this.registrarActividad();
  }

  mostrarNavbar(): boolean {
    return this.router.url !== '/login';
  }

  registrarActividad() {
    const eventos = ['click', 'keydown', 'mousemove', 'scroll'];
    const actualizarActividad = () => {
      localStorage.setItem('ultimaActividad', Date.now().toString());
    };

    eventos.forEach(e => window.addEventListener(e, actualizarActividad));
    // Registrar inmediatamente al entrar
    actualizarActividad();
  }

  async verificarInactividad() {
    const { data } = await this.supabase.getClient().auth.getSession();
    const session = data.session;

    if (!session) return;

    const ultimaActividad = localStorage.getItem('ultimaActividad');
    if (!ultimaActividad) return;

    const haceMs = Date.now() - parseInt(ultimaActividad, 10);
    const horasInactivo = haceMs / (1000 * 60 * 60);

    if (horasInactivo >= 24) {
      await this.supabase.getClient().auth.signOut();
      this.router.navigate(['/login']);
    }
  }
}
