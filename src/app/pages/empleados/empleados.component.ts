import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-empleados',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './empleados.component.html',
  styleUrls: ['./empleados.component.css']
})
export class EmpleadosComponent implements OnInit {
  // Campos para el formulario
  nuevoNombre: string = '';
  nuevoDni: string = '';
  
  // Lista de vendedores
  vendedores: any[] = [];
  
  // Estado de carga y error
  isLoading: boolean = false;
  error: string | null = null;
  
  // Toast notifications
  toasts: Array<{id: number, message: string, type: 'success' | 'error' | 'warning'}> = [];
  private toastId = 0;
  
  // Modal de confirmación
  showDeleteModal: boolean = false;
  vendedorAEliminar: any = null;

  constructor(private supabase: SupabaseService, private router: Router, public themeService: ThemeService) {}

  async ngOnInit() {
    await this.cargarVendedores();
  }

  // Validar y formatear DNI (solo números, máximo 8 dígitos)
  onDniInput(event: any) {
    let valor = event.target.value;
    
    // Remover cualquier carácter que no sea número
    valor = valor.replace(/\D/g, '');
    
    // Limitar a 8 dígitos
    if (valor.length > 8) {
      valor = valor.substring(0, 8);
    }
    
    // Actualizar el valor
    this.nuevoDni = valor;
    event.target.value = valor;
  }

  // Validar DNI antes de enviar
  validarDni(): boolean {
    // Verificar que solo contenga números
    if (!/^\d+$/.test(this.nuevoDni)) {
      this.mostrarToast('El DNI solo debe contener números', 'warning');
      return false;
    }
    
    // Verificar longitud (típicamente 7-8 dígitos en Argentina)
    if (this.nuevoDni.length < 7 || this.nuevoDni.length > 8) {
      this.mostrarToast('El DNI debe tener entre 7 y 8 dígitos', 'warning');
      return false;
    }
    
    return true;
  }

  // Mostrar toast
  mostrarToast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
    const id = this.toastId++;
    this.toasts.push({ id, message, type });
    
    // Auto-remover después de 3 segundos
    setTimeout(() => {
      this.removerToast(id);
    }, 3000);
  }

  // Remover toast
  removerToast(id: number) {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
  }

  // Obtener vendedores desde la tabla
  async cargarVendedores() {
    this.isLoading = true;
    this.error = null;
    
    try {
      const { data, error } = await this.supabase.getClient()
        .from('vendedores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.vendedores = data || [];
    } catch (e: any) {
      this.error = 'Error al cargar vendedores';
      this.mostrarToast('Error al cargar vendedores', 'error');
      console.error(e);
    } finally {
      this.isLoading = false;
    }
  }

  // Crear un nuevo vendedor
  async crearVendedor() {
    if (!this.nuevoNombre || !this.nuevoDni) {
      this.mostrarToast('Nombre y DNI son obligatorios', 'warning');
      return;
    }

    // Validar DNI
    if (!this.validarDni()) {
      return;
    }

    this.isLoading = true;
    this.error = null;
    
    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .insert({
          nombre: this.nuevoNombre,
          dni: this.nuevoDni,
          activo: true,
          created_at: new Date()
        });

      if (error) throw error;

      this.mostrarToast(`Vendedor "${this.nuevoNombre}" agregado exitosamente`, 'success');
      
      // Limpiar inputs
      this.nuevoNombre = '';
      this.nuevoDni = '';
      
      // Recargar lista
      await this.cargarVendedores();
    } catch (e: any) {
      this.error = 'Error al crear vendedor';
      this.mostrarToast('Error al crear vendedor', 'error');
      console.error(e);
    } finally {
      this.isLoading = false;
    }
  }

  // Activar/Desactivar vendedor
  async toggleEstado(vendedor: any) {
    this.isLoading = true;
    this.error = null;
    
    try {
      const nuevoEstado = !vendedor.activo;
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .update({ activo: nuevoEstado })
        .eq('id', vendedor.id);

      if (error) throw error;

      // Actualizar en memoria
      vendedor.activo = nuevoEstado;
      
      const mensaje = nuevoEstado 
        ? `Vendedor "${vendedor.nombre}" activado` 
        : `Vendedor "${vendedor.nombre}" desactivado`;
      this.mostrarToast(mensaje, 'success');
    } catch (e: any) {
      this.error = 'Error al actualizar estado';
      this.mostrarToast('Error al actualizar estado del vendedor', 'error');
      console.error(e);
    } finally {
      this.isLoading = false;
    }
  }

  // Abrir modal de confirmación
  confirmarEliminar(vendedor: any) {
    this.vendedorAEliminar = vendedor;
    this.showDeleteModal = true;
  }

  // Cancelar eliminación
  cancelarEliminar() {
    this.showDeleteModal = false;
    this.vendedorAEliminar = null;
  }

  // Eliminar vendedor
  async eliminarVendedor() {
    if (!this.vendedorAEliminar) return;

    this.isLoading = true;
    this.error = null;
    const nombreVendedor = this.vendedorAEliminar.nombre;
    
    try {
      const { error } = await this.supabase.getClient()
        .from('vendedores')
        .delete()
        .eq('id', this.vendedorAEliminar.id);

      if (error) throw error;

      // Sacar de la lista en memoria
      this.vendedores = this.vendedores.filter(v => v.id !== this.vendedorAEliminar.id);
      
      this.mostrarToast(`Vendedor "${nombreVendedor}" eliminado exitosamente`, 'success');
      this.showDeleteModal = false;
      this.vendedorAEliminar = null;
    } catch (e: any) {
      this.error = 'Error al eliminar vendedor';
      this.mostrarToast('Error al eliminar vendedor', 'error');
      console.error(e);
    } finally {
      this.isLoading = false;
    }
  }
}