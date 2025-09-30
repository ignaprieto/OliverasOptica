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
  showFooter = false; // Nueva propiedad para controlar la visibilidad del footer
  public title = 'ventas';
  private static authListenerSet = false;

  constructor(public router: Router, private supabase: SupabaseService) {
    // Inicializar la ruta actual inmediatamente
    this.currentRoute = this.router.url;
    
    // Escuchar cambios de navegación
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentRoute = event.url;
      // Mostrar el footer después de que la navegación termine
      this.showFooter = false;
      setTimeout(() => {
        this.showFooter = true;
      }, 50);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.initializeApp();
    // Mostrar el footer después de que todo esté inicializado
    setTimeout(() => {
      this.showFooter = true;
    }, 100);
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
    // Mostrar footer cuando la ruta esté definida Y showFooter sea true
    return this.showFooter && this.currentRoute !== '';
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