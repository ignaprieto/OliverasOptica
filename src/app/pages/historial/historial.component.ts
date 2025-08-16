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
  filtro: 'hoy' | '7dias' | '30dias' | 'todos'| 'fechaEspecifica' = 'hoy';
  fechaEspecifica: string = '';
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

  async filtrar(f: 'hoy' | '7dias' | '30dias'| 'todos'| 'fechaEspecifica') {
    // CORRECCIÓN: Reiniciamos la paginación a la página 1 antes de filtrar
    this.paginaActual = 1;
    this.filtro = f;
    await this.cargarVentas();
  }

  async cargarVentas() {
    const { data: ventas, error }: { data: any[] | null, error: any } = await this.supabase
      .getClient()
      .rpc('obtener_historial_completo');

    if (error) {
      console.error('Error al obtener historial:', error.message);
      return;
    }

    let ventasProcesadas = (ventas || []).map(v => ({
      ...v,
      // Ajustamos la hora para que coincida con la zona horaria local (-3 horas)
      fecha_venta: new Date(new Date(v.fecha_venta).getTime() - 3 * 60 * 60 * 1000)
    }));

    switch (this.filtro) {
      case 'hoy':
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        ventasProcesadas = ventasProcesadas.filter(v => v.fecha_venta >= hoy);
        break;
      case '7dias':
        const hace7dias = new Date();
        hace7dias.setDate(hace7dias.getDate() - 7);
        ventasProcesadas = ventasProcesadas.filter(v => v.fecha_venta >= hace7dias);
        break;
      case '30dias':
        const hace30dias = new Date();
        hace30dias.setDate(hace30dias.getDate() - 30);
        ventasProcesadas = ventasProcesadas.filter(v => v.fecha_venta >= hace30dias);
        break;
      case 'fechaEspecifica':
        // CORRECCIÓN: Creamos un objeto Date en la zona horaria local
        const partesFecha = this.fechaEspecifica.split('-');
        const anio = parseInt(partesFecha[0], 10);
        const mes = parseInt(partesFecha[1], 10) - 1; // Meses en JS son 0-11
        const dia = parseInt(partesFecha[2], 10);

        const inicioDia = new Date(anio, mes, dia);
        const finDia = new Date(anio, mes, dia);
        finDia.setHours(23, 59, 59, 999);
        
        ventasProcesadas = ventasProcesadas.filter(v => v.fecha_venta >= inicioDia && v.fecha_venta <= finDia);
        break;
      case 'todos':
      default:
        // No se aplica ningún filtro
        break;
    }

    this.ventas = ventasProcesadas;
    this.totalAcumulado = this.ventas.reduce((acc, v) => acc + Number(v.total_final), 0);
  }
}
