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
        detectSessionInUrl: true,
        storage: localStorage 
      }
    });
    
    this.recoverSession();
  }

  getClient() {
    return this.supabase;
  }

  // ==========================================
  // GESTIÓN DE SESIÓN
  // ==========================================

  private async recoverSession() {
    // 1. Intentar recuperar sesión de Supabase Auth
    const { data } = await this.supabase.auth.getSession();
    if (data.session?.user) {
      this.setSessionUser(data.session.user);
      return;
    }

    // 2. Limpiar usuario si no hay sesión
    this.currentUserSubject.next(null);
  }

  private setSessionUser(user: User) {
    const metadata = user.user_metadata || {};
    
    // Leer el rol de la metadata. Si no existe, asumir guest o admin según prefieras.
    // Aquí asumimos que si no es vendedor, es admin (o el sistema lo tratará como tal hasta que RLS diga lo contrario)
    const rolReal = metadata['rol'] === 'vendedor' ? 'vendedor' : 'admin';

    const appUser: AppUser = {
      id: user.id,
      nombre: metadata['nombre'] || user.email || 'Usuario',
      rol: rolReal,
      email: user.email,
      user_metadata: metadata,
      dni: metadata['dni'] // Importante si guardaste el DNI en metadata
    };
    
    this.currentUserSubject.next(appUser);
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
    if (data.user) this.setSessionUser(data.user);
    return data;
  }

  async signOut() {
    this.currentUserSubject.next(null);
    this.permisosCache = null;
    localStorage.removeItem('user'); 

    try {
      await this.supabase.auth.signOut(); 
    } catch (error) {
      console.error('Error en signOut', error);
    }

    this.router.navigate(['/login']);
  }

  // ==========================================
  // PERMISOS
  // ==========================================

  async getPermisosUsuario(): Promise<PermisoVista[] | null> {
    const user = await this.getCurrentAppUser();
    if (!user) return [];

    if (user.rol === 'admin') return null; // Admin (null significa acceso total en la lógica de guards)

    if (this.permisosCache) return this.permisosCache;

    // Buscar perfil de vendedor vinculado al usuario actual
    const { data: vendedor } = await this.supabase
        .from('vendedores')
        .select('id')
        .eq('usuario_id', user.id)
        .maybeSingle();

    if (!vendedor) return [];

    // Cargar permisos usando el ID del vendedor
    const { data, error } = await this.supabase
      .from('permisos_empleado')
      .select('vista, puede_ver, puede_crear, puede_editar, puede_eliminar')
      .eq('empleado_id', vendedor.id);

    if (error) {
      console.error('Error fetching permisos:', error);
      return [];
    }

    this.permisosCache = data || [];
    return this.permisosCache;
  }

  async puedeVerVista(vista: string): Promise<boolean> {
    const permisos = await this.getPermisosUsuario();
    if (permisos === null) return true; // Admin ve todo
    const p = permisos.find(p => p.vista === vista);
    return p ? p.puede_ver : false;
  }

  // ✅ MÉTODO RESTAURADO: Necesario para los Guards
  async getPrimeraVistaAccesible(): Promise<string | null> {
    const permisos = await this.getPermisosUsuario();
    if (permisos === null) return 'dashboard'; // Admin va a dashboard

    // Orden de preferencia para vendedores
    const orden = ['ventas', 'caja', 'productos', 'clientes'];
    for (const vista of orden) {
      if (permisos.find(p => p.vista === vista && p.puede_ver)) return vista;
    }
    
    // Si no encuentra ninguna de las preferidas, devuelve la primera que tenga permiso
    return permisos.find(p => p.puede_ver)?.vista || null;
  }

  // ==========================================
  // MÉTODOS DE COMPATIBILIDAD (Legacy)
  // ==========================================
  
  // ✅ CORREGIDO: Devuelve el usuario si es vendedor, evitando errores de tipo 'never'
  getVendedorTemp() {
    const user = this.currentUserSubject.value;
    if (user && user.rol === 'vendedor') {
        return user;
    }
    return null;
  }
  
  // Estos métodos aseguran que otros componentes no se rompan
  setVendedorTemp(vendedor: any) { /* No hace nada, manejado por Auth */ }
  async getCurrentUser(): Promise<any> { return this.getCurrentAppUser(); }
  async getCurrentUserName(): Promise<string> { const u = await this.getCurrentAppUser(); return u?.nombre || ''; }
  async isUserVendedor(): Promise<boolean> { return (await this.getCurrentUserRole()) === 'vendedor'; }
  async isUserAdmin(): Promise<boolean> { return (await this.getCurrentUserRole()) === 'admin'; }
}