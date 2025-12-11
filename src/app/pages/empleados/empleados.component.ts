import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

// Interfaces
interface Vendedor {
  id: string;
  nombre: string;
  dni: string;
  activo: boolean;
  created_at: string;
}

interface Permiso {
  vista: string;
  label: string;
  tiene_acceso: boolean;
}

interface PermisoEmpleado {
  id?: string;
  empleado_id: string;
  vista: string;
  puede_ver: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

interface VistaDisponible {
  vista: string;
  label: string;
}

@Component({
  selector: 'app-empleados',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './empleados.component.html',
  styleUrls: ['./empleados.component.css']
})
export class EmpleadosComponent implements OnInit, OnDestroy {
  // Formulario
  nuevoNombre: string = '';
  nuevoDni: string = '';
  
  // Datos
  vendedores: Vendedor[] = [];
  
  // Estados UI
  isLoading: boolean = false;
  error: string | null = null;
  
  // SISTEMA DE TOAST (Corregido nombres para evitar colisión)
  isToastVisible: boolean = false; // Renombrado de mostrarToast a isToastVisible
  mensajeToast: string = '';       // Renombrado de mensaje a mensajeToast para claridad
  tipoMensajeToast: 'success' | 'error' | 'warning' = 'success'; // Renombrado
  private toastTimeout: any;
  
  // Modales
  showDeleteModal: boolean = false;
  vendedorAEliminar: Vendedor | null = null;

  showPermisosModal: boolean = false;
  empleadoSeleccionado: Vendedor | null = null;
  permisosEmpleado: Permiso[] = [];
  
  // Configuración
  readonly permisosDisponibles: VistaDisponible[] = [
    { vista: 'ventas', label: 'Ventas' },
    { vista: 'productos', label: 'Productos' },
    { vista: 'stock', label: 'Stock' },
    { vista: 'descuentos', label: 'Descuentos' },
    { vista: 'finanzas', label: 'Finanzas' },
    { vista: 'clientes', label: 'Clientes' },
    { vista: 'aumento', label: 'Aumento' },
    { vista: 'historial', label: 'Historial' },
    { vista: 'deposito', label: 'Depósito' },
    { vista: 'caja', label: 'Caja' }
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

  // --- LÓGICA DE FORMULARIO ---

  onDniInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const valorLimpio = input.value.replace(/\D/g, '').substring(0, 8);
    this.nuevoDni = valorLimpio;
    if (input.value !== valorLimpio) {
      input.value = valorLimpio;
    }
  }

  validarDni(): boolean {
    if (this.nuevoDni.length < 7) {
      this.mostrarToast('El DNI debe tener al menos 7 dígitos', 'warning');
      return false;
    }
    return true;
  }

  // --- TOAST SYSTEM (Método para llamar al toast) ---
  mostrarToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);

    this.mensajeToast = message;
    this.tipoMensajeToast = type;
    this.isToastVisible = true;

