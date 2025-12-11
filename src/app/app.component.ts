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
  // --- INYECCIÓN DE DEPENDENCIAS (Estilo Moderno) ---
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private ngZone = inject(NgZone);

  // --- SIGNALS (Estado Reactivo) ---
  isAuthenticated = signal<boolean>(false);
  currentRoute = signal<string>('');
  
  // Rutas donde NO queremos ver navbar/footer
  private readonly rutasOcultas = ['/login'];

  // --- COMPUTED SIGNALS (Cálculos en caché) ---
  mostrarLayout = computed(() => {
    const isAuth = this.isAuthenticated();
    const route = this.currentRoute();
    const esOculta = this.rutasOcultas.some(r => route.includes(r));
    
    return isAuth && !esOculta;
  });

  // --- CONFIGURACIÓN INACTIVIDAD ---
  private readonly TIMEOUT_INACTIVIDAD = 8 * 60 * 60 * 1000; // 8 horas
  //private readonly TIMEOUT_INACTIVIDAD = 1 * 60 * 1000; // 1 minuto
  // Tipado estricto para el timer (NodeJS.Timeout o number dependiendo del entorno, ReturnType es lo más seguro)
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private userSubscription?: Subscription;
  
  // Eventos que reinician el contador
  private readonly userActivityEvents = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart'];

  // CORRECCIÓN DE MEMORY LEAK:
  // Definimos el handler como una Arrow Function guardada en una propiedad.
  // Esto mantiene la referencia estable para addEventListener y removeEventListener.
  private readonly handleUserActivity = () => this.resetInactivityTimer();

showSessionToast = false; // Controla la visibilidad
  toastMessage = '';        // Mensaje a mostrar

  constructor() {
    // Monitor de rutas
    this.router.events.pipe(
      filter((event: RouterEvent): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      // Actualizamos el Signal de la ruta
      this.currentRoute.set(event.urlAfterRedirects);
    });
  }

  ngOnInit() {
    // Suscripción al estado del usuario
    this.userSubscription = this.supabase.currentUser$.subscribe(user => {
      const isLogged = !!user;
      this.isAuthenticated.set(isLogged); // Actualizamos Signal

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
  // LÓGICA DE INACTIVIDAD (OPTIMIZADA Y SIN FUGAS)
  // ==========================================

  private iniciarMonitorInactividad() {
    // Si ya hay listeners, no los agregamos de nuevo
    this.detenerMonitorInactividad();

    // Ejecutamos fuera de Angular para evitar Change Detection masivo
    this.ngZone.runOutsideAngular(() => {
      this.userActivityEvents.forEach(event => {
        // Usamos 'handleUserActivity' que es una referencia estable
        window.addEventListener(event, this.handleUserActivity, { passive: true });
      });
    });

    this.resetInactivityTimer();
  }

  private detenerMonitorInactividad() {
    // Removemos usando la MISMA referencia de función
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
      // Configuramos el timeout fuera de Angular también, para que el simple hecho
      // de que corra el tiempo no dispare detecciones.
      this.ngZone.runOutsideAngular(() => {
        this.inactivityTimer = setTimeout(() => {
          // SOLO volvemos a entrar a la zona de Angular cuando realmente expira
          this.ngZone.run(() => this.cerrarSesionPorInactividad());
        }, this.TIMEOUT_INACTIVIDAD);
      });
    }
  }

  private async cerrarSesionPorInactividad() {
    this.detenerMonitorInactividad();
    
    // 1. Cerrar sesión y redirigir
    await this.supabase.signOut();
    this.router.navigate(['/login']);

    // 2. Mostrar el Toast en lugar del alert
    this.toastMessage = 'Tu sesión ha expirado por inactividad.';
    this.showSessionToast = true;

    // 3. Ocultar automáticamente después de 5 segundos
    setTimeout(() => {
      this.showSessionToast = false;
    }, 5000);
  }
}