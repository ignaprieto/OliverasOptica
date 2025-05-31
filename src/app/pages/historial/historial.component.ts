import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';


@Component({
  selector: 'app-historial',
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe],
  standalone:true,
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css'
})
export class HistorialComponent implements OnInit{
ventas: any[] = [];
  ventasFiltradas: any[] = [];
  filtro: 'hoy' | '7dias' | '30dias' | 'todos' = 'hoy';
//filtro: 'hoy' | '7dias' | '30dias' = 'hoy';
  totalAcumulado: number = 0;
paginaActual = 1;
ventasPorPagina = 10;
   constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.cargarVentas();
  }

get ventasPaginadas() {
  const inicio = (this.paginaActual - 1) * this.ventasPorPagina;
  return this.ventas.slice(inicio, inicio + this.ventasPorPagina);
}

get totalPaginas() {
  return Math.ceil(this.ventas.length / this.ventasPorPagina);
}

cambiarPagina(pagina: number) {
  if (pagina >= 1 && pagina <= this.totalPaginas) {
    this.paginaActual = pagina;
  }
}

  async filtrar(f: 'hoy' | '7dias' | '30dias'| 'todos') {
    this.filtro = f;
    await this.cargarVentas();
  }

/*async cargarVentas() {
  const desde = this.calcularFechaDesde(this.filtro);

  const { data: ventas, error }: { data: any[] | null, error: any } = await this.supabase
    .getClient()
    .rpc('obtener_historial_completo');

  if (error) {
    console.error('Error al obtener historial:', error.message);
    return;
  }

  this.ventas = (ventas || [])
    .map(v => ({
      ...v,
      // Ajustamos -3 horas porque Supabase guarda en UTC
      fecha_venta: new Date(new Date(v.fecha_venta).getTime() - 3 * 60 * 60 * 1000)
    }))
    .filter(v => new Date(v.fecha_venta) >= new Date(desde));

  this.totalAcumulado = this.ventas.reduce((acc, v) => acc + Number(v.total_final), 0);
}*/

async cargarVentas() {
  const desde = this.calcularFechaDesde(this.filtro);

  const { data: ventas, error }: { data: any[] | null, error: any } = await this.supabase
    .getClient()
    .rpc('obtener_historial_completo');

  if (error) {
    console.error('Error al obtener historial:', error.message);
    return;
  }

  this.ventas = (ventas || []).map(v => ({
    ...v,
    // Ajustamos -3 horas porque Supabase guarda en UTC
    fecha_venta: new Date(new Date(v.fecha_venta).getTime() - 3 * 60 * 60 * 1000)
  }));

  if (desde) {
    this.ventas = this.ventas.filter(v => new Date(v.fecha_venta) >= new Date(desde));
  }

  this.totalAcumulado = this.ventas.reduce((acc, v) => acc + Number(v.total_final), 0);
}


/*private calcularFechaDesde(filtro: 'hoy' | '7dias' | '30dias'): string {
    const hoy = new Date();
    let desde: Date;

    switch (filtro) {
      case '7dias':
        desde = new Date(hoy.setDate(hoy.getDate() - 7));
        break;
      case '30dias':
        desde = new Date(hoy.setDate(hoy.getDate() - 30));
        break;
      default:
        // 'hoy'
        desde = new Date();
        desde.setHours(0, 0, 0, 0);
        break;
    }

    return desde.toISOString();
  }*/

    private calcularFechaDesde(filtro: 'hoy' | '7dias' | '30dias' | 'todos'): string | null {
  if (filtro === 'todos') return null;

  const hoy = new Date();
  let desde: Date;

  switch (filtro) {
    case '7dias':
      desde = new Date(hoy.setDate(hoy.getDate() - 7));
      break;
    case '30dias':
      desde = new Date(hoy.setDate(hoy.getDate() - 30));
      break;
    default:
      // 'hoy'
      desde = new Date();
      desde.setHours(0, 0, 0, 0);
      break;
  }

  return desde.toISOString();
}

}
