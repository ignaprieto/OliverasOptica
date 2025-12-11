import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';

// Interfaces
export interface PermisoVista {
  vista: string;
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

export interface AppUser {
  id: string;
  nombre: string;
  rol: 'admin' | 'vendedor' | 'guest';
  dni?: string;
  // Propiedades opcionales para compatibilidad con User de Supabase
  email?: string;
  user_metadata?: any;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  
  // Caché de estado
  private currentUserSubject = new BehaviorSubject<AppUser | null>(null);
  private permisosCache: PermisoVista[] | null = null;

  constructor(private router: Router) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    
    this.recoverSession();
  }

  getClient() {
    return this.supabase;
  }

  // ==========================================
  // GESTIÓN DE SESIÓN (Admin & Vendedor)
  // ==========================================

  private async recoverSession() {
    // 1. Intentar recuperar Admin
    const { data } = await this.supabase.auth.getSession();
    if (data.session?.user) {
      this.setAdminUser(data.session.user);
      return;
    }

    // 2. Intentar recuperar Vendedor
    const vendedorStr = localStorage.getItem('user');
    if (vendedorStr) {
      try {
        const vendedor = JSON.parse(vendedorStr);
        if (vendedor && vendedor.rol === 'vendedor') {
          this.setVendedorUser(vendedor);
          return;
        }
      } catch (e) {
        localStorage.removeItem('user');
      }
    }

    // 3. Nadie
    this.currentUserSubject.next(null);
  }

  private setAdminUser(user: User) {
    const appUser: AppUser = {
      id: user.id,
      nombre: user.user_metadata?.['nombre'] || user.email || 'Admin',
      rol: 'admin',
      email: user.email,
      user_metadata: user.user_metadata
    };
    this.currentUserSubject.next(appUser);
  }

  private setVendedorUser(vendedor: any) {
    const appUser: AppUser = {
      id: vendedor.id,
      nombre: vendedor.nombre,
      rol: 'vendedor',
      dni: vendedor.dni
    };
    this.currentUserSubject.next(appUser);
    localStorage.setItem('user', JSON.stringify(appUser));
  }

  get currentUser$() {
    return this.currentUserSubject.asObservable();
  }

  async getCurrentAppUser(): Promise<AppUser | null> {
    const current = this.currentUserSubject.value;
    if (current) return current;
    await this.recoverSession();
    return this.currentUserSubject.value;
  }

  async getCurrentUserRole(): Promise<string> {
    const user = await this.getCurrentAppUser();
    return user?.rol || 'guest';
  }

  // ==========================================
  // LOGIN / LOGOUT
  // ==========================================

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) this.setAdminUser(data.user);
    return data;
  }

  setVendedorTemp(vendedor: any) {
    this.setVendedorUser(vendedor);
  }
  
  getVendedorTemp() {
    return this.currentUserSubject.value?.rol === 'vendedor' ? this.currentUserSubject.value : null;
  }

  async signOut() {
    localStorage.removeItem('user');
    this.permisosCache = null;
    this.currentUserSubject.next(null);
    await this.supabase.auth.signOut();
    this.router.navigate(['/login']);
  }

  // ==========================================
  // PERMISOS
  // ==========================================

  async getPermisosUsuario(): Promise<PermisoVista[] | null> {
    const user = await this.getCurrentAppUser();
    if (!user) return [];

    if (user.rol === 'admin') return null; 

    if (this.permisosCache) return this.permisosCache;

    const { data, error } = await this.supabase
      .from('permisos_empleado')
      .select('vista, puede_ver, puede_crear, puede_editar, puede_eliminar')
      .eq('empleado_id', user.id);

    if (error) {
      console.error('Error fetching permisos:', error);
      return [];
    }

    this.permisosCache = data || [];
    return this.permisosCache;
  }

  async puedeVerVista(vista: string): Promise<boolean> {
    const permisos = await this.getPermisosUsuario();
    if (permisos === null) return true; 
    const p = permisos.find(p => p.vista === vista);
    return p ? p.puede_ver : false;
  }

  async getPrimeraVistaAccesible(): Promise<string | null> {
    const permisos = await this.getPermisosUsuario();
    if (permisos === null) return 'dashboard';

    const orden = ['ventas', 'caja', 'productos', 'clientes'];
    for (const vista of orden) {
      if (permisos.find(p => p.vista === vista && p.puede_ver)) return vista;
    }
    return permisos.find(p => p.puede_ver)?.vista || null;
  }

  // ==========================================
  // MÉTODOS DE COMPATIBILIDAD (Legacy Support)
  // ==========================================
  // Estos métodos aseguran que el resto de componentes no se rompan.

  /**
   * @deprecated Usar getCurrentAppUser() para obtener un objeto unificado
   */
  async getCurrentUser(): Promise<any> {
    // Retorna el AppUser, que es compatible en estructura básica
    return this.getCurrentAppUser();
  }

  /**
   * @deprecated Usar getCurrentAppUser().nombre
   */
  async getCurrentUserName(): Promise<string> {
    const user = await this.getCurrentAppUser();
    return user?.nombre || 'Usuario';
  }

  /**
   * @deprecated Usar getCurrentUserRole() === 'vendedor'
   */
  async isUserVendedor(): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'vendedor';
  }

  async isUserAdmin(): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'admin';
  }
}