    this.toastTimeout = setTimeout(() => {
      this.cerrarToast();
    }, 3000);
  }

  cerrarToast(): void {
    this.isToastVisible = false;
  }

  // --- GESTIÓN DE DATOS ---

  async cargarVendedores(): Promise<void> {
    this.isLoading = true;
    try {
      const { data, error } = await this.supabase.getClient()
        .from('vendedores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.vendedores = (data as Vendedor[]) || [];
    } catch (error: unknown) {
      this.mostrarToast('Error al cargar vendedores', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async crearVendedor(): Promise<void> {
    if (!this.nuevoNombre.trim() || !this.nuevoDni) {
      this.mostrarToast('Nombre y DNI son obligatorios', 'warning');
      return;
    }

    if (!this.validarDni()) return;

    this.isLoading = true;
    
    try {
      const { data: vendedor, error: errorVendedor } = await this.supabase.getClient()
        .from('vendedores')
        .insert({
          nombre: this.nuevoNombre.trim(),
          dni: this.nuevoDni,
          activo: true,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (errorVendedor) throw errorVendedor;

      if (vendedor) {
        await this.supabase.getClient()
          .from('permisos_empleado')
          .insert({
            empleado_id: vendedor.id,
            vista: 'ventas',
            puede_ver: true,
            puede_crear: true,
            puede_editar: true,
            puede_eliminar: true
          });
      }

      this.mostrarToast(`Vendedor "${this.nuevoNombre}" creado`, 'success');
      this.nuevoNombre = '';
      this.nuevoDni = '';
      
      if (vendedor) {
        this.vendedores = [vendedor as Vendedor, ...this.vendedores];
      } else {
        await this.cargarVendedores();
      }

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      if (typeof msg === 'string' && msg.includes('duplicate')) {
         this.mostrarToast('Ya existe un vendedor con ese DNI', 'error');
      } else {
         this.mostrarToast('Error al crear vendedor', 'error');
      }
    } finally {
      this.isLoading = false;
    }
  }

  async toggleEstado(vendedor: Vendedor): Promise<void> {
    const estadoOriginal = vendedor.activo;
    vendedor.activo = !vendedor.activo;

    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .update({ activo: vendedor.activo })
        .eq('id', vendedor.id);

      if (error) throw error;

      const msg = vendedor.activo ? 'Activado' : 'Desactivado';
      this.mostrarToast(`Vendedor ${msg}`, 'success');

    } catch (error) {
      vendedor.activo = estadoOriginal;
      this.mostrarToast('No se pudo cambiar el estado', 'error');
    }
  }

  // --- ELIMINACIÓN ---

  confirmarEliminar(vendedor: Vendedor): void {
    this.vendedorAEliminar = vendedor;
    this.showDeleteModal = true;
  }

  cancelarEliminar(): void {
    this.showDeleteModal = false;
    this.vendedorAEliminar = null;
  }

  async eliminarVendedor(): Promise<void> {
    if (!this.vendedorAEliminar) return;

    const id = this.vendedorAEliminar.id;
    this.isLoading = true;
    
    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.vendedores = this.vendedores.filter(v => v.id !== id);
      
      this.mostrarToast('Vendedor eliminado', 'success');
      this.cancelarEliminar();

    } catch (error) {
      this.mostrarToast('Error al eliminar vendedor', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // --- PERMISOS ---

  async abrirModalPermisos(empleado: Vendedor): Promise<void> {
    this.empleadoSeleccionado = empleado;
    this.showPermisosModal = true;
    await this.cargarPermisosEmpleado();
  }

  cerrarModalPermisos(): void {
    this.showPermisosModal = false;
    this.empleadoSeleccionado = null;
    this.permisosEmpleado = [];
  }

  async cargarPermisosEmpleado(): Promise<void> {
    if (!this.empleadoSeleccionado) return;
    this.isLoading = true;
    
    try {
      const { data, error } = await this.supabase.getClient()
        .from('permisos_empleado')
        .select('vista, puede_ver')
        .eq('empleado_id', this.empleadoSeleccionado.id);

      if (error) throw error;

      const permisosDB = data || [];

      this.permisosEmpleado = this.permisosDisponibles.map(pd => {
        const existe = permisosDB.find((p: any) => p.vista === pd.vista);
        return {
          vista: pd.vista,
          label: pd.label,
          tiene_acceso: existe ? existe.puede_ver : (pd.vista === 'ventas')
        };
      });

    } catch (error) {
      this.mostrarToast('Error cargando permisos', 'error');
      this.cerrarModalPermisos();
    } finally {
      this.isLoading = false;
    }
  }

  async guardarPermisos(): Promise<void> {
    if (!this.empleadoSeleccionado) return;
    this.isLoading = true;
    
    try {
      const empleadoId = this.empleadoSeleccionado.id;
      const client = this.supabase.getClient();
      
      const { error: delError } = await client
        .from('permisos_empleado')
        .delete()
        .eq('empleado_id', empleadoId);
        
      if (delError) throw delError;

      const nuevosPermisos = this.permisosEmpleado
        .filter(p => p.tiene_acceso)
        .map(p => ({
          empleado_id: empleadoId,
          vista: p.vista,
          puede_ver: true,
          puede_crear: true,
          puede_editar: true,
          puede_eliminar: true
        }));

      if (nuevosPermisos.length > 0) {
        const { error: insError } = await client
          .from('permisos_empleado')
          .insert(nuevosPermisos);
          
        if (insError) throw insError;
      }

      this.mostrarToast('Permisos actualizados', 'success');
      this.cerrarModalPermisos();

    } catch (error) {
      this.mostrarToast('Error guardando permisos', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  togglePermiso(permiso: Permiso): void {
    permiso.tiene_acceso = !permiso.tiene_acceso;
  }
}