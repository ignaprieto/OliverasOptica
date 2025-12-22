import { Component, OnInit, HostListener, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';

export interface MenuOption {
  vista: string;
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavbarComponent implements OnInit {
  private router = inject(Router);
  private supabase = inject(SupabaseService);

  // --- SIGNALS ---
  mostrarMenu = signal<boolean>(false);
  isVendedor = signal<boolean>(false);
  userName = signal<string>('');
  permisosVendedor = signal<string[]>([]);

  // --- OPCIONES DE MENÚ ---
  readonly todasLasOpciones: MenuOption[] = [
    { vista: 'dashboard', label: 'Menu Principal', route: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { vista: 'productos', label: 'Productos', route: '/productos', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { vista: 'stock', label: 'Stock', route: '/stock', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { vista: 'ventas', label: 'Ventas', route: '/ventas', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z' },
    { vista: 'descuentos', label: 'Descuentos', route: '/descuentos', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
    { vista: 'historial', label: 'Historial', route: '/historial', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
    { vista: 'aumento', label: 'Aumento', route: '/aumento', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
    { vista: 'finanzas', label: 'Finanzas', route: '/finanzas', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { vista: 'empleados', label: 'Empleados', route: '/empleados', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { vista: 'configuracion', label: 'Configuración', route: '/configuracion', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { vista: 'caja', label: 'Caja', route: '/caja', icon: 'M12 6v6h4.5m4.5 0A9 9 0 1112 3a9 9 0 019 9z' },
    { vista: 'clientes', label: 'Clientes', route: '/clientes', icon: 'M15 19.128a9.38 9.38 0 003.6.372A4.125 4.125 0 0018 15.75c0-1.245-.576-2.354-1.47-3.075M15 19.128a9.337 9.337 0 01-3 .497 9.337 9.337 0 01-3-.497M15 19.128V18a4.125 4.125 0 00-4.125-4.125H9.75m0 0A4.125 4.125 0 015.625 9.75 4.125 4.125 0 019.75 5.625a4.125 4.125 0 014.125 4.125v.128M9.75 13.875H8.25A4.125 4.125 0 004.125 18v1.128' },
    { vista: 'deposito', label: 'Depósito', route: '/deposito', icon: 'M20.25 7.5l-8.954-4.477a.75.75 0 00-.684 0L2.25 7.5m18 0l-9 4.5m9-4.5v9.75a.75.75 0 01-.75.75H3.75a.75.75 0 01-.75-.75V7.5m9 4.5v9.75' }
  ];

  // --- COMPUTED ---
  // Filtra las opciones basándose en los permisos cargados
  opcionesMenu = computed(() => {
    const esVendedor = this.isVendedor();
    const permisos = this.permisosVendedor();

    // Si no es vendedor (es Admin), muestra todo
    if (!esVendedor) return this.todasLasOpciones;

    const permisosSet = new Set(permisos);

    return this.todasLasOpciones.filter(opcion => {
      // El dashboard siempre se oculta para vendedores (van directo a Ventas u otros)
      if (opcion.vista === 'dashboard') return false;
      return permisosSet.has(opcion.vista);
    });
  });

  ngOnInit() {
    // 1. Suscribirse al estado del usuario (Reactivo)
    // Esto asegura que si recargas o cambias de usuario, el navbar se entere
    this.supabase.currentUser$.subscribe(async (user) => {
      if (user) {
        this.userName.set(user.nombre);
        const esVend = user.rol === 'vendedor';
        this.isVendedor.set(esVend);

        // Si es vendedor, cargamos sus permisos usando el servicio
        if (esVend) {
          await this.cargarPermisosVendedor();
        }
      } else {
        // Reset si no hay usuario
        this.userName.set('');
        this.isVendedor.set(false);
        this.permisosVendedor.set([]);
      }
    });
  }

  async cargarPermisosVendedor() {
    try {
      // Usamos el método centralizado del servicio
      // El servicio ya sabe quién es el usuario actual y busca su ID de vendedor
      const permisos = await this.supabase.getPermisosUsuario();
      
      if (permisos) {
        // Filtramos solo las vistas que tiene permitidas (puede_ver = true)
        const vistasPermitidas = permisos
          .filter(p => p.puede_ver)
          .map(p => p.vista);
          
        this.permisosVendedor.set(vistasPermitidas);
      }
    } catch (error) {
      console.error('Error al cargar permisos en Navbar:', error);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.mostrarMenu()) {
      this.mostrarMenu.set(false);
    }
  }

  toggleMenu(event?: Event) {
    event?.stopPropagation();
    this.mostrarMenu.update(v => !v);
  }

  closeMenu() {
    this.mostrarMenu.set(false);
  }

  async cerrarSesion() {
    try {
      await this.supabase.signOut();
      // La redirección ya la hace el servicio, pero por seguridad:
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error logout:', error);
      this.router.navigate(['/login']);
    }
  }
}