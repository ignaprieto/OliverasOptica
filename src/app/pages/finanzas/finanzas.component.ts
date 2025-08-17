import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe],
  templateUrl: './finanzas.component.html',
  styleUrl: './finanzas.component.css',
})
export class FinanzasComponent implements OnInit {
  // Formulario de carga
  fecha: string = new Date().toISOString().substring(0, 10);
  categoria: string = '';
  descripcion: string = '';
  monto: number = 0;

  // NUEVO: Almacenar ventas y recambios para reutilizar
  ventas: any[] = []; 
  recambios: any[] = []; 

  // Gastos
  gastos: any[] = [];
  gastosFiltrados: any[] = [];
  editandoId: string | null = null;

  // Filtros
  filtroMes: string = new Date().toISOString().substring(0, 7);
  filtroCategoria: string = '';

  // Finanzas
  totalVentas: number = 0;
  totalGastos: number = 0;
  gananciaNeta: number = 0;
  totalGastosHistorico: number = 0;
  totalGastosAnual: number = 0;
  promedioGastosMensual: number = 0;

  mostrarModal = false;
  gastoAEliminar: string | null = null;

  // Toast
  toastVisible = false;
  toastcolor = 'bg-green-600';
  toastMensaje = '';
  toastTipo: 'success' | 'error' = 'success';
  toastTimeout: any = null;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.cargarDatos();
  }

  // Muestra el modal de confirmación para eliminar un gasto
  mostrarModalEliminar(id: string) {
    this.gastoAEliminar = id;
    this.mostrarModal = true;
  }

  // Cierra el modal de eliminación
  cancelarEliminar() {
    this.mostrarModal = false;
    this.gastoAEliminar = null;
  }

  // Muestra una notificación de toast
  mostrarToast(mensaje: string, tipo: 'success' | 'error' = 'success') {
    this.toastMensaje = mensaje;
    this.toastTipo = tipo;
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastVisible = false;
    }, 2500);
  }

  // Confirma y elimina un gasto
  async confirmarEliminar() {
    if (!this.gastoAEliminar) return;

    const client = this.supabase.getClient();
    const { error } = await client
      .from('gastos')
      .delete()
      .eq('id', this.gastoAEliminar);

    if (!error) {
      this.gastos = this.gastos.filter((g) => g.id !== this.gastoAEliminar);
      this.aplicarFiltros();
      this.mostrarToast('Gasto eliminado correctamente', 'success');
    } else {
      this.mostrarToast('Error al eliminar gasto', 'error');
    }
    this.cancelarEliminar();
  }

  // Carga todas las ventas, recambios y gastos
  async cargarDatos() {
    const client = this.supabase.getClient();

    const [gastosRes, ventasRes, recambiosRes] = await Promise.all([
      client.from('gastos').select('*').order('fecha', { ascending: false }),
      client.from('ventas').select('total_final, fecha_venta'),
      client.from('recambios').select('diferencia_abonada, fecha_recambio'),
    ]);

    if (gastosRes.error) {
      console.error('Error al obtener gastos:', gastosRes.error.message);
      return;
    }
    this.gastos = gastosRes.data || [];

    if (ventasRes.error) {
      console.error('Error al obtener ventas:', ventasRes.error.message);
      return;
    }
    this.ventas = ventasRes.data || [];

    if (recambiosRes.error) {
      console.error('Error al obtener recambios:', recambiosRes.error.message);
      return;
    }
    this.recambios = recambiosRes.data || [];

    // Calcular total histórico de gastos
    this.totalGastosHistorico = this.gastos.reduce(
      (acc: number, g: any) => acc + g.monto, 0
    );

    // Calcular total anual y promedio mensual de gastos
    const year = new Date().getFullYear().toString();
    const gastosAnio = this.gastos.filter((g) => g.fecha?.startsWith(year));
    this.totalGastosAnual = gastosAnio.reduce((acc: number, g: any) => acc + g.monto, 0);
    const mesesConGastos = new Set(
      gastosAnio.map((g) => g.fecha?.substring(0, 7))
    );
    const cantidadMeses = mesesConGastos.size || 1;
    this.promedioGastosMensual = cantidadMeses > 0 ? Math.round(this.totalGastosAnual / cantidadMeses) : 0;

    // Aplicar los filtros actuales
    this.aplicarFiltros();
  }

  // Aplica los filtros a los datos cargados y recalcula los totales
  aplicarFiltros() {
    // 1. Filtrar y recalcular gastos
    const coincideMes = (item: any) => !this.filtroMes || item.fecha?.startsWith(this.filtroMes);
    const coincideCategoria = (g: any) =>
      g.categoria?.toLowerCase().includes(this.filtroCategoria.toLowerCase());

    this.gastosFiltrados = this.gastos.filter((g) => coincideMes(g) && coincideCategoria(g));
    this.totalGastos = this.gastosFiltrados.reduce((acc, g) => acc + g.monto, 0);

    // 2. Filtrar y recalcular ventas
    const ventasFiltradas = this.ventas.filter(
      (v) => !this.filtroMes || v.fecha_venta?.startsWith(this.filtroMes)
    );
    const totalVentas = ventasFiltradas.reduce(
      (acc, v) => acc + v.total_final, 0
    );

    // 3. Filtrar y recalcular ganancias por recambios
    const recambiosFiltrados = this.recambios.filter(
      (r) => !this.filtroMes || r.fecha_recambio?.startsWith(this.filtroMes)
    );
    const totalGananciaRecambios = recambiosFiltrados.reduce(
      (acc, r) => acc + (r.diferencia_abonada || 0), 0
    );

    // 4. Sumar ambos para el total de ingresos y calcular la ganancia neta
    this.totalVentas = totalVentas + totalGananciaRecambios;
    this.gananciaNeta = this.totalVentas - this.totalGastos;
  }

  // Agrega un nuevo gasto
 // En finanzas.component.ts

