import { Injectable } from '@angular/core';
import { SupabaseService, AppUser } from './supabase.service';
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
    this.cargarPermisos();

    this.supabase.getClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        this.cargarPermisos();
      } else if (event === 'SIGNED_OUT') {
        this.permisosSubject.next([]);
      }
    });
  }

  async cargarPermisos() {
    const user: AppUser | null = await this.supabase.getCurrentAppUser();
    
    if (!user) {
      console.warn('PermisosService: No hay usuario activo.');
      this.permisosSubject.next([]);
      return;
    }

    // 1. Detección de ADMIN
    if (user.rol === 'admin') {
      this.permisosSubject.next([{ 
        vista: 'SUPER_ADMIN', 
        puede_ver: true, puede_crear: true, puede_editar: true, puede_eliminar: true 
      }]);
      return;
    }

    // 2. Lógica Vendedor
    const { data: vendedor } = await this.supabase.getClient()
      .from('vendedores')
      .select('id')
      .eq('usuario_id', user.id)
      .maybeSingle();

    if (!vendedor) {
      console.warn('⚠️ PermisosService: Usuario sin perfil de vendedor.');
      this.permisosSubject.next([]);
      return;
    }

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
    
    // Chequeo de Super Admin
    if (actuales.some(p => p.vista === 'SUPER_ADMIN')) return true;

    const permiso = actuales.find(p => p.vista === vista);
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