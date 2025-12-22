import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

// --- INTERFACES ---
interface Vendedor {
  id: string;
  nombre: string;
  dni: string;
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
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './empleados.component.html',
  styleUrls: ['./empleados.component.css']
})
export class EmpleadosComponent implements OnInit, OnDestroy {
  // Formulario
  nuevoNombre: string = '';
  nuevoDni: string = '';
  
  // ✅ VARIABLES AGREGADAS PARA LA CREACIÓN AUTOMÁTICA
  nuevoEmail: string = '';
  nuevoPassword: string = '';
  
  // Datos
  vendedores: Vendedor[] = [];
  
  // Estados UI
  isLoading: boolean = false;
  isToastVisible: boolean = false;
  mensajeToast: string = '';
  tipoMensajeToast: 'success' | 'error' | 'warning' = 'success';
  private toastTimeout: any;
  
  // Modales
  showDeleteModal: boolean = false;
  vendedorAEliminar: Vendedor | null = null;

  showPermisosModal: boolean = false;
  empleadoSeleccionado: Vendedor | null = null;
  
  showEditModal: boolean = false;
  vendedorAEditar: Vendedor | null = null;
  editNombre: string = '';
  editDni: string = '';

  // Matriz de permisos
  permisosGestion: PermisoGestion[] = [];
  
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

  // --- LÓGICA DE FORMULARIO ---
  onDniInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const valorLimpio = input.value.replace(/\D/g, '').substring(0, 8);
    this.nuevoDni = valorLimpio;
    if (input.value !== valorLimpio) input.value = valorLimpio;
  }

  validarDni(): boolean {
    if (this.nuevoDni.length < 7) {
      this.mostrarToast('El DNI debe tener al menos 7 dígitos', 'warning');
      return false;
    }
    return true;
  }

  mostrarToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.mensajeToast = message;
    this.tipoMensajeToast = type;
    this.isToastVisible = true;
    this.toastTimeout = setTimeout(() => this.cerrarToast(), 3000);
  }

  cerrarToast(): void {
    this.isToastVisible = false;
  }

  // --- GESTIÓN DE VENDEDORES ---
  async cargarVendedores(): Promise<void> {
    this.isLoading = true;
    try {
      const { data, error } = await this.supabase.getClient()
        .from('vendedores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.vendedores = (data as Vendedor[]) || [];
    } catch (error) {
      this.mostrarToast('Error al cargar vendedores', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async crearVendedor(): Promise<void> {
    // Validaciones
    if (!this.nuevoNombre.trim() || !this.nuevoDni || !this.nuevoEmail.trim() || !this.nuevoPassword) {
      this.mostrarToast('Todos los campos son obligatorios', 'warning');
      return;
    }
    
    if (this.nuevoPassword.length < 6) {
      this.mostrarToast('La contraseña debe tener al menos 6 caracteres', 'warning');
      return;
    }

    this.isLoading = true;
    
    try {
      // ============================================================
      // CAMBIO: USAR EDGE FUNCTION EN LUGAR DE RPC SQL
      // ============================================================
      const { data, error } = await this.supabase.getClient().functions.invoke('crear-empleado', {
        body: {
          nombre: this.nuevoNombre.trim(),
          dni: this.nuevoDni,
          email: this.nuevoEmail.trim(),
          password: this.nuevoPassword
        }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Error al crear empleado');
      }

      this.mostrarToast('Empleado creado y vinculado correctamente', 'success');
      
      // Limpiar
      this.nuevoNombre = '';
      this.nuevoDni = '';
      this.nuevoEmail = '';
      this.nuevoPassword = '';

      this.cargarVendedores();

    } catch (error: any) {
      console.error('Error:', error);
      this.mostrarToast(error.message || 'Error desconocido', 'error');
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
    } catch (error) {
      vendedor.activo = estadoOriginal;
      this.mostrarToast('Error al actualizar estado', 'error');
    }
  }

  confirmarEliminar(vendedor: Vendedor): void {
    this.vendedorAEliminar = vendedor;
    this.showDeleteModal = true;
  }

  cancelarEliminar(): void {
    this.showDeleteModal = false;
    this.vendedorAEliminar = null;
  }

  // --- EDICIÓN DE DATOS ---
  abrirModalEditar(vendedor: Vendedor): void {
    this.vendedorAEditar = vendedor;
    this.editNombre = vendedor.nombre;
    this.editDni = vendedor.dni;
    this.showEditModal = true;
  }

  cerrarModalEditar(): void {
    this.showEditModal = false;
    this.vendedorAEditar = null;
    this.editNombre = '';
    this.editDni = '';
  }

  async actualizarVendedor(): Promise<void> {
    if (!this.vendedorAEditar || !this.editNombre.trim() || !this.editDni) return;

    this.isLoading = true;
    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .update({
          nombre: this.editNombre.trim(),
          dni: this.editDni
        })
        .eq('id', this.vendedorAEditar.id);

      if (error) throw error;

      const index = this.vendedores.findIndex(v => v.id === this.vendedorAEditar!.id);
      if (index !== -1) {
        this.vendedores[index] = { 
          ...this.vendedores[index], 
          nombre: this.editNombre.trim(), 
          dni: this.editDni 
        };
      }

      this.mostrarToast('Datos actualizados correctamente', 'success');
      this.cerrarModalEditar();
    } catch (error) {
      this.mostrarToast('Error al actualizar vendedor', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  async eliminarVendedor(): Promise<void> {
    if (!this.vendedorAEliminar) return;
    this.isLoading = true;
    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .delete()
        .eq('id', this.vendedorAEliminar.id);

      if (error) throw error;
      this.vendedores = this.vendedores.filter(v => v.id !== this.vendedorAEliminar!.id);
      this.mostrarToast('Vendedor eliminado', 'success');
      this.showDeleteModal = false;
    } catch (error) {
      this.mostrarToast('Error al eliminar', 'error');
    } finally {
      this.isLoading = false;
    }
  }

  // --- GESTIÓN DE PERMISOS ---
  async abrirModalPermisos(empleado: Vendedor): Promise<void> {
    this.empleadoSeleccionado = empleado;
    this.showPermisosModal = true;
    await this.cargarPermisosEmpleado();
  }

  cerrarModalPermisos(): void {
    this.showPermisosModal = false;
    this.empleadoSeleccionado = null;
    this.permisosGestion = [];
  }

  async cargarPermisosEmpleado(): Promise<void> {
    if (!this.empleadoSeleccionado) return;
    this.isLoading = true;

    try {
      const { data, error } = await this.supabase.getClient()
        .from('permisos_empleado')
        .select('*')
        .eq('empleado_id', this.empleadoSeleccionado.id);

      if (error) throw error;
      const permisosDB = (data as PermisoDB[]) || [];

      this.permisosGestion = this.vistasDelSistema.map(sys => {
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

    } catch (error) {
      this.mostrarToast('Error al cargar permisos', 'error');
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

      const permisosAGuardar = this.permisosGestion
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
      this.isLoading = false;
    }
  }
}