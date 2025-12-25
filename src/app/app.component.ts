import { Component, OnInit, OnDestroy, NgZone, inject, signal, computed } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, Event as RouterEvent } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './components/navbar/navbar.component';
import { FooterComponent } from './components/footer/footer.component';
import { SupabaseService } from './services/supabase.service';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, NavbarComponent, FooterComponent],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit, OnDestroy {
  // --- INYECCIÓN DE DEPENDENCIAS ---
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private ngZone = inject(NgZone);

  // --- SIGNALS (Estado Reactivo) ---
  isAuthenticated = signal<boolean>(false);
  currentRoute = signal<string>('');
  
  // Rutas donde NO queremos ver navbar/footer
  private readonly rutasOcultas = ['/login'];

  // --- COMPUTED SIGNALS ---
  mostrarLayout = computed(() => {
    const isAuth = this.isAuthenticated();
    const route = this.currentRoute();
    const esOculta = this.rutasOcultas.some(r => route.includes(r));
    
    return isAuth && !esOculta;
  });

  // --- CONFIGURACIÓN INACTIVIDAD ---
  private readonly TIMEOUT_INACTIVIDAD = 8 * 60 * 60 * 1000; // 8 horas
  
  // Tipado estricto para el timer
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private userSubscription?: Subscription;
  
  // Eventos que reinician el contador
  private readonly userActivityEvents = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart'];

  // Handler estable para addEventListener
  private readonly handleUserActivity = () => this.resetInactivityTimer();

  showSessionToast = false; // Controla la visibilidad
  toastMessage = '';        // Mensaje a mostrar

  constructor() {
    // Monitor de rutas
    this.router.events.pipe(
      filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentRoute.set(event.urlAfterRedirects);
    });
  }

  ngOnInit() {
    // Suscripción al estado del usuario
    this.userSubscription = this.supabase.currentUser$.subscribe(user => {
      const isLogged = !!user;
      this.isAuthenticated.set(isLogged);

      if (isLogged) {
        this.iniciarMonitorInactividad();
      } else {
        this.detenerMonitorInactividad();
      }
    });
  }

  ngOnDestroy() {
    this.detenerMonitorInactividad();
    this.userSubscription?.unsubscribe();
  }

  // ==========================================
  // LÓGICA DE INACTIVIDAD
  // ==========================================

  private iniciarMonitorInactividad() {
    this.detenerMonitorInactividad();

    // Ejecutamos fuera de Angular para evitar Change Detection masivo
    this.ngZone.runOutsideAngular(() => {
      this.userActivityEvents.forEach(event => {
        window.addEventListener(event, this.handleUserActivity, { passive: true });
      });
    });

    this.resetInactivityTimer();
  }

  private detenerMonitorInactividad() {
    this.userActivityEvents.forEach(event => {
      window.removeEventListener(event, this.handleUserActivity);
    });
    
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
  }

  private resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    
    // Solo si hay usuario autenticado
    if (this.isAuthenticated()) {
      this.ngZone.runOutsideAngular(() => {
        this.inactivityTimer = setTimeout(() => {
          // Volvemos a Angular solo cuando expira
          this.ngZone.run(() => this.cerrarSesionPorInactividad());
        }, this.TIMEOUT_INACTIVIDAD);
      });
    }
  }

  private async cerrarSesionPorInactividad() {
    this.detenerMonitorInactividad();
    
    // 1. Cerrar sesión y redirigir
    await this.supabase.signOut();
    // La redirección ya ocurre en signOut, pero aseguramos
    this.router.navigate(['/login']);

    // 2. Mostrar el Toast
    this.toastMessage = 'Tu sesión ha expirado por inactividad.';
    this.showSessionToast = true;

    // 3. Ocultar automáticamente
    setTimeout(() => {
      this.showSessionToast = false;
    }, 5000);
  }
}