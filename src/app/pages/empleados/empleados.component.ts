import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, WritableSignal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { PermisoDirective } from '../../directives/permiso.directive';

// --- INTERFACES ---
interface Vendedor {
  id: string;
  nombre: string;
  dni: string;
  email?: string; // ✅ Opcional porque no viene de la tabla vendedores
  activo: boolean;
  created_at: string;
  usuario_id?: string;
}

interface PermisoGestion {
  vista: string;
  label: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
}

interface PermisoDB {
  empleado_id: string;
  vista: string;
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

@Component({
  selector: 'app-empleados',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PermisoDirective],
  templateUrl: './empleados.component.html',
  styleUrls: ['./empleados.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush // ✅ OPTIMIZACIÓN 1: OnPush
})
export class EmpleadosComponent implements OnInit, OnDestroy {
  // ✅ OPTIMIZACIÓN 4: Selección explícita de columnas
  private readonly COLUMNAS_VENDEDOR = 'id, nombre, dni, activo, created_at, usuario_id';
  private readonly COLUMNAS_PERMISOS = 'empleado_id, vista, puede_ver, puede_crear, puede_editar, puede_eliminar';
  
  // ✅ OPTIMIZACIÓN 5: Paginación
  private readonly PAGE_SIZE = 20;
  private currentPage = 0;
  private hasMoreData = true;

  // ✅ OPTIMIZACIÓN 2: Migración a Signals
  // Formulario Creación
  nuevoNombre = signal('');
  nuevoDni = signal('');
  nuevoEmail = signal('');
  nuevoPassword = signal('');
  
  // Datos
  vendedores: WritableSignal<Vendedor[]> = signal([]);
  
  // Estados UI
  isLoading = signal(false);
  isLoadingMore = signal(false); // ✅ Nuevo: para scroll infinito
  isToastVisible = signal(false);
  mensajeToast = signal('');
  tipoMensajeToast: WritableSignal<'success' | 'error' | 'warning'> = signal('success');
  private toastTimeout: any;
  
  // Modales
  showDeleteModal = signal(false);
  vendedorAEliminar: WritableSignal<Vendedor | null> = signal(null);
  showPermisosModal = signal(false);
  empleadoSeleccionado: WritableSignal<Vendedor | null> = signal(null);
  showEditModal = signal(false);
  vendedorAEditar: WritableSignal<Vendedor | null> = signal(null);
  
  // Variables de Edición
  editNombre = signal('');
  editDni = signal('');
  editEmail = signal('');
  editPassword = signal('');

  // Matriz de permisos
  permisosGestion: WritableSignal<PermisoGestion[]> = signal([]);
  
  readonly vistasDelSistema = [
    { vista: 'ventas', label: 'Ventas' },
    { vista: 'productos', label: 'Productos' },
    { vista: 'stock', label: 'Stock' },
    { vista: 'descuentos', label: 'Descuentos' },
    { vista: 'finanzas', label: 'Finanzas' },
    { vista: 'clientes', label: 'Clientes' },
    { vista: 'aumento', label: 'Aumento' },
    { vista: 'historial', label: 'Historial' },
    { vista: 'deposito', label: 'Depósito' },
    { vista: 'caja', label: 'Caja' },
    { vista: 'configuracion', label: 'Configuración' },
    { vista: 'empleados', label: 'Empleados' }
  ];

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    public themeService: ThemeService
  ) {}

  ngOnInit(): void {
    this.cargarVendedores();
  }

  ngOnDestroy(): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  // ✅ OPTIMIZACIÓN 7: TrackBy para rendimiento
  trackByVendedorId(_index: number, item: Vendedor): string {
    return item.id;
  }

  trackByPermisoVista(_index: number, item: PermisoGestion): string {
    return item.vista;
  }

