import { Component, OnInit } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { SupabaseService } from './services/supabase.service';
import { environment } from '../environments/environment';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, NavbarComponent, FooterComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  isAppInitialized = false;
  isAuthenticated = false;
  currentRoute = '';
  public title = 'ventas';
  private static authListenerSet = false;

  constructor(public router: Router, private supabase: SupabaseService) {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentRoute = event.url;
    });
  }

  async ngOnInit(): Promise<void> {
    await this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    try {
      await this.checkAuthStatusOnly();
      
      if (!AppComponent.authListenerSet) {
        this.setupAuthListener();
        AppComponent.authListenerSet = true;
      }
      
      this.verificarInactividad();
      this.registrarActividad();
      
      this.isAppInitialized = true;
      
    } catch (error) {
      if (!environment.production) {
        console.error('Error initializing app:', error);
      }
      this.isAuthenticated = false;
      this.isAppInitialized = true;
    }
  }

  private async checkAuthStatusOnly(): Promise<void> {
    try {
      const { data } = await this.supabase.getClient().auth.getSession();
      this.isAuthenticated = !!data.session;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!environment.production && !errorMessage.includes('NavigatorLock')) {
        console.error('Error checking auth:', error);
      }
      this.isAuthenticated = false;
    }
  }

  private setupAuthListener(): void {
    this.supabase.getClient().auth.onAuthStateChange((event, session) => {
      this.isAuthenticated = !!session;
      
      if (event === 'SIGNED_OUT') {
        this.router.navigate(['/login']);
      }
    });
  }

  mostrarNavbar(): boolean {
    const user = localStorage.getItem('user');
    return this.isAppInitialized && (this.isAuthenticated || !!user) && this.currentRoute !== '/login';
  }

  mostrarFooter(): boolean {
    // Mostrar el footer en todas las páginas excepto login, pero solo cuando la app esté inicializada
    return this.isAppInitialized && this.currentRoute !== '/login';
  }

  mostrarContenido(): boolean {
    return this.isAppInitialized;
  }

  registrarActividad() {
    const eventos = ['click', 'keydown', 'mousemove', 'scroll'];
    const actualizarActividad = () => {
      localStorage.setItem('ultimaActividad', Date.now().toString());
    };

    eventos.forEach(e => window.addEventListener(e, actualizarActividad));
    actualizarActividad();
  }

  async verificarInactividad() {
    try {
      const { data } = await this.supabase.getClient().auth.getSession();
      const session = data.session;

      if (!session) return;

      const ultimaActividad = localStorage.getItem('ultimaActividad');
      if (!ultimaActividad) return;

      const haceMs = Date.now() - parseInt(ultimaActividad, 10);
      const horasInactivo = haceMs / (1000 * 60 * 60);

      if (horasInactivo >= 8) {
        await this.supabase.getClient().auth.signOut();
      }
    } catch (error) {
      if (!environment.production) {
        console.error('Error checking inactivity:', error);
      }
    }
  }
}