async agregarGasto() {
  // === CAMBIA ESTO ===
  if (!this.categoria || !this.descripcion || this.monto <= 0 || !this.fecha) {
    this.mostrarToast(
      'Por favor, completa todos los campos correctamente. El monto debe ser mayor a 0.',
      'error'
    );
    return;
  }
  // ===================

  const client = this.supabase.getClient();
  const { error } = await client.from('gastos').insert([
    {
      fecha: this.fecha,
      categoria: this.categoria,
      descripcion: this.descripcion,
      monto: this.monto,
    },
  ]);

  if (error) {
    console.error('Error al agregar gasto:', error.message);
    this.mostrarToast('Error al agregar gasto', 'error');
    return;
  }

  this.resetForm();
  await this.cargarDatos();
  this.mostrarToast('Gasto agregado correctamente', 'success');
}

  // Edita un gasto existente
  editarGasto(gasto: any) {
    this.editandoId = gasto.id;
    this.categoria = gasto.categoria;
    this.descripcion = gasto.descripcion;
  }

  // Guarda los cambios de un gasto editado
  async guardarEdicion() {
    if (!this.editandoId) return;

    const client = this.supabase.getClient();
    const { error } = await client
      .from('gastos')
      .update({ categoria: this.categoria, descripcion: this.descripcion })
      .eq('id', this.editandoId);

    if (error) {
      console.error('Error al editar gasto:', error.message);
      this.mostrarToast('Error al editar gasto', 'error');
      return;
    }

    this.resetForm();
    this.editandoId = null;
    await this.cargarDatos();
    this.mostrarToast('Gasto editado correctamente', 'success');
  }

  // Cancela la edición de un gasto
  cancelarEdicion() {
    this.editandoId = null;
    this.resetForm();
  }

  // Reinicia los campos del formulario
  resetForm() {
    this.categoria = '';
    this.descripcion = '';
    this.monto = 0;
    this.fecha = new Date().toISOString().substring(0, 10);
  }

  // Muestra todos los gastos y recalcula totales
  mostrarTodosLosGastos() {
    this.filtroMes = '';
    this.filtroCategoria = '';
    this.aplicarFiltros();
  }

  // Se desplaza al formulario y resalta los campos
  scrollToFormYResaltarInputs() {
    const form = document.getElementById('formularioGasto');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const inputs = ['categoria', 'descripcion', 'monto'];
    inputs.forEach((id) => {
      const input = document.querySelector(`.${id}`) as HTMLElement;
      if (input) {
        input.classList.add('destacar');
        setTimeout(() => input.classList.remove('destacar'), 2000);
      }
    });
  }
}