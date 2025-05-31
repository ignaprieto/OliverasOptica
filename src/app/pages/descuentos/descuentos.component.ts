import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { Descuento } from '../../models/descuento.model';
import { RouterModule } from '@angular/router';
@Component({
  selector: 'app-descuentos',
  imports: [CommonModule, FormsModule,RouterModule],
  standalone:true,
  templateUrl: './descuentos.component.html',
  styleUrl: './descuentos.component.css'
})
export class DescuentosComponent implements OnInit{
descuentos: Descuento[] = [];
  descuento: Descuento = this.nuevoDescuento();
  modo: 'agregar' | 'editar' = 'agregar';
  mensaje = '';
  error = '';
idAEliminar: string | null = null;
toastVisible = false;
toastMensaje = '';
mostrarConfirmacion: boolean = false;
  constructor(private supabase: SupabaseService) {}

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
    const { data, error } = await this.supabase.getClient().from('descuentos').select('*').order('fecha_creacion', { ascending: false });
    if (error) {
      console.error(error);
      this.error = 'Error al obtener los descuentos';
      return;
    }
    this.descuentos = data as Descuento[];
  }

  async guardarDescuento() {
    this.mensaje = '';
    this.error = '';

    if (!this.descuento.codigo || this.descuento.porcentaje == null) {
      this.error = 'Todos los campos son obligatorios';
      return;
    }

    if (this.modo === 'agregar') {
      const { error } = await this.supabase.getClient().from('descuentos').insert({
        codigo: this.descuento.codigo,
        porcentaje: this.descuento.porcentaje,
        activo: true
      });

      if (error) {
        this.error = 'Error al agregar el descuento: ' + error.message;
        return;
      }

      this.mensaje = 'Descuento agregado correctamente';
    } else if (this.modo === 'editar' && this.descuento.id) {
      const { error } = await this.supabase.getClient()
        .from('descuentos')
        .update({
          codigo: this.descuento.codigo,
          porcentaje: this.descuento.porcentaje
        })
        .eq('id', this.descuento.id);

      if (error) {
        this.error = 'Error al actualizar: ' + error.message;
        return;
      }

      this.mensaje = 'Descuento actualizado correctamente';
    }

    this.descuento = this.nuevoDescuento();
    this.modo = 'agregar';
    this.obtenerDescuentos();
  }

  editarDescuento(desc: Descuento) {
    this.descuento = { ...desc };
    this.modo = 'editar';
    this.mensaje = '';
    this.error = '';
  }

  cancelarEdicion() {
    this.descuento = this.nuevoDescuento();
    this.modo = 'agregar';
    this.mensaje = '';
    this.error = '';
  }

  async cambiarEstado(desc: Descuento) {
    const { error } = await this.supabase.getClient()
      .from('descuentos')
      .update({ activo: !desc.activo })
      .eq('id', desc.id);

    if (error) {
      this.error = 'Error al cambiar estado';
      return;
    }

    this.obtenerDescuentos();
  }

async confirmarEliminar() {
  const { error } = await this.supabase.getClient()
    .from('descuentos')
    .delete()
    .eq('id', this.idAEliminar);

  if (!error) {
    this.toastMensaje = 'Descuento eliminado correctamente.';
    this.toastVisible = true;
    this.mostrarConfirmacion = false;
    this.idAEliminar = '';
    await this.obtenerDescuentos();  // Re-cargar
    setTimeout(() => this.toastVisible = false, 2500);
  }
}

eliminarDescuento(id: string) {
  this.idAEliminar = id;
  this.mostrarConfirmacion = true; // ← corregido: antes usabas modalVisible
}


cancelarEliminar() {
  this.mostrarConfirmacion = false;
  this.idAEliminar = '';
}
}
