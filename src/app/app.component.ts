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
  imports: [RouterOutlet, CommonModule, NavbarComponent,FooterComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  isAppInitialized = false;
  isAuthenticated = false;
  currentRoute = '';
  public title = 'ventas';
  private static authListenerSet = false; // Static para evitar múltiples listeners

  constructor(public router: Router, private supabase: SupabaseService) {
    // Escuchar cambios de navegación
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
      // 1. Solo verificar estado de auth - NUNCA redirigir
      await this.checkAuthStatusOnly();
      
      // 2. Configurar listener SOLO si no se ha configurado antes
      if (!AppComponent.authListenerSet) {
        this.setupAuthListener();
        AppComponent.authListenerSet = true;
      }
      
      // 3. Verificar inactividad y registrar actividad
      this.verificarInactividad();
      this.registrarActividad();
      
      // 4. Marcar app como inicializada
      this.isAppInitialized = true;
      
    } catch (error) {
      // Solo mostrar errores críticos en desarrollo
      if (!environment.production) {
        console.error('Error initializing app:', error);
      }
      this.isAuthenticated = false;
      this.isAppInitialized = true;
    }
  }

  // SOLO verificar estado - NUNCA navegar desde aquí
  private async checkAuthStatusOnly(): Promise<void> {
    try {
      const { data } = await this.supabase.getClient().auth.getSession();
      this.isAuthenticated = !!data.session;
      // NO HAY NAVEGACIÓN AQUÍ - El authGuard se encarga de todo
    } catch (error) {
      // Silenciar errores de NavigatorLockManager y similares
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
      
      // SOLO redirigir en acciones explícitas del usuario
      if (event === 'SIGNED_OUT') {
        // Usuario cerró sesión explícitamente
        this.router.navigate(['/login']);
      }
      
      // NO redirigir en SIGNED_IN ni INITIAL_SESSION
      // El login component y el authGuard manejan estas redirecciones
    });
  }

  // Método para mostrar el navbar
  mostrarNavbar(): boolean {
  // Mostrar siempre para admin o vendedor
  const user = localStorage.getItem('user');
  return this.isAppInitialized && (this.isAuthenticated || !!user) && this.currentRoute !== '/login';
}


  // Método para mostrar el contenido
  mostrarContenido(): boolean {
    return this.isAppInitialized;
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
      // Solo mostrar errores críticos en desarrollo
      if (!environment.production) {
        console.error('Error checking inactivity:', error);
      }
    }
  }
}