  // --- LÓGICA DE FORMULARIO ---
  onDniInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const valorLimpio = input.value.replace(/\D/g, '').substring(0, 8);
    this.nuevoDni.set(valorLimpio);
    if (input.value !== valorLimpio) input.value = valorLimpio;
  }

  mostrarToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.mensajeToast.set(message);
    this.tipoMensajeToast.set(type);
    this.isToastVisible.set(true);
    this.toastTimeout = setTimeout(() => this.cerrarToast(), 3000);
  }

  cerrarToast(): void {
    this.isToastVisible.set(false);
  }

  // --- GESTIÓN DE VENDEDORES ---
  async cargarVendedores(reset: boolean = true): Promise<void> {
    if (reset) {
      this.currentPage = 0;
      this.hasMoreData = true;
      this.isLoading.set(true);
    } else {
      this.isLoadingMore.set(true);
    }

    try {
      const from = this.currentPage * this.PAGE_SIZE;
      const to = from + this.PAGE_SIZE - 1;

      // ✅ OPTIMIZACIÓN 4 + 5: Columnas explícitas + paginación
      const { data, error } = await this.supabase.getClient()
        .from('vendedores')
        .select(this.COLUMNAS_VENDEDOR)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const newVendedores = (data as Vendedor[]) || [];
      
      if (newVendedores.length < this.PAGE_SIZE) {
        this.hasMoreData = false;
      }

      if (reset) {
        this.vendedores.set(newVendedores);
      } else {
        // ✅ Acumulación de datos en scroll infinito
        this.vendedores.update(current => [...current, ...newVendedores]);
      }

      this.currentPage++;
    } catch (error) {
      this.mostrarToast('Error al cargar vendedores', 'error');
    } finally {
      this.isLoading.set(false);
      this.isLoadingMore.set(false);
    }
  }

  // ✅ OPTIMIZACIÓN 5: Infinite Scroll
  onScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 100; // px antes del final
    const position = element.scrollTop + element.clientHeight;
    const height = element.scrollHeight;

    if (position > height - threshold && !this.isLoadingMore() && this.hasMoreData) {
      this.cargarVendedores(false);
    }
  }

  async crearVendedor(): Promise<void> {
    if (!this.nuevoNombre().trim() || !this.nuevoDni() || !this.nuevoEmail().trim() || !this.nuevoPassword()) {
      this.mostrarToast('Todos los campos son obligatorios', 'warning');
      return;
    }
    
    if (this.nuevoPassword().length < 6) {
      this.mostrarToast('La contraseña debe tener al menos 6 caracteres', 'warning');
      return;
    }

    this.isLoading.set(true);
    
    try {
      const { data, error } = await this.supabase.getClient().functions.invoke('crear-empleado', {
        body: {
          nombre: this.nuevoNombre().trim(),
          dni: this.nuevoDni(),
          email: this.nuevoEmail().trim(),
          password: this.nuevoPassword()
        }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Error al crear empleado');
      }

      this.mostrarToast('Empleado creado y vinculado correctamente', 'success');
      
      this.nuevoNombre.set('');
      this.nuevoDni.set('');
      this.nuevoEmail.set('');
      this.nuevoPassword.set('');

      this.cargarVendedores(true);

    } catch (error: any) {
      console.error('Error:', error);
      this.mostrarToast(error.message || 'Error desconocido', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleEstado(vendedor: Vendedor): Promise<void> {
    const estadoOriginal = vendedor.activo;
    vendedor.activo = !vendedor.activo;
    
    // Actualizar signal
    this.vendedores.update(current => 
      current.map(v => v.id === vendedor.id ? { ...v, activo: vendedor.activo } : v)
    );

    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .update({ activo: vendedor.activo })
        .eq('id', vendedor.id);
      if (error) throw error;
    } catch (error) {
      vendedor.activo = estadoOriginal;
      this.vendedores.update(current => 
        current.map(v => v.id === vendedor.id ? { ...v, activo: estadoOriginal } : v)
      );
      this.mostrarToast('Error al actualizar estado', 'error');
    }
  }

  confirmarEliminar(vendedor: Vendedor): void {
    this.vendedorAEliminar.set(vendedor);
    this.showDeleteModal.set(true);
  }

  cancelarEliminar(): void {
    this.showDeleteModal.set(false);
    this.vendedorAEliminar.set(null);
  }

  async eliminarVendedor(): Promise<void> {
    const vendedor = this.vendedorAEliminar();
    if (!vendedor) return;
    
    this.isLoading.set(true);
    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .delete()
        .eq('id', vendedor.id);

      if (error) throw error;
      
      this.vendedores.update(current => current.filter(v => v.id !== vendedor.id));
      this.mostrarToast('Vendedor eliminado', 'success');
      this.showDeleteModal.set(false);
    } catch (error) {
      this.mostrarToast('Error al eliminar', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- EDICIÓN DE DATOS ---
  abrirModalEditar(vendedor: Vendedor): void {
    this.vendedorAEditar.set(vendedor);
    this.editNombre.set(vendedor.nombre);
    this.editDni.set(vendedor.dni);
    this.editEmail.set(vendedor.email || '');
    this.editPassword.set('');
    this.showEditModal.set(true);
  }

  cerrarModalEditar(): void {
    this.showEditModal.set(false);
    this.vendedorAEditar.set(null);
    this.editNombre.set('');
    this.editDni.set('');
    this.editEmail.set('');
    this.editPassword.set('');
  }

  async actualizarVendedor(): Promise<void> {
    const vendedor = this.vendedorAEditar();
    if (!vendedor || !this.editNombre().trim() || !this.editDni()) return;

    if (this.editPassword() && this.editPassword().length < 6) {
      this.mostrarToast('La nueva contraseña debe tener 6+ caracteres', 'warning');
      return;
    }

    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.getClient().functions.invoke('actualizar-empleado', {
        body: {
          id: vendedor.id,
          usuario_id: vendedor.usuario_id,
          nombre: this.editNombre().trim(),
          dni: this.editDni(),
          email: this.editEmail().trim(),
          password: this.editPassword() || null
        }
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);

      this.vendedores.update(current => 
        current.map(v => v.id === vendedor.id 
          ? { ...v, nombre: this.editNombre().trim(), dni: this.editDni(), email: this.editEmail().trim() }
          : v
        )
      );

      this.mostrarToast('Datos actualizados correctamente', 'success');
      this.cerrarModalEditar();
    } catch (error: any) {
      console.error(error);
      this.mostrarToast(error.message || 'Error al actualizar', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  // --- GESTIÓN DE PERMISOS ---
  async abrirModalPermisos(empleado: Vendedor): Promise<void> {
    this.empleadoSeleccionado.set(empleado);
    this.showPermisosModal.set(true);
    await this.cargarPermisosEmpleado();
  }

  cerrarModalPermisos(): void {
    this.showPermisosModal.set(false);
    this.empleadoSeleccionado.set(null);
    this.permisosGestion.set([]);
  }

  async cargarPermisosEmpleado(): Promise<void> {
    const empleado = this.empleadoSeleccionado();
    if (!empleado) return;
    
    this.isLoading.set(true);

    try {
      // ✅ OPTIMIZACIÓN 4: Columnas explícitas
      const { data, error } = await this.supabase.getClient()
        .from('permisos_empleado')
        .select(this.COLUMNAS_PERMISOS)
        .eq('empleado_id', empleado.id);

      if (error) throw error;
      const permisosDB = (data as PermisoDB[]) || [];

      const permisos = this.vistasDelSistema.map(sys => {
        const pDB = permisosDB.find(p => p.vista === sys.vista);
        return {
          vista: sys.vista,
          label: sys.label,
          ver: pDB?.puede_ver || false,
          crear: pDB?.puede_crear || false,
          editar: pDB?.puede_editar || false,
          eliminar: pDB?.puede_eliminar || false
        };
      });

      this.permisosGestion.set(permisos);

    } catch (error) {
      this.mostrarToast('Error al cargar permisos', 'error');
      this.cerrarModalPermisos();
    } finally {
      this.isLoading.set(false);
    }
  }

  async guardarPermisos(): Promise<void> {
    const empleado = this.empleadoSeleccionado();
    if (!empleado) return;
    
    this.isLoading.set(true);

    try {
      const empleadoId = empleado.id;
      const client = this.supabase.getClient();

      const { error: delError } = await client
        .from('permisos_empleado')
        .delete()
        .eq('empleado_id', empleadoId);
      
      if (delError) throw delError;

      const permisosAGuardar = this.permisosGestion()
        .filter(p => p.ver)
        .map(p => ({
          empleado_id: empleadoId,
          vista: p.vista,
          puede_ver: p.ver,
          puede_crear: p.crear,
          puede_editar: p.editar,
          puede_eliminar: p.eliminar
        }));

      if (permisosAGuardar.length > 0) {
        const { error: insError } = await client
          .from('permisos_empleado')
          .insert(permisosAGuardar);
        
        if (insError) throw insError;
      }

      this.mostrarToast('Permisos actualizados correctamente', 'success');
      this.cerrarModalPermisos();

    } catch (error) {
      this.mostrarToast('Error al guardar permisos', 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ✅ Métodos helper para binding con ngModel en template
  updatePermisoVer(permiso: PermisoGestion, value: boolean): void {
    this.permisosGestion.update(current =>
      current.map(p => p.vista === permiso.vista ? { ...p, ver: value } : p)
    );
  }

  updatePermisoCrear(permiso: PermisoGestion, value: boolean): void {
    this.permisosGestion.update(current =>
      current.map(p => p.vista === permiso.vista ? { ...p, crear: value } : p)
    );
  }

  updatePermisoEditar(permiso: PermisoGestion, value: boolean): void {
    this.permisosGestion.update(current =>
      current.map(p => p.vista === permiso.vista ? { ...p, editar: value } : p)
    );
  }

  updatePermisoEliminar(permiso: PermisoGestion, value: boolean): void {
    this.permisosGestion.update(current =>
      current.map(p => p.vista === permiso.vista ? { ...p, eliminar: value } : p)
    );
  }
}