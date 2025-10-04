import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Descuento } from '../../models/descuento.model';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-descuentos',
  imports: [CommonModule, FormsModule, RouterModule],
  standalone: true,
  templateUrl: './descuentos.component.html',
  styleUrl: './descuentos.component.css'
})
export class DescuentosComponent implements OnInit {
  descuentos: Descuento[] = [];
  descuento: Descuento = this.nuevoDescuento();
  modo: 'agregar' | 'editar' = 'agregar';
  mensaje = '';
  error = '';
  idAEliminar: string | null = null;
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600'; 
  mostrarConfirmacion: boolean = false;

  constructor(private supabase: SupabaseService,
    public themeService: ThemeService) {}

  ngOnInit(): void {
    this.obtenerDescuentos();
  }

  nuevoDescuento(): Descuento {
    return {
      codigo: '',
      porcentaje: 0,
      activo: true,
    };
  }

  async obtenerDescuentos() {
    const { data, error } = await this.supabase.getClient()
      .from('descuentos')
      .select('*')
      .order('fecha_creacion', { ascending: false });
    
    if (error) {
      console.error(error);
      this.mostrarToast('Error al obtener los descuentos', 'bg-red-600');
      return;
    }
    this.descuentos = data as Descuento[];
  }

  // Función helper para mostrar toast
  mostrarToast(mensaje: string, color: string = 'bg-green-600') {
    this.toastMensaje = mensaje;
    this.toastColor = color;
    this.toastVisible = true;
    
    // Auto ocultar después de 3 segundos
    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }

  async guardarDescuento() {
    this.mensaje = '';
    this.error = '';

    // Validaciones
    if (!this.descuento.codigo.trim()) {
      this.mostrarToast('El código de descuento es obligatorio', 'bg-red-600');
      return;
    }

    if (this.descuento.porcentaje == null || this.descuento.porcentaje <= 0) {
      this.mostrarToast('El porcentaje debe ser mayor a 0', 'bg-red-600');
      return;
    }

    if (this.descuento.porcentaje > 100) {
      this.mostrarToast('El porcentaje no puede ser mayor a 100', 'bg-red-600');
      return;
    }

    try {
      if (this.modo === 'agregar') {
        // Verificar si el código ya existe
        const { data: existente } = await this.supabase.getClient()
          .from('descuentos')
          .select('id')
          .eq('codigo', this.descuento.codigo.trim().toUpperCase())
          .single();

        if (existente) {
          this.mostrarToast('El código de descuento ya existe', 'bg-red-600');
          return;
        }

        const { error } = await this.supabase.getClient()
          .from('descuentos')
          .insert({
            codigo: this.descuento.codigo.trim().toUpperCase(),
            porcentaje: this.descuento.porcentaje,
            activo: true
          });

        if (error) {
          console.error('Error al agregar:', error);
          this.mostrarToast('Error al agregar el descuento: ' + error.message, 'bg-red-600');
          return;
        }

        this.mostrarToast('Descuento agregado correctamente', 'bg-green-600');

      } else if (this.modo === 'editar' && this.descuento.id) {
        // Verificar si el código ya existe (excluyendo el actual)
        const { data: existente } = await this.supabase.getClient()
          .from('descuentos')
          .select('id')
          .eq('codigo', this.descuento.codigo.trim().toUpperCase())
          .neq('id', this.descuento.id)
          .single();

        if (existente) {
          this.mostrarToast('El código de descuento ya existe', 'bg-red-600');
          return;
        }

        const { error } = await this.supabase.getClient()
          .from('descuentos')
          .update({
            codigo: this.descuento.codigo.trim().toUpperCase(),
            porcentaje: this.descuento.porcentaje
          })
          .eq('id', this.descuento.id);

        if (error) {
          console.error('Error al actualizar:', error);
          this.mostrarToast('Error al actualizar: ' + error.message, 'bg-red-600');
          return;
        }

        this.mostrarToast('Descuento actualizado correctamente', 'bg-green-600');
      }

      // Limpiar formulario y recargar datos
      this.descuento = this.nuevoDescuento();
      this.modo = 'agregar';
      await this.obtenerDescuentos();

    } catch (error) {
      console.error('Error inesperado:', error);
      this.mostrarToast('Error inesperado al guardar el descuento', 'bg-red-600');
    }
  }

  editarDescuento(desc: Descuento) {
    this.descuento = { ...desc };
    this.modo = 'editar';
    this.mensaje = '';
    this.error = '';
    
    // Scroll hacia el formulario en dispositivos móviles
    const formulario = document.querySelector('form');
    if (formulario && window.innerWidth < 1024) {
      formulario.scrollIntoView({ behavior: 'smooth' });
    }
  }

  cancelarEdicion() {
    this.descuento = this.nuevoDescuento();
    this.modo = 'agregar';
    this.mensaje = '';
    this.error = '';
  }

  async cambiarEstado(desc: Descuento) {
    try {
      const { error } = await this.supabase.getClient()
        .from('descuentos')
        .update({ activo: !desc.activo })
        .eq('id', desc.id);

      if (error) {
        console.error('Error al cambiar estado:', error);
        this.mostrarToast('Error al cambiar estado del descuento', 'bg-red-600');
        return;
      }

      const accion = desc.activo ? 'desactivado' : 'activado';
      this.mostrarToast(`Descuento ${accion} correctamente`, 'bg-green-600');
      await this.obtenerDescuentos();

    } catch (error) {
      console.error('Error inesperado:', error);
      this.mostrarToast('Error inesperado al cambiar estado', 'bg-red-600');
    }
  }

  eliminarDescuento(id: string) {
    this.idAEliminar = id;
    this.mostrarConfirmacion = true;
  }

  async confirmarEliminar() {
    if (!this.idAEliminar) return;

    try {
      const { error } = await this.supabase.getClient()
        .from('descuentos')
        .delete()
        .eq('id', this.idAEliminar);

      if (error) {
        console.error('Error al eliminar:', error);
        this.mostrarToast('Error al eliminar el descuento', 'bg-red-600');
        return;
      }

      this.mostrarToast('Descuento eliminado correctamente', 'bg-red-600');
      this.mostrarConfirmacion = false;
      this.idAEliminar = null;
      await this.obtenerDescuentos();

    } catch (error) {
      console.error('Error inesperado:', error);
      this.mostrarToast('Error inesperado al eliminar', 'bg-red-600');
    }
  }

  cancelarEliminar() {
    this.mostrarConfirmacion = false;
    this.idAEliminar = null;
  }

  // Método para cerrar el toast manualmente
  cerrarToast() {
    this.toastVisible = false;
  }
}