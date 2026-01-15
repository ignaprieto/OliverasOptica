import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { BehaviorSubject,firstValueFrom } from 'rxjs';

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
  private initialized = false;
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

    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        this.currentUserSubject.next(null);
        this.permisosCache = null;
        this.initialized = true;
      } else if (session?.user) {
        this.setSessionUser(session.user);
        this.initialized = true;
      }
    });
    
    this.recoverSession();
  }

  // --- MODIFICACIÓN CLAVE AQUÍ ---
  // Este getter permite acceder a this.supabaseService.client desde otros servicios
  get client() {
    return this.supabase;
  }

  // Mantenemos este por compatibilidad si lo usas en otro lado
  getClient() {
    return this.supabase;
  }

  // ==========================================
  // GESTIÓN DE SESIÓN
  // ==========================================

  private async recoverSession() {
    try {
      const { data } = await this.supabase.auth.getSession();
      if (data.session?.user) {
        this.setSessionUser(data.session.user);
      } else {
        this.currentUserSubject.next(null);
      }
    } catch {
      this.currentUserSubject.next(null);
    } finally {
      this.initialized = true;
    }
  }

  private setSessionUser(user: User) {
    const metadata = user.user_metadata || {};
    
    // Leer el rol de la metadata.
    const rolMetadata = metadata['rol'];
    const rolReal = (rolMetadata === 'vendedor') ? 'vendedor' : 'admin';

    const appUser: AppUser = {
      id: user.id,
      nombre: metadata['nombre'] || user.email || 'Usuario',
      rol: rolReal,
      email: user.email,
      user_metadata: metadata,
      dni: metadata['dni']
    };
    
    this.currentUserSubject.next(appUser);
  }

  get currentUser$() {
    return this.currentUserSubject.asObservable();
  }

  async getCurrentAppUser(): Promise<AppUser | null> {
    const current = this.currentUserSubject.value;
    if (current) return current;
    
    if (this.initialized) return null;

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
    // Primero marcamos el estado como null y bloqueamos la recuperación
    this.initialized = true; 
    this.currentUserSubject.next(null);
    this.permisosCache = null;

    try {
      // Supabase limpia automáticamente el localStorage, no hace falta el removeItem manual
      await this.supabase.auth.signOut(); 
    } catch (error) {
      console.error('Error en signOut', error);
    }

    // Usamos replaceUrl para limpiar el historial de navegación
    await this.router.navigate(['/login'], { replaceUrl: true });
  }

  // ==========================================
  // PERMISOS (Legacy / Helper Methods)
  // ==========================================

  async getPermisosUsuario(): Promise<PermisoVista[] | null> {
    const user = await this.getCurrentAppUser();
    if (!user) return [];

    if (user.rol === 'admin') return null; // Admin

    if (this.permisosCache) return this.permisosCache;

    // Buscar perfil de vendedor vinculado
    const { data: vendedor } = await this.supabase
        .from('vendedores')
        .select('id')
        .eq('usuario_id', user.id)
        .maybeSingle();

    if (!vendedor) return [];

    // Cargar permisos
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

  async getPrimeraVistaAccesible(): Promise<string | null> {
    const permisos = await this.getPermisosUsuario();
    if (permisos === null) return 'dashboard'; // Admin

    const orden = ['ventas', 'caja', 'productos', 'clientes'];
    for (const vista of orden) {
      if (permisos.find(p => p.vista === vista && p.puede_ver)) return vista;
    }
    
    return permisos.find(p => p.puede_ver)?.vista || null;
  }

  // ==========================================
  // MÉTODOS DE COMPATIBILIDAD
  // ==========================================
  
  getVendedorTemp() {
    const user = this.currentUserSubject.value;
    if (user && user.rol === 'vendedor') {
        return user;
    }
    return null;
  }
  
  setVendedorTemp(vendedor: any) { /* No-op */ }
  
  async getCurrentUser(): Promise<any> { 
    return this.getCurrentAppUser(); 
  }
  
  async getCurrentUserName(): Promise<string> { 
    const u = await this.getCurrentAppUser(); 
    return u?.nombre || ''; 
  }
  
  async isUserVendedor(): Promise<boolean> { 
    return (await this.getCurrentUserRole()) === 'vendedor'; 
  }
  
  async isUserAdmin(): Promise<boolean> { 
    return (await this.getCurrentUserRole()) === 'admin'; 
  }
}