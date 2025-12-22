import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

export interface Permiso {
  vista: string;
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PermisosService {
  private permisosSubject = new BehaviorSubject<Permiso[]>([]);
  public permisos$ = this.permisosSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    // 1. Cargar inicial
    this.cargarPermisos();

    // 2. ESCUCHAR CAMBIOS DE SESIÓN (Login/Logout)
    // Esto es crítico para que al cambiar de usuario se actualicen los permisos
    this.supabase.getClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        this.cargarPermisos();
      } else if (event === 'SIGNED_OUT') {
        this.permisosSubject.next([]); // Limpiar permisos al salir
      }
    });
  }

  async cargarPermisos() {
    const user = await this.supabase.getCurrentUser();
    if (!user) {
      this.permisosSubject.next([]);
      return;
    }

    // 1. Verificar si es SUPER ADMIN por metadata
    const rol = user.user_metadata?.['rol'];
    if (rol === 'admin') {
      this.permisosSubject.next([{ 
        vista: 'SUPER_ADMIN', 
        puede_ver: true, 
        puede_crear: true, 
        puede_editar: true, 
        puede_eliminar: true 
      }]);
      return;
    }

    // 2. Buscar perfil de Vendedor vinculado
    // Ahora esto funcionará porque ya agregaste la columna usuario_id
    const { data: vendedor, error } = await this.supabase.getClient()
      .from('vendedores')
      .select('id')
      .eq('usuario_id', user.id)
      .maybeSingle(); // Usamos maybeSingle() para no lanzar error si es null

    if (!vendedor) {
      console.warn('Usuario autenticado pero sin perfil de vendedor vinculado.');
      this.permisosSubject.next([]);
      return;
    }

    // 3. Cargar permisos explícitos desde la tabla
    const { data: permisos } = await this.supabase.getClient()
      .from('permisos_empleado')
      .select('*')
      .eq('empleado_id', vendedor.id);

    if (permisos) {
      this.permisosSubject.next(permisos as Permiso[]);
    }
  }

  puede(vista: string, accion: 'ver' | 'crear' | 'editar' | 'eliminar'): boolean {
    const actuales = this.permisosSubject.value;
    
    // Acceso total para Admin
    if (actuales.some(p => p.vista === 'SUPER_ADMIN')) return true;

    const permiso = actuales.find(p => p.vista === vista);
    
    // Si no existe registro de permiso para esa vista, se asume falso
    if (!permiso) return false;

    switch (accion) {
      case 'ver': return permiso.puede_ver;
      case 'crear': return permiso.puede_crear;
      case 'editar': return permiso.puede_editar;
      case 'eliminar': return permiso.puede_eliminar;
      default: return false;
    }
  }
}