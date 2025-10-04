import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';

interface EstadisticasDia {
  ventasHoy: number;
  totalRecaudado: number;
  productosVendidos: number;
  ventaPromedio: number;
  stockBajo: number;
  sinStock: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  estadisticas: EstadisticasDia = {
    ventasHoy: 0,
    totalRecaudado: 0,
    productosVendidos: 0,
    ventaPromedio: 0,
    stockBajo: 0,
    sinStock: 0
  };

  cargando = true;

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService  // ✨ Agregar ThemeService
  ) {}

  ngOnInit() {
    this.cargarEstadisticas();
  }

  async cargarEstadisticas() {
    this.cargando = true;
    
    try {
      await Promise.all([
        this.obtenerVentasHoy(),
        this.obtenerProductosStockBajo()
      ]);
    } catch (error) {
      console.error('Error al cargar estadísticas:', error);
    } finally {
      this.cargando = false;
    }
  }

  async obtenerVentasHoy() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data, error } = await this.supabase.getClient()
      .from('ventas')
      .select('total_final, id')
      .gte('fecha_venta', hoy.toISOString());

    if (!error && data) {
      this.estadisticas.ventasHoy = data.length;
      this.estadisticas.totalRecaudado = data.reduce((sum, v) => sum + Number(v.total_final), 0);
      this.estadisticas.ventaPromedio = this.estadisticas.ventasHoy > 0 
        ? this.estadisticas.totalRecaudado / this.estadisticas.ventasHoy 
        : 0;

      // Obtener productos vendidos hoy
      await this.obtenerProductosVendidosHoy(data.map(v => v.id));
    }
  }

  async obtenerProductosVendidosHoy(ventasIds: string[]) {
    if (ventasIds.length === 0) return;

    const { data, error } = await this.supabase.getClient()
      .from('detalle_venta')
      .select('cantidad')
      .in('venta_id', ventasIds);

    if (!error && data) {
      this.estadisticas.productosVendidos = data.reduce((sum, d) => sum + d.cantidad, 0);
    }
  }

  async obtenerProductosStockBajo() {
    const { data, error } = await this.supabase.getClient()
      .from('productos')
      .select('cantidad_stock')
      .eq('activo', true);

    if (!error && data) {
      this.estadisticas.stockBajo = data.filter(p => p.cantidad_stock > 0 && p.cantidad_stock < 5).length;
      this.estadisticas.sinStock = data.filter(p => p.cantidad_stock === 0).length;
    }
  }
}