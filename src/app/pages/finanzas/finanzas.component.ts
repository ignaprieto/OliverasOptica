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
  ventas: any[] = []; // guardarlas para reutilizar

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

  mostrarModalEliminar(id: string) {
    this.gastoAEliminar = id;
    this.mostrarModal = true;
  }

  cancelarEliminar() {
    this.mostrarModal = false;
    this.gastoAEliminar = null;
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error' = 'success') {
    this.toastMensaje = mensaje;
    this.toastTipo = tipo;
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastVisible = false;
    }, 2500);
  }

  async confirmarEliminar() {
    if (!this.gastoAEliminar) return;

    const client = this.supabase.getClient();
    const { error } = await client
      .from('gastos')
      .delete()
      .eq('id', this.gastoAEliminar);

    if (!error) {
      // Elimina el gasto localmente
      this.gastos = this.gastos.filter((g) => g.id !== this.gastoAEliminar);
      this.aplicarFiltros();

      // Actualiza totales en la vista sin recargar desde la base
      this.totalGastosHistorico = this.gastos.reduce(
        (acc: number, g: any) => acc + g.monto,
        0
      );

      // Actualiza total anual y promedio mensual automáticamente
      const year = new Date().getFullYear().toString();
      const gastosAnio = this.gastos.filter((g) => g.fecha && g.fecha.startsWith(year));
      this.totalGastosAnual = gastosAnio.reduce((acc: number, g: any) => acc + g.monto, 0);
      const mesesConGastos = new Set(
        gastosAnio.map((g) => g.fecha.substring(0, 7))
      );
      const cantidadMeses = mesesConGastos.size || 1;
      this.promedioGastosMensual = cantidadMeses > 0 ? Math.round(this.totalGastosAnual / cantidadMeses) : 0;

      this.totalGastos = this.gastosFiltrados.reduce(
        (acc: number, g: any) => acc + g.monto,
        0
      );
      this.gananciaNeta = this.totalVentas - this.totalGastos;
      this.mostrarToast('Gasto eliminado correctamente', 'success');
    } else {
      this.mostrarToast('Error al eliminar gasto', 'error');
    }

    this.cancelarEliminar();
  }

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
    const client = this.supabase.getClient();

    // Cargar gastos
    const { data: gastos, error: errorGastos } = await client
      .from('gastos')
      .select('*')
      .order('fecha', { ascending: false });

    if (errorGastos) {
      console.error('Error al obtener gastos:', errorGastos.message);
      return;
    }

    this.gastos = gastos || [];

    // Total histórico (antes de filtrar)
    this.totalGastosHistorico = this.gastos.reduce(
      (acc: number, g: any) => acc + g.monto,
      0
    );

    // --- NUEVO: Calcular total anual y promedio mensual ---
    const year = new Date().getFullYear().toString();
    const gastosAnio = this.gastos.filter((g) => g.fecha && g.fecha.startsWith(year));
    this.totalGastosAnual = gastosAnio.reduce((acc: number, g: any) => acc + g.monto, 0);

    // Calcular meses únicos con gastos en el año
    const mesesConGastos = new Set(
      gastosAnio.map((g) => g.fecha.substring(0, 7))
    );
    const cantidadMeses = mesesConGastos.size || 1;
    this.promedioGastosMensual = cantidadMeses > 0 ? Math.round(this.totalGastosAnual / cantidadMeses) : 0;

    // Cargar ventas del mes
    const { data: ventas, error: errorVentas } = await client
      .from('ventas')
      .select('total_final, fecha_venta');

    if (errorVentas) {
      console.error('Error al obtener ventas:', errorVentas.message);
      return;
    }

    this.ventas = ventas || [];
    this.aplicarFiltros();
    // esto actualiza this.gastosFiltrados

    // Calcular total de gastos del mes filtrado
    this.totalGastos = this.gastosFiltrados.reduce(
      (acc: number, g: any) => acc + g.monto,
      0
    );

    const ventasDelMes = ventas?.filter((v: any) =>
      this.filtroMes ? (v.fecha_venta as string).startsWith(this.filtroMes) : true
    );

    this.totalVentas = ventasDelMes?.reduce(
      (acc: number, v: any) => acc + v.total_final,
      0
    ) ?? 0;

    // Calcular ganancia neta
    this.gananciaNeta = this.totalVentas - this.totalGastos;
    
  }

  aplicarFiltros() {
    const coincideMes = (g: any) => !this.filtroMes || g.fecha?.startsWith(this.filtroMes);
    const coincideCategoria = (g: any) =>
      g.categoria && g.categoria.toLowerCase().includes(this.filtroCategoria.toLowerCase());

    // Solo filtrar tabla según mes y categoría
    this.gastosFiltrados = this.gastos.filter(
      (g) => coincideMes(g) && coincideCategoria(g)
    );

    // Recalcular total gastos del mes
    const gastosDelMes = this.gastos.filter(coincideMes);
    this.totalGastos = gastosDelMes.reduce((acc, g) => acc + g.monto, 0);

    // Ventas del mes
    const ventasFiltradas = this.ventas.filter(
      (v) => !this.filtroMes || v.fecha_venta?.startsWith(this.filtroMes)
    );

    this.totalVentas = ventasFiltradas.reduce(
      (acc, v) => acc + v.total_final,
      0
    );

    this.gananciaNeta = this.totalVentas - this.totalGastos;
  }

  async agregarGasto() {
    if (!this.categoria || !this.descripcion || this.monto <= 0 || !this.fecha) return;

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
    this.aplicarFiltros();

    // Actualiza total anual y promedio mensual automáticamente
    const year = new Date().getFullYear().toString();
    const gastosAnio = this.gastos.filter((g) => g.fecha && g.fecha.startsWith(year));
    this.totalGastosAnual = gastosAnio.reduce((acc: number, g: any) => acc + g.monto, 0);
    const mesesConGastos = new Set(
      gastosAnio.map((g) => g.fecha.substring(0, 7))
    );
    const cantidadMeses = mesesConGastos.size || 1;
    this.promedioGastosMensual = cantidadMeses > 0 ? Math.round(this.totalGastosAnual / cantidadMeses) : 0;

    this.mostrarToast('Gasto agregado correctamente', 'success');
  }

  editarGasto(gasto: any) {
    this.editandoId = gasto.id;
    this.categoria = gasto.categoria;
    this.descripcion = gasto.descripcion;
  }

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
    this.aplicarFiltros();

    // Actualiza total anual y promedio mensual automáticamente
    const year = new Date().getFullYear().toString();
    const gastosAnio = this.gastos.filter((g) => g.fecha && g.fecha.startsWith(year));
    this.totalGastosAnual = gastosAnio.reduce((acc: number, g: any) => acc + g.monto, 0);
    const mesesConGastos = new Set(
      gastosAnio.map((g) => g.fecha.substring(0, 7))
    );
    const cantidadMeses = mesesConGastos.size || 1;
    this.promedioGastosMensual = cantidadMeses > 0 ? Math.round(this.totalGastosAnual / cantidadMeses) : 0;

    this.mostrarToast('Gasto editado correctamente', 'success');
  }

  cancelarEdicion() {
    this.editandoId = null;
    this.resetForm();
  }

  resetForm() {
    this.categoria = '';
    this.descripcion = '';
    this.monto = 0;
    this.fecha = new Date().toISOString().substring(0, 10);
  }

  mostrarTodosLosGastos() {
    this.filtroMes = '';
    this.filtroCategoria = '';
    this.gastosFiltrados = [...this.gastos];
    this.totalGastos = this.gastosFiltrados.reduce((acc: number, g: any) => acc + g.monto, 0);
    this.totalVentas = 0;
    this.gananciaNeta = -this.totalGastos;
  }

  scrollToFormYResaltarInputs() {
    const form = document.getElementById('formularioGasto');
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const inputs = ['categoria', 'descripcion', 'monto'];
    inputs.forEach(id => {
      const input = document.querySelector(`.${id}`) as HTMLElement;
      if (input) {
        input.classList.add('destacar');
        setTimeout(() => input.classList.remove('destacar'), 2000); // quitar luego del efecto
      }
    });
  }